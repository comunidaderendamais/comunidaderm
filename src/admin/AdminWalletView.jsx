import { useEffect, useMemo, useState } from 'react';
import { fetchNowpaymentStatus } from '../payments/nowpaymentsClient';
import { WITHDRAW_FEE_USD } from '../payments/walletEngine';
import { adminGetUserState, adminListTransactions, adminPostAdjustment, adminSetBlocked, adminSettleNowpaymentsPayment, adminUpsertUserState } from '../supabase/adminRepo.js';

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const round2 = (n) => Number(Number(n || 0).toFixed(2));

const formatMoney = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso || '');
  }
};

const isSettledTransactionStatus = (value) => {
  const normalized = String(value || '').trim().toLowerCase();
  return ['concluído', 'concluido', 'confirmado', 'creditado'].includes(normalized);
};

const lotSourceMatchesPayment = (lot, paymentId = '', depositTxId = '') => {
  const source = lot?.source || {};
  const sourcePaymentId = String(source?.paymentId || '').trim();
  const sourceDepositTxId = String(source?.depositTxId || '').trim();
  return (
    (paymentId && sourcePaymentId === String(paymentId || '').trim()) ||
    (depositTxId && sourceDepositTxId === String(depositTxId || '').trim())
  );
};

const matchUser = (u, q) => {
  const s = String(q || '').trim().toLowerCase();
  if (!s) return true;
  const email = String(u?.email || '').toLowerCase();
  const username = String(u?.username || '').toLowerCase();
  const userId = String(u?.userId || '').toLowerCase();
  const uuid = String(u?.uuid || u?.id || '').toLowerCase();
  return email.includes(s) || username.includes(s) || userId.includes(s) || uuid.includes(s);
};

const copyToClipboard = async (text) => {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    return true;
  } catch {
    return false;
  }
};

export default function AdminWalletView({ config }) {
  const [tab, setTab] = useState('deposit');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [hashByTx, setHashByTx] = useState({});
  const [paymentIdByTx, setPaymentIdByTx] = useState({});
  const [depositRows, setDepositRows] = useState([]);
  const [withdrawRows, setWithdrawRows] = useState([]);
  const [teRows, setTeRows] = useState([]);
  const [residualRows, setResidualRows] = useState([]);
  const [dailyRows, setDailyRows] = useState([]);
  const [adjustUserId, setAdjustUserId] = useState('');
  const [adjustKind, setAdjustKind] = useState('TE');
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustType, setAdjustType] = useState('');

  const loadRows = async () => {
    const q = String(query || '').trim();
    const [dep, wd, te, residual, daily] = await Promise.all([
      adminListTransactions({ kind: 'DEPOSITO', q, maxRows: 300 }),
      adminListTransactions({ kind: 'SAQUE', q, maxRows: 300 }),
      adminListTransactions({ kind: 'TE', q, maxRows: 300 }),
      adminListTransactions({ kind: 'RESIDUAL', q, maxRows: 300 }),
      adminListTransactions({ kind: 'DAILY', q, maxRows: 300 }),
    ]);
    setDepositRows(dep.ok ? dep.rows : []);
    setWithdrawRows(wd.ok ? wd.rows : []);
    setTeRows(te.ok ? te.rows : []);
    setResidualRows(residual.ok ? residual.rows : []);
    setDailyRows(daily.ok ? daily.rows : []);
  };

  useEffect(() => {
    loadRows();
  }, [refresh, query]);

  const deposits = useMemo(() => {
    return depositRows
      .map((r) => ({
        id: String(r?.external_id || r?.id || ''),
        at: r?.at || r?.created_at || null,
        status: r?.status || r?.meta?.status || null,
        amount: safeNum(r?.meta?.amount ?? r?.amount_usd ?? 0),
        type: r?.type || r?.meta?.type || null,
        payment: r?.payment || r?.meta?.payment || null,
        paymentId: r?.meta?.paymentId || '',
        userEmail: String(r?.email || '').toLowerCase(),
        username: String(r?.username || r?.email || '—'),
        profileId: r?.profile_id,
      }))
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }, [depositRows]);

  const withdrawals = useMemo(() => {
    return withdrawRows
      .map((r) => {
        const amount = Math.abs(safeNum(r?.meta?.amount ?? r?.amount_usd ?? 0));
        const feeUsd = safeNum(r?.meta?.feeUsd || WITHDRAW_FEE_USD);
        const netUsd = safeNum(r?.meta?.netUsd || Math.max(0, amount - feeUsd));
        return {
          id: String(r?.external_id || r?.id || ''),
          at: r?.at || r?.created_at || null,
          status: r?.status || r?.meta?.status || null,
          amount,
          feeUsd,
          netUsd,
          type: r?.type || r?.meta?.type || null,
          payment: r?.payment || r?.meta?.payment || null,
          address: r?.meta?.address || '',
          hash: r?.meta?.hash || '',
          userEmail: String(r?.email || '').toLowerCase(),
          username: String(r?.username || r?.email || '—'),
          blocked: Boolean(r?.blocked),
          profileId: r?.profile_id,
        };
      })
      .sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }, [withdrawRows]);

  const mapCommRow = (r) => ({
    id: String(r?.external_id || r?.id || ''),
    at: r?.at || r?.created_at || null,
    status: r?.status || r?.meta?.status || null,
    kind: String(r?.kind || r?.meta?.kind || ''),
    amount: safeNum(r?.meta?.amount ?? r?.amount_usd ?? 0),
    type: r?.type || r?.meta?.type || null,
    userEmail: String(r?.email || '').toLowerCase(),
    username: String(r?.username || r?.email || '—'),
    profileId: r?.profile_id,
    meta: r?.meta || {},
  });

  const teList = useMemo(() => teRows.map(mapCommRow).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))), [teRows]);
  const residualList = useMemo(
    () => residualRows.map(mapCommRow).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))),
    [residualRows]
  );
  const dailyList = useMemo(() => dailyRows.map(mapCommRow).sort((a, b) => String(b.at || '').localeCompare(String(a.at || ''))), [dailyRows]);

  const submitAdjustment = async () => {
    try {
      if (busy) return;
      setBusy(true);
      const userId = String(adjustUserId || '').trim();
      if (!userId) {
        alert('Informe o profileId (uuid).');
        return;
      }
      const amountUsd = Number(adjustAmount || 0);
      if (!Number.isFinite(amountUsd) || amountUsd === 0) {
        alert('Informe um valor diferente de zero.');
        return;
      }
      const res = await adminPostAdjustment({
        userId,
        kind: String(adjustKind || 'AJUSTE').toUpperCase(),
        amountUsd,
        type: String(adjustType || '').trim() || 'Ajuste (Admin)',
        meta: { reason: 'manual' },
      });
      if (!res.ok) {
        alert(res.error);
        return;
      }
      setAdjustAmount('');
      setAdjustType('');
      setRefresh((s) => s + 1);
      await loadRows();
      alert('Ajuste registrado.');
    } finally {
      setBusy(false);
    }
  };

  const verifyDeposit = async (item) => {
    try {
      if (busy) return;
      if (isSettledTransactionStatus(item?.status)) {
        alert('Este depósito já está concluído.');
        return;
      }
      setBusy(true);
      const paymentId = String(paymentIdByTx[item.id] ?? item.paymentId ?? '').trim();
      if (!paymentId) {
        alert('Informe o paymentId.');
        return;
      }
      const stateRes = await adminGetUserState({ userId: item.profileId, maxTransactions: 800 });
      if (!stateRes.ok || !stateRes.user) {
        alert('Usuário não encontrado.');
        return;
      }
      const u = stateRes.user;
      const existingLots = Array.isArray(u?.quotaLots) ? u.quotaLots : [];
      const alreadyApplied = existingLots.some((lot) => lotSourceMatchesPayment(lot, paymentId, item.id));
      if (alreadyApplied) {
        setRefresh((s) => s + 1);
        await loadRows();
        alert('Este depósito já está concluído.');
        return;
      }
      const txs = Array.isArray(u?.transactions) ? u.transactions : [];
      const nextTxs = txs.map((t) =>
        String(t?.id || '') === String(item.id) ? { ...t, meta: { ...(t?.meta || {}), paymentId } } : t
      );
      const withPid = { ...u, transactions: nextTxs };

      const nowRes = await fetchNowpaymentStatus({ paymentId });
      if (!nowRes.ok) {
        alert(`NOWPayments: ${nowRes.reason}`);
        return;
      }
      const savePidRes = await adminUpsertUserState({ userId: item.profileId, user: withPid });
      if (!savePidRes.ok) {
        alert(savePidRes.error);
        return;
      }

      const settled = await adminSettleNowpaymentsPayment({
        paymentId,
        paymentStatus: nowRes.status,
        rawEvent: nowRes.data || {},
      });
      if (!settled.ok || !settled.data?.ok) {
        alert(settled.error || settled.data?.reason || 'Falha ao processar depósito.');
        return;
      }
      setRefresh((s) => s + 1);
      await loadRows();
      alert('Depósito verificado.');
    } finally {
      setBusy(false);
    }
  };

  const approveWithdraw = async (item) => {
    const stateRes = await adminGetUserState({ userId: item.profileId, maxTransactions: 800 });
    if (!stateRes.ok || !stateRes.user) {
      alert('Usuário não encontrado.');
      return;
    }
    const u = stateRes.user;
    const txs = Array.isArray(u?.transactions) ? u.transactions : [];
    const nextTxs = txs.map((t) => (String(t?.id || '') === String(item.id) ? { ...t, status: 'Aprovado' } : t));
    const saveRes = await adminUpsertUserState({ userId: item.profileId, user: { ...u, transactions: nextTxs } });
    if (!saveRes.ok) {
      alert(saveRes.error);
      return;
    }
    setRefresh((s) => s + 1);
    await loadRows();
  };

  const refuseWithdraw = async (item) => {
    const stateRes = await adminGetUserState({ userId: item.profileId, maxTransactions: 800 });
    if (!stateRes.ok || !stateRes.user) {
      alert('Usuário não encontrado.');
      return;
    }
    const u = stateRes.user;
    const txs = Array.isArray(u?.transactions) ? u.transactions : [];
    const tx = txs.find((t) => String(t?.id || '') === String(item.id));
    if (!tx) {
      alert('Saque não encontrado.');
      return;
    }
    const amount = Math.abs(safeNum(tx?.amount || 0));
    const balances = { ...(u?.balances || {}) };
    balances.available = round2(safeNum(balances.available || 0) + amount);
    const nextTxs = txs.map((t) => (String(t?.id || '') === String(item.id) ? { ...t, status: 'Recusado' } : t));
    const updated = { ...u, balances, transactions: nextTxs };
    const saveRes = await adminUpsertUserState({ userId: item.profileId, user: updated });
    if (!saveRes.ok) {
      alert(saveRes.error);
      return;
    }
    setRefresh((s) => s + 1);
    await loadRows();
  };

  const blockUser = async (item) => {
    const res = await adminSetBlocked({ userId: item.profileId, blocked: true });
    if (!res.ok) {
      alert(res.error);
      return;
    }
    setRefresh((s) => s + 1);
    await loadRows();
  };

  const confirmPaid = async (item) => {
    const hash = String(hashByTx[item.id] ?? '').trim();
    if (!hash) {
      alert('Informe a hash do envio.');
      return;
    }
    const stateRes = await adminGetUserState({ userId: item.profileId, maxTransactions: 800 });
    if (!stateRes.ok || !stateRes.user) {
      alert('Usuário não encontrado.');
      return;
    }
    const u = stateRes.user;
    const txs = Array.isArray(u?.transactions) ? u.transactions : [];
    const nextTxs = txs.map((t) =>
      String(t?.id || '') === String(item.id) ? { ...t, status: 'Pago', meta: { ...(t?.meta || {}), hash, paidAt: new Date().toISOString() } } : t
    );
    const saveRes = await adminUpsertUserState({ userId: item.profileId, user: { ...u, transactions: nextTxs } });
    if (!saveRes.ok) {
      alert(saveRes.error);
      return;
    }
    setRefresh((s) => s + 1);
    await loadRows();
    setHashByTx((s) => ({ ...s, [item.id]: '' }));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-gray-900">Carteira</h3>
            <p className="text-sm text-gray-500 mt-1">Depósitos (NOWPayments) e Saques (manual com hash).</p>
          </div>
          <div className="w-full lg:w-[420px]">
            <label className="text-xs font-black text-gray-600">Buscar usuário</label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="login, e-mail, userId..."
              className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
            />
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('deposit')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'deposit' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white text-gray-800 border-gray-200 hover:border-[#00FF00]'}`}
          >
            Depósito
          </button>
          <button
            type="button"
            onClick={() => setTab('withdraw')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'withdraw' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white text-gray-800 border-gray-200 hover:border-[#00FF00]'}`}
          >
            Saque
          </button>
          <button
            type="button"
            onClick={() => setTab('commissions')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'commissions' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white text-gray-800 border-gray-200 hover:border-[#00FF00]'}`}
          >
            TE / Residual
          </button>
          <button
            type="button"
            onClick={() => setTab('daily')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'daily' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white text-gray-800 border-gray-200 hover:border-[#00FF00]'}`}
          >
            Diário
          </button>
        </div>
      </div>

      {tab === 'deposit' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <p className="text-sm font-black text-gray-900">Depósitos</p>
            <p className="text-xs text-gray-500 mt-1">Use “Verificar” para forçar consulta na NOWPayments.</p>
          </div>
          <div className="p-5 space-y-3">
            {deposits.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum depósito encontrado.</p>
            ) : (
              deposits.slice(0, 50).map((d) => (
                <div key={d.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900 truncate">{d.type}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        @{d.username} • {d.userEmail} • {formatDateTime(d.at)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Valor: <span className="font-black text-gray-800">{formatMoney(d.amount)}</span>
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                      {d.status || '—'}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-8">
                      <label className="block text-xs font-black text-gray-600">paymentId</label>
                      <input
                        value={String(paymentIdByTx[d.id] ?? d.paymentId ?? '')}
                        onChange={(e) => setPaymentIdByTx((s) => ({ ...s, [d.id]: e.target.value }))}
                        placeholder="Cole o paymentId da NOWPayments"
                        className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                      />
                    </div>
                    <div className="lg:col-span-4 flex items-end gap-2">
                      <button
                        type="button"
                        disabled={busy || isSettledTransactionStatus(d?.status)}
                        onClick={() => verifyDeposit(d)}
                        className={`w-full px-4 py-3 rounded-xl font-black ${busy || isSettledTransactionStatus(d?.status) ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
                      >
                        Verificar
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'withdraw' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <p className="text-sm font-black text-gray-900">Saques</p>
            <p className="text-xs text-gray-500 mt-1">Taxa fixa: ${WITHDRAW_FEE_USD}. Aprovação manual com hash.</p>
          </div>
          <div className="p-5 space-y-3">
            {withdrawals.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum saque encontrado.</p>
            ) : (
              withdrawals.slice(0, 50).map((w) => (
                <div key={w.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900 truncate">{w.type}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        @{w.username} • {w.userEmail} • {formatDateTime(w.at)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">Pagamento: <span className="font-black text-gray-800">{w.payment || '—'}</span></p>
                      <p className="mt-1 text-xs text-gray-500">
                        Valor: <span className="font-black text-gray-800">{formatMoney(w.amount)}</span> • Taxa: {formatMoney(w.feeUsd)} • Enviar:{' '}
                        <span className="font-black text-gray-900">{formatMoney(w.netUsd)}</span>
                      </p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => copyToClipboard(w.address)}
                          className="px-3 py-1 rounded-full text-xs font-black border border-gray-200 bg-white text-gray-800"
                        >
                          Copiar carteira
                        </button>
                        <button
                          type="button"
                          onClick={() => copyToClipboard(String(w.netUsd))}
                          className="px-3 py-1 rounded-full text-xs font-black border border-gray-200 bg-white text-gray-800"
                        >
                          Copiar valor
                        </button>
                        {w.blocked && (
                          <span className="px-3 py-1 rounded-full text-xs font-black border border-red-200 bg-red-50 text-red-700">
                            Usuário bloqueado
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                      {w.status || '—'}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 lg:grid-cols-12 gap-3">
                    <div className="lg:col-span-7">
                      <label className="block text-xs font-black text-gray-600">Hash do envio (após pagar)</label>
                      <input
                        value={String(hashByTx[w.id] ?? '')}
                        onChange={(e) => setHashByTx((s) => ({ ...s, [w.id]: e.target.value }))}
                        placeholder="Cole a hash da transação"
                        className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                      />
                    </div>
                    <div className="lg:col-span-5 flex items-end gap-2">
                      <button
                        type="button"
                        onClick={() => approveWithdraw(w)}
                        className="w-full px-4 py-3 rounded-xl font-black bg-white border border-gray-200 text-gray-800 hover:border-[#00FF00]"
                      >
                        Aprovar
                      </button>
                      <button
                        type="button"
                        onClick={() => refuseWithdraw(w)}
                        className="w-full px-4 py-3 rounded-xl font-black bg-white border border-gray-200 text-gray-800 hover:border-red-400"
                      >
                        Recusar
                      </button>
                      <button
                        type="button"
                        onClick={() => blockUser(w)}
                        className="w-full px-4 py-3 rounded-xl font-black bg-red-600 text-white hover:bg-red-700"
                      >
                        Bloquear
                      </button>
                    </div>
                  </div>

                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => confirmPaid(w)}
                      className="w-full px-4 py-3 rounded-xl font-black bg-[#8A2BE2] text-white hover:bg-purple-600"
                    >
                      Confirmar pago (registrar hash)
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {tab === 'commissions' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <p className="text-sm font-black text-gray-900">TE e Residual</p>
            <p className="text-xs text-gray-500 mt-1">Listagem e ajuste manual (crédito/débito) por usuário.</p>
          </div>
          <div className="p-5 space-y-6">
            <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
              <p className="text-sm font-black text-gray-900">Ajuste rápido</p>
              <div className="mt-3 grid grid-cols-1 lg:grid-cols-12 gap-3">
                <div className="lg:col-span-5">
                  <label className="block text-xs font-black text-gray-600">profileId (uuid)</label>
                  <input
                    value={adjustUserId}
                    onChange={(e) => setAdjustUserId(e.target.value)}
                    placeholder="Cole o uuid do usuário"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                  />
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-xs font-black text-gray-600">Tipo</label>
                  <select
                    value={adjustKind}
                    onChange={(e) => setAdjustKind(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                  >
                    <option value="TE">TE</option>
                    <option value="RESIDUAL">RESIDUAL</option>
                    <option value="AJUSTE">AJUSTE</option>
                  </select>
                </div>
                <div className="lg:col-span-2">
                  <label className="block text-xs font-black text-gray-600">Valor (USD)</label>
                  <input
                    value={adjustAmount}
                    onChange={(e) => setAdjustAmount(e.target.value)}
                    placeholder="ex.: 12.50"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                  />
                </div>
                <div className="lg:col-span-3">
                  <label className="block text-xs font-black text-gray-600">Descrição</label>
                  <input
                    value={adjustType}
                    onChange={(e) => setAdjustType(e.target.value)}
                    placeholder="Motivo do ajuste"
                    className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                  />
                </div>
              </div>
              <div className="mt-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={submitAdjustment}
                  className={`w-full px-4 py-3 rounded-xl font-black ${busy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#8A2BE2] text-white hover:bg-purple-600'}`}
                >
                  Registrar ajuste
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                <p className="text-sm font-black text-gray-900">TE</p>
                <div className="mt-3 space-y-2">
                  {teList.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum TE encontrado.</p>
                  ) : (
                    teList.slice(0, 30).map((x) => (
                      <div key={x.id} className="rounded-2xl border border-gray-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 truncate">{x.type || 'TE'}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              @{x.username} • {x.userEmail} • {formatDateTime(x.at)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              Valor: <span className="font-black text-gray-800">{formatMoney(x.amount)}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAdjustUserId(String(x.profileId || ''))}
                            className="shrink-0 px-3 py-1 rounded-full text-xs font-black border border-gray-200 bg-white text-gray-800"
                          >
                            Ajustar usuário
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                <p className="text-sm font-black text-gray-900">Residual</p>
                <div className="mt-3 space-y-2">
                  {residualList.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhum residual encontrado.</p>
                  ) : (
                    residualList.slice(0, 30).map((x) => (
                      <div key={x.id} className="rounded-2xl border border-gray-200 bg-white p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 truncate">{x.type || 'RESIDUAL'}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              @{x.username} • {x.userEmail} • {formatDateTime(x.at)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                              Valor: <span className="font-black text-gray-800">{formatMoney(x.amount)}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setAdjustUserId(String(x.profileId || ''))}
                            className="shrink-0 px-3 py-1 rounded-full text-xs font-black border border-gray-200 bg-white text-gray-800"
                          >
                            Ajustar usuário
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'daily' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100">
            <p className="text-sm font-black text-gray-900">Ganhos diários</p>
            <p className="text-xs text-gray-500 mt-1">Créditos diários gerados pela rotina server-side.</p>
          </div>
          <div className="p-5 space-y-3">
            {dailyList.length === 0 ? (
              <p className="text-sm text-gray-500">Nenhum ganho diário encontrado.</p>
            ) : (
              dailyList.slice(0, 50).map((x) => (
                <div key={x.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                  <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-black text-gray-900 truncate">{x.type}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        @{x.username} • {x.userEmail} • {formatDateTime(x.at)}
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        Valor: <span className="font-black text-gray-800">{formatMoney(x.amount)}</span>
                      </p>
                      <p className="mt-1 text-xs text-gray-500">
                        {x.meta?.bankName || 'Banca legada'} • {String(x.meta?.quotaKey || '—').toUpperCase()} • taxa aplicada{' '}
                        <span className="font-black text-gray-800">
                          {Number(x.meta?.effectiveDailyPct || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%
                        </span>
                        {x.meta?.overrideApplied ? ' • exceção do dia' : ' • taxa fixa'}
                      </p>
                      {x.meta?.overrideId && (
                        <p className="mt-1 text-xs text-emerald-700">
                          Override {String(x.meta.overrideId)} • base {Number(x.meta?.baseDailyPct || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%
                        </p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                      {x.status || '—'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
