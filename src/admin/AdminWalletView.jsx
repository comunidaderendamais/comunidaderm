import { useMemo, useState } from 'react';
import { fetchNowpaymentStatus } from '../payments/nowpaymentsClient';
import { settleNowpaymentsDeposit, WITHDRAW_FEE_USD } from '../payments/walletEngine';
import { getUserByEmail, loadUsersState, saveUsersState, upsertUser, listUsers } from '../users/usersStorage';

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

  const users = useMemo(() => listUsers(loadUsersState()), [refresh]);

  const deposits = useMemo(() => {
    const out = [];
    users.forEach((u) => {
      if (!matchUser(u, query)) return;
      const email = String(u?.email || '').toLowerCase();
      const username = String(u?.username || email || '—');
      const txs = Array.isArray(u?.transactions) ? u.transactions : [];
      txs
        .filter((t) => String(t?.kind || '') === 'DEPOSITO')
        .forEach((t) => {
          out.push({
            id: t.id,
            at: t.at,
            status: t.status,
            amount: safeNum(t.amount || 0),
            type: t.type,
            payment: t.payment,
            paymentId: t?.meta?.paymentId || '',
            userEmail: email,
            username,
          });
        });
    });
    return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }, [users, query]);

  const withdrawals = useMemo(() => {
    const out = [];
    users.forEach((u) => {
      if (!matchUser(u, query)) return;
      const email = String(u?.email || '').toLowerCase();
      const username = String(u?.username || email || '—');
      const blocked = Boolean(u?.blocked);
      const txs = Array.isArray(u?.transactions) ? u.transactions : [];
      txs
        .filter((t) => String(t?.kind || '') === 'SAQUE')
        .forEach((t) => {
          const amount = Math.abs(safeNum(t.amount || 0));
          const feeUsd = safeNum(t?.meta?.feeUsd || WITHDRAW_FEE_USD);
          const netUsd = safeNum(t?.meta?.netUsd || Math.max(0, amount - feeUsd));
          out.push({
            id: t.id,
            at: t.at,
            status: t.status,
            amount,
            feeUsd,
            netUsd,
            type: t.type,
            payment: t.payment,
            address: t?.meta?.address || '',
            hash: t?.meta?.hash || '',
            userEmail: email,
            username,
            blocked,
          });
        });
    });
    return out.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  }, [users, query]);

  const updateUserTx = ({ email, txId, updater }) => {
    const st = loadUsersState();
    const existing = getUserByEmail(st, email);
    if (!existing) return { ok: false, reason: 'Usuário não encontrado.' };
    const txs = Array.isArray(existing?.transactions) ? existing.transactions : [];
    const nextTxs = txs.map((t) => (String(t?.id || '') === String(txId) ? updater(t) : t));
    const updated = { ...existing, transactions: nextTxs };
    const saved = saveUsersState(upsertUser(st, updated));
    const refreshed = getUserByEmail(saved, email);
    return { ok: true, user: refreshed || updated };
  };

  const verifyDeposit = async (item) => {
    try {
      if (busy) return;
      setBusy(true);
      const paymentId = String(paymentIdByTx[item.id] ?? item.paymentId ?? '').trim();
      if (!paymentId) {
        alert('Informe o paymentId.');
        return;
      }
      const st = loadUsersState();
      const u = getUserByEmail(st, item.userEmail);
      if (!u) {
        alert('Usuário não encontrado.');
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
      const settled = settleNowpaymentsDeposit({
        user: withPid,
        depositTxId: item.id,
        nowpayStatus: nowRes.status,
        now: new Date(),
        cycleMonths: config?.cycle?.months,
        renewWindowHours: config?.cycle?.renewWindowHours,
      });
      if (!settled.ok) {
        alert(settled.reason);
        return;
      }
      saveUsersState(upsertUser(st, settled.user));
      setRefresh((s) => s + 1);
      alert('Depósito verificado.');
    } finally {
      setBusy(false);
    }
  };

  const approveWithdraw = (item) => {
    const res = updateUserTx({
      email: item.userEmail,
      txId: item.id,
      updater: (t) => ({ ...t, status: 'Aprovado' }),
    });
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    setRefresh((s) => s + 1);
  };

  const refuseWithdraw = (item) => {
    const st = loadUsersState();
    const u = getUserByEmail(st, item.userEmail);
    if (!u) {
      alert('Usuário não encontrado.');
      return;
    }
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
    saveUsersState(upsertUser(st, updated));
    setRefresh((s) => s + 1);
  };

  const blockUser = (item) => {
    const st = loadUsersState();
    const u = getUserByEmail(st, item.userEmail);
    if (!u) {
      alert('Usuário não encontrado.');
      return;
    }
    const updated = { ...u, blocked: true };
    saveUsersState(upsertUser(st, updated));
    setRefresh((s) => s + 1);
  };

  const confirmPaid = (item) => {
    const hash = String(hashByTx[item.id] ?? '').trim();
    if (!hash) {
      alert('Informe a hash do envio.');
      return;
    }
    const res = updateUserTx({
      email: item.userEmail,
      txId: item.id,
      updater: (t) => ({ ...t, status: 'Pago', meta: { ...(t?.meta || {}), hash, paidAt: new Date().toISOString() } }),
    });
    if (!res.ok) {
      alert(res.reason);
      return;
    }
    setRefresh((s) => s + 1);
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
                        disabled={busy}
                        onClick={() => verifyDeposit(d)}
                        className={`w-full px-4 py-3 rounded-xl font-black ${busy ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-[#00FF00] text-black hover:bg-green-400'}`}
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
    </div>
  );
}

