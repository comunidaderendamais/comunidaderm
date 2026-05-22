import { getSupabaseClient } from './client.js';

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const mapProfileToUserPatch = (profile) => {
  if (!profile) return {};
  return {
    userId: profile.user_id || null,
    uuid: profile.id || null,
    id: profile.id || null,
    email: profile.email || null,
    username: profile.username || null,
    name: profile.name || null,
    country: profile.country || null,
    whatsapp: profile.whatsapp || null,
    rankKey: profile.rank_key || null,
    isAdmin: Boolean(profile.is_admin),
    blocked: Boolean(profile.blocked),
    balances: profile.balances || {},
    holdings: profile.holdings || {},
    quotaLots: Array.isArray(profile.quota_lots) ? profile.quota_lots : [],
    teamState: profile.team_state || {},
  };
};

const mapWalletsToUserPatch = (wallets) => {
  if (!wallets) return {};
  return {
    wallets: {
      usdtBep20: String(wallets.usdt_bep20 || ''),
      usdtTrc20: String(wallets.usdt_trc20 || ''),
      usdcArbitrum: String(wallets.usdc_arbitrum || ''),
    },
  };
};

const mapTxRowToTx = (row) => {
  const meta = row?.meta || {};
  const rawAmount = row?.amount_usd;
  const amount = safeNum(meta?.amount ?? rawAmount ?? 0);
  const at = String(meta?.at || row?.at || row?.created_at || new Date().toISOString());
  return {
    id: String(row?.external_id || meta?.id || row?.id || ''),
    at,
    kind: String(row?.kind || meta?.kind || ''),
    type: String(row?.type || meta?.type || ''),
    amount,
    payment: row?.payment || meta?.payment || null,
    status: row?.status || meta?.status || null,
    meta,
  };
};

export const fetchMyState = async ({ maxTransactions = 200 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', state: null };

  const { data, error } = await client.rpc('get_my_state', { max_transactions: maxTransactions });
  if (error) return { ok: false, error: error.message, state: null };

  const profile = data?.profile || null;
  const wallets = data?.wallets || null;
  const txRows = Array.isArray(data?.transactions) ? data.transactions : [];

  return {
    ok: true,
    error: null,
    state: {
      profile,
      wallets,
      transactions: txRows.map(mapTxRowToTx),
      userPatch: {
        ...mapProfileToUserPatch(profile),
        ...mapWalletsToUserPatch(wallets),
      },
    },
  };
};

export const persistMyState = async (user) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const payload = {
    user_id: user?.userId || null,
    rank_key: user?.rankKey || null,
    balances: user?.balances || {},
    holdings: user?.holdings || {},
    quota_lots: Array.isArray(user?.quotaLots) ? user.quotaLots : [],
    team_state: user?.teamState || {},
  };

  const { error } = await client.rpc('upsert_my_state', { payload });
  if (error) return { ok: false, error: error.message };

  const txs = Array.isArray(user?.transactions) ? user.transactions : [];
  const recent = txs.slice(-200);
  const { error: txError } = await client.rpc('upsert_my_transactions', { items: recent });
  if (txError) return { ok: false, error: txError.message };

  return { ok: true, error: null };
};

export const createMyPurchase = async ({ planKey, units, paymentCurrency, paymentNetwork, paymentId, invoiceId, orderId, bankId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const { data, error } = await client.rpc('create_purchase', {
    plan_key: String(planKey || '').trim(),
    units: Math.max(1, Number.parseInt(units || 1, 10)),
    payment_currency: String(paymentCurrency || '').trim(),
    payment_network: paymentNetwork ? String(paymentNetwork).trim() : null,
    payment_id: paymentId ? String(paymentId).trim() : null,
    invoice_id: invoiceId ? String(invoiceId).trim() : null,
    order_id: orderId ? String(orderId).trim() : null,
    bank_id: bankId ? String(bankId).trim() : null,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const attachNowpaymentsSnapshot = async ({ depositId, paymentSnapshot } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };

  const { data, error } = await client.rpc('attach_nowpayments_snapshot', {
    deposit_id: depositId ? String(depositId).trim() : null,
    payment_snapshot: paymentSnapshot && typeof paymentSnapshot === 'object' ? paymentSnapshot : {},
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const requestMyWithdraw = async ({ amountUsd, asset, network, address } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const { data, error } = await client.rpc('request_withdrawal', {
    amount_usd: safeNum(amountUsd || 0),
    asset: asset ? String(asset).trim() : null,
    network: network ? String(network).trim() : null,
    address: address ? String(address).trim() : null,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const requestMyDesistance = async ({ lotId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };
  const { data, error } = await client.rpc('request_desistance', { lot_id: String(lotId || '').trim() });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const renewMyLot = async ({ lotId, paymentCurrency, paymentNetwork, paymentId, invoiceId, orderId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };
  const { data, error } = await client.rpc('renew_lot', {
    lot_id: String(lotId || '').trim(),
    payment_currency: String(paymentCurrency || '').trim(),
    payment_network: paymentNetwork ? String(paymentNetwork).trim() : null,
    payment_id: paymentId ? String(paymentId).trim() : null,
    invoice_id: invoiceId ? String(invoiceId).trim() : null,
    order_id: orderId ? String(orderId).trim() : null,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const confirmMyNowpaymentsPayment = async ({ paymentId, invoiceId, orderId, paymentStatus, rawEvent } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };
  const { data, error } = await client.rpc('confirm_my_nowpayments_payment', {
    payment_id: String(paymentId || '').trim(),
    invoice_id: String(invoiceId || '').trim(),
    order_id: String(orderId || '').trim(),
    payment_status: paymentStatus ? String(paymentStatus).trim() : null,
    raw_event: rawEvent || {},
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};
