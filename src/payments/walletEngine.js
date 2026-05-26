import { createLot } from '../quota/quotaEngine';

export const WITHDRAW_FEE_USD = 2;

const round2 = (n) => Number(Number(n || 0).toFixed(2));
const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const normalizeTx = (tx) => ({
  id: String(tx?.id || ''),
  at: String(tx?.at || ''),
  kind: String(tx?.kind || ''),
  type: String(tx?.type || ''),
  amount: safeNum(tx?.amount || 0),
  payment: String(tx?.payment || ''),
  status: String(tx?.status || ''),
  meta: tx?.meta || {},
});

export const calcWithdrawNet = ({ amountUsd }) => {
  const amount = round2(Math.max(0, safeNum(amountUsd)));
  const feeUsd = round2(WITHDRAW_FEE_USD);
  const netUsd = round2(Math.max(0, amount - feeUsd));
  return { amountUsd: amount, feeUsd, netUsd };
};

export const requestWithdraw = ({ user, amountUsd, asset, network, address, now = new Date() }) => {
  const u = user || {};
  if (u?.blocked) return { ok: false, reason: 'Usuário bloqueado.' };

  const { amountUsd: amount, feeUsd, netUsd } = calcWithdrawNet({ amountUsd });
  if (amount < 10) return { ok: false, reason: 'Valor mínimo para saque é $10.' };
  if (netUsd <= 0) return { ok: false, reason: 'Valor de saque insuficiente após taxa fixa.' };

  const available = safeNum(u?.balances?.available || 0);
  if (available < amount) return { ok: false, reason: 'Saldo disponível insuficiente.' };

  const addr = String(address || '').trim();
  if (!addr) return { ok: false, reason: 'Carteira de recebimento não configurada.' };

  const nowIso = now.toISOString();
  const tx = normalizeTx({
    id: `${now.getTime()}-withdraw`,
    at: nowIso,
    kind: 'SAQUE',
    type: 'Solicitação de saque',
    amount: -amount,
    payment: `${String(asset || '').toUpperCase()} ${String(network || '').toUpperCase()}`.trim(),
    status: 'Solicitado',
    meta: { feeUsd, netUsd, address: addr },
  });

  const nextBalances = { ...(u?.balances || {}) };
  nextBalances.available = round2(available - amount);

  const nextUser = {
    ...u,
    balances: nextBalances,
    transactions: [tx, ...(Array.isArray(u?.transactions) ? u.transactions : [])],
  };

  return { ok: true, user: nextUser, tx };
};

export const settleNowpaymentsDeposit = ({
  user,
  depositTxId,
  nowpayStatus,
  now = new Date(),
  cycleMonths,
  renewWindowHours,
}) => {
  const u = user || {};
  const txs = Array.isArray(u?.transactions) ? u.transactions.map(normalizeTx) : [];
  const idx = txs.findIndex((t) => String(t.id) === String(depositTxId));
  if (idx < 0) return { ok: false, reason: 'Depósito não encontrado.' };

  const tx = txs[idx];
  if (String(tx.kind) !== 'DEPOSITO') return { ok: false, reason: 'Transação não é depósito.' };
  if (String(tx.status).toLowerCase() === 'confirmado') return { ok: true, user: u, updated: false };

  const status = String(nowpayStatus || '').trim().toLowerCase();
  const confirmed = ['finished', 'confirmed', 'paid', 'sending'].includes(status);
  if (!confirmed) return { ok: false, reason: `Status do pagamento: ${status || 'desconhecido'}` };

  const nowIso = now.toISOString();
  const nextTx = {
    ...tx,
    status: 'Confirmado',
    meta: { ...(tx.meta || {}), nowpaymentsStatus: status, confirmedAt: nowIso },
  };

  let nextUser = { ...u };
  const nextTxs = txs.slice();
  nextTxs[idx] = nextTx;
  nextUser.transactions = nextTxs;

  const purpose = String(tx?.meta?.purpose || '').toUpperCase();
  if (purpose === 'TOPUP') {
    const amount = safeNum(tx.amount || 0);
    const balances = { ...(nextUser?.balances || {}) };
    balances.available = round2(safeNum(balances.available || 0) + amount);
    nextUser.balances = balances;
    return { ok: true, user: nextUser, updated: true };
  }

  const purchaseTxId = String(tx?.meta?.purchaseTxId || '').trim();
  if (!purchaseTxId) return { ok: true, user: nextUser, updated: true };

  const buyIdx = nextTxs.findIndex((t) => String(t.id) === purchaseTxId);
  if (buyIdx < 0) return { ok: true, user: nextUser, updated: true };

  const buyTx = nextTxs[buyIdx];
  if (String(buyTx?.status || '').toLowerCase() === 'concluído') return { ok: true, user: nextUser, updated: true };

  const planKey = String(tx?.meta?.planKey || '').trim();
  const planTitle = String(tx?.meta?.planTitle || '').trim();
  const planPrice = safeNum(tx?.meta?.planPrice || 0);
  const quotasPerUnit = safeNum(tx?.meta?.quotasPerUnit || 0);
  const units = Math.max(1, Math.floor(safeNum(tx?.meta?.units || 1)));
  const total = round2(planPrice * units);

  const lot = createLot({
    planKey,
    planTitle,
    units,
    planPrice,
    quotasPerUnit,
    nowIso,
    cycleMonths,
    renewWindowHours,
  });

  const holdings = { ...(nextUser?.holdings || {}) };
  holdings[planKey] = safeNum(holdings[planKey] || 0) + units;

  const balances = { ...(nextUser?.balances || {}) };
  balances.invested = round2(safeNum(balances.invested || 0) + total);

  nextUser = {
    ...nextUser,
    holdings,
    balances,
    quotaLots: [lot, ...(Array.isArray(nextUser?.quotaLots) ? nextUser.quotaLots : [])],
  };

  nextTxs[buyIdx] = {
    ...buyTx,
    status: 'Concluído',
    payment: String(tx?.payment || buyTx?.payment || 'NOWPayments'),
    meta: { ...(buyTx?.meta || {}), depositTxId: tx.id, settledAt: nowIso },
  };
  nextUser.transactions = nextTxs;

  return { ok: true, user: nextUser, updated: true };
};

