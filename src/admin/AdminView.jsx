import { useEffect, useMemo, useState } from 'react';
import { BANK_STATUS } from './adminStorage';
import AdminSupport from './AdminSupport';
import AdminFaq from './AdminFaq';
import AdminBankHistoryView from './AdminBankHistoryView';
import AdminDailyPayoutOverridePanel from './AdminDailyPayoutOverridePanel';
import AdminDailyPayoutMonitor from './AdminDailyPayoutMonitor';
import { QUOTA_GLOBAL_LIMIT } from '../quota/quotaEngine';
import { calcElitePool, calcElitePayoutPerSlot, computeEliteBoard, ensureEliteAchievedAt, ELITE_CATEGORIES } from '../elite/eliteEngine';
import AdminUserView from './AdminUserView';
import AdminWalletView from './AdminWalletView';
import { adminFinancialTotals, adminListElitePayoutBatches, adminListElitePayoutItems, adminSearchUsers } from '../supabase/adminRepo.js';

const statusOptions = [
  { value: BANK_STATUS.active, label: 'Ativa' },
  { value: BANK_STATUS.upcoming, label: 'Em breve' },
  { value: BANK_STATUS.closed, label: 'Fechada' },
];

const formatMoney = (v) => `$${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
const formatDateTime = (iso) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return iso;
  }
};

export default function AdminView({ config, onSave, onSimulateElitePayout }) {
  const [draft, setDraft] = useState(config);
  const [tab, setTab] = useState('banks');
  const [eliteQualifiedOnly, setEliteQualifiedOnly] = useState(true);
  const [eliteRecalcTick, setEliteRecalcTick] = useState(0);
  const [users, setUsers] = useState([]);
  const [serverTotals, setServerTotals] = useState(null);
  const [eliteBatches, setEliteBatches] = useState([]);
  const [selectedBatchId, setSelectedBatchId] = useState(null);
  const [selectedBatchItems, setSelectedBatchItems] = useState([]);
  const [eliteProcessBusy, setEliteProcessBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await adminSearchUsers({ q: '', maxRows: 200 });
      if (!cancelled) setUsers(res.ok ? res.users : []);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [eliteRecalcTick]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await adminFinancialTotals();
      if (!cancelled) setServerTotals(res.ok ? res.totals : null);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [eliteRecalcTick]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const res = await adminListElitePayoutBatches({ maxRows: 20 });
      if (cancelled) return;
      const rows = res.ok ? res.rows : [];
      setEliteBatches(rows);
      setSelectedBatchId((current) => current || rows[0]?.id || null);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [eliteRecalcTick]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selectedBatchId) {
        setSelectedBatchItems([]);
        return;
      }
      const res = await adminListElitePayoutItems({ batchId: selectedBatchId });
      if (!cancelled) setSelectedBatchItems(res.ok ? res.rows : []);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [selectedBatchId, eliteRecalcTick]);

  const banks = useMemo(() => Object.values(draft?.banks || {}), [draft]);
  const cycle = draft?.cycle || { months: 6, renewWindowHours: 72, entryFeePct: 0.1 };
  const elite = draft?.elite || { fortnightProfitUsd: 0, lastPaidAt: null };
  const elitePool = calcElitePool(elite.fortnightProfitUsd).elitePool;
  const globalSold = Number(draft?.globalSold || 0);
  const globalPct = Math.min((globalSold / QUOTA_GLOBAL_LIMIT) * 100, 100);
  const globalRemaining = Math.max(0, QUOTA_GLOBAL_LIMIT - globalSold);

  const cycleValid =
    Number(cycle.months) > 0 &&
    Number(cycle.renewWindowHours) >= 0 &&
    Number(cycle.entryFeePct) >= 0 &&
    Number(cycle.entryFeePct) < 1;

  const globalValid = globalSold >= 0 && globalSold <= QUOTA_GLOBAL_LIMIT;
  const canSave = cycleValid && globalValid;

  const updateBank = (id, patch) => {
    setDraft((s) => ({
      ...s,
      banks: {
        ...s.banks,
        [id]: { ...s.banks[id], ...patch },
      },
    }));
  };

  const updateCycle = (patch) => {
    setDraft((s) => ({
      ...s,
      cycle: { ...(s.cycle || {}), ...patch },
    }));
  };

  const eliteLeaders = useMemo(() => {
    const usersWithRank = users.map((u) => {
      const email = String(u?.email || '').toLowerCase();
      const rankKey = String(u?.rankKey || 'FERRO').toUpperCase();
      const at = u?.createdAt || u?.updatedAt || new Date().toISOString();
      const withElite = ensureEliteAchievedAt(u, rankKey, at);
      return { ...withElite, email, rankKey, username: withElite?.username || u?.username || email };
    });
    const allUsers = usersWithRank
      .slice()
      .sort((a, b) => String(a.createdAt || a.updatedAt || '').localeCompare(String(b.createdAt || b.updatedAt || '')));
    const qualifiedRankKeys = new Set(['SILVER', 'OURO', 'DIAMOND', 'RM']);
    const qualifiedUsers = usersWithRank
      .filter((u) => qualifiedRankKeys.has(String(u.rankKey || '').toUpperCase()))
      .slice()
      .sort((a, b) => {
        const ak = String(a.rankKey || '').toUpperCase();
        const bk = String(b.rankKey || '').toUpperCase();
        const aAt = a?.elite?.achievedAt?.[ak] || a?.createdAt || '';
        const bAt = b?.elite?.achievedAt?.[bk] || b?.createdAt || '';
        if (aAt && bAt && aAt !== bAt) return aAt < bAt ? -1 : 1;
        if (aAt && !bAt) return -1;
        if (!aAt && bAt) return 1;
        return String(a.email || '').localeCompare(String(b.email || ''));
      });
    const board = computeEliteBoard(usersWithRank);
    return { usersCount: users.length, allUsers, qualifiedUsers, board };
  }, [elite.fortnightProfitUsd, elite.lastPaidAt, eliteRecalcTick, users]);

  const totals = useMemo(() => {
    const safe = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const sumHoldings = (key) => users.reduce((acc, u) => acc + safe(u?.holdings?.[key] || 0), 0);
    const cota10Units = sumHoldings('cota10');
    const cota50Units = sumHoldings('cota50');
    const cota100Units = sumHoldings('cota100');

    const totalRm10 = cota10Units * 10;
    const totalRm50 = cota50Units * 50;
    const totalRm100 = cota100Units * 100;

    const totalInvested = users.reduce((acc, u) => acc + safe(u?.balances?.invested || 0), 0);

    return {
      usersCount: users.length,
      totalInvested,
      totalRm10,
      totalRm50,
      totalRm100,
      totalPaidResidual: safe(serverTotals?.totalPaidResidual || 0),
      totalPaidBonus: safe(serverTotals?.totalPaidBonus || 0),
      totalPaidTe: safe(serverTotals?.totalPaidTe || 0),
    };
  }, [eliteRecalcTick, serverTotals, users]);

  return (
    <div className="p-4 md:p-6 max-w-6xl mx-auto space-y-6">
      <div className="bg-[#1A1A1A] rounded-2xl p-6 border border-[#8A2BE2] text-white">
        <p className="text-xs font-bold tracking-widest text-[#00FF00]">PAINEL ADMIN</p>
        <h2 className="text-2xl font-black mt-2">Gestão do Sistema</h2>
        <p className="text-sm text-gray-300 mt-2">Controle de bancas e atendimento (via Supabase).</p>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setTab('banks')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'banks' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white/5 text-white border-gray-700 hover:border-[#00FF00]'}`}
          >
            Bancas
          </button>
          <button
            type="button"
            onClick={() => setTab('users')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'users' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white/5 text-white border-gray-700 hover:border-[#00FF00]'}`}
          >
            Usuários
          </button>
          <button
            type="button"
            onClick={() => setTab('wallet')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'wallet' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white/5 text-white border-gray-700 hover:border-[#00FF00]'}`}
          >
            Carteira
          </button>
          <button
            type="button"
            onClick={() => setTab('monitor')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'monitor' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white/5 text-white border-gray-700 hover:border-[#00FF00]'}`}
          >
            Monitor
          </button>
          <button
            type="button"
            onClick={() => setTab('support')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'support' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white/5 text-white border-gray-700 hover:border-[#00FF00]'}`}
          >
            Suporte
          </button>
          <button
            type="button"
            onClick={() => setTab('faq')}
            className={`px-4 py-2 rounded-xl text-sm font-black border ${tab === 'faq' ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white/5 text-white border-gray-700 hover:border-[#00FF00]'}`}
          >
            FAQ
          </button>
        </div>
      </div>

      {tab === 'banks' && (
        <>
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-gray-800">Resumo financeiro (Admin)</h3>
                <p className="text-sm text-gray-500 mt-1">Totais calculados a partir dos usuários registrados.</p>
              </div>
              <p className="text-xs text-gray-500">Usuários: <span className="font-black text-gray-800">{totals.usersCount}</span></p>
            </div>
            {totals.usersCount === 0 && (
              <p className="mt-3 text-sm text-gray-500">Nenhum usuário cadastrado ainda. Os cards abaixo ficam vazios até entrarem dados reais no Supabase.</p>
            )}

            <div className="mt-5 grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-500">Total Investido</p>
                <p className="text-2xl font-black text-gray-900">{formatMoney(totals.totalInvested)}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-500">Total RM 10</p>
                <p className="text-2xl font-black text-gray-900">{formatMoney(totals.totalRm10)}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-500">Total RM 50</p>
                <p className="text-2xl font-black text-gray-900">{formatMoney(totals.totalRm50)}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-500">Total RM 100</p>
                <p className="text-2xl font-black text-gray-900">{formatMoney(totals.totalRm100)}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-500">Total Pago Residual</p>
                <p className="text-2xl font-black text-gray-900">{formatMoney(totals.totalPaidResidual)}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-500">Total Pago Bônus</p>
                <p className="text-2xl font-black text-gray-900">{formatMoney(totals.totalPaidBonus)}</p>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <p className="text-xs text-gray-500">Total Pago TE</p>
                <p className="text-2xl font-black text-gray-900">{formatMoney(totals.totalPaidTe)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-black text-gray-800">Limite Global (100k)</h3>
              <p className="text-sm text-gray-500 mt-1">Controle do total de cotas vendidas no sistema.</p>

              <div className="mt-4">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-gray-500">Cotas vendidas</p>
                    <p className="text-2xl font-black text-[#8A2BE2]">{globalSold.toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-bold text-gray-500">Restante</p>
                    <p className="text-2xl font-black text-gray-800">{globalRemaining.toLocaleString()}</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 mt-3 overflow-hidden">
                  <div className="bg-gradient-to-r from-[#8A2BE2] to-[#00FF00] h-3 rounded-full" style={{ width: `${globalPct}%` }} />
                </div>
                <p className="text-right text-xs text-gray-400 mt-1">{globalPct.toFixed(1)}%</p>
              </div>

              <div className="mt-5">
                <label className="block text-sm text-gray-600 mb-1">Ajustar cotas vendidas (admin)</label>
                <input
                  type="number"
                  min="0"
                  max={QUOTA_GLOBAL_LIMIT}
                  value={Number.isFinite(globalSold) ? globalSold : 0}
                  onChange={(e) => setDraft((s) => ({ ...s, globalSold: Number(e.target.value || 0) }))}
                  className={`w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none ${globalValid ? '' : 'border-red-300'}`}
                />
                {!globalValid && <p className="text-xs text-red-600 mt-1">Valor inválido. Deve estar entre 0 e {QUOTA_GLOBAL_LIMIT.toLocaleString()}.</p>}
                {globalRemaining === 0 && (
                  <p className="text-xs text-red-600 mt-2 font-bold">Limite global atingido: compras bloqueadas.</p>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
              <h3 className="text-lg font-black text-gray-800">Parâmetros do Ciclo</h3>
              <p className="text-sm text-gray-500 mt-1">Ajusta duração do ciclo, janela de renovação e taxa de entrada.</p>

              <div className="mt-5 grid grid-cols-1 min-[540px]:grid-cols-2 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Meses</label>
                  <input
                    type="number"
                    min="1"
                    value={cycle.months}
                    onChange={(e) => updateCycle({ months: Number(e.target.value || 0) })}
                    className={`w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none ${cycleValid ? '' : 'border-red-300'}`}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Janela (horas)</label>
                  <input
                    type="number"
                    min="0"
                    value={cycle.renewWindowHours}
                    onChange={(e) => updateCycle({ renewWindowHours: Number(e.target.value || 0) })}
                    className={`w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none ${cycleValid ? '' : 'border-red-300'}`}
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-600 mb-1">Taxa entrada (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="99"
                    value={Math.round(Number(cycle.entryFeePct || 0) * 100)}
                    onChange={(e) => updateCycle({ entryFeePct: Number(e.target.value || 0) / 100 })}
                    className={`w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none ${cycleValid ? '' : 'border-red-300'}`}
                  />
                </div>
              </div>

              {!cycleValid && (
                <p className="text-xs text-red-600 mt-2">Parâmetros inválidos. Meses &gt; 0, janela ≥ 0 e taxa entre 0% e 99%.</p>
              )}
              <p className="text-xs text-gray-500 mt-2">
                Atual: {Number(cycle.months || 0)} meses, {Number(cycle.renewWindowHours || 0)}h de renovação, {Math.round(Number(cycle.entryFeePct || 0) * 100)}% taxa de entrada.
              </p>
            </div>
          </div>

          <AdminDailyPayoutOverridePanel banks={banks} />

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <h3 className="text-lg font-black text-gray-800">Bolsão Elite (quinzenal)</h3>
            <p className="text-sm text-gray-500 mt-1">Você informa o lucro quinzenal total (USD). O sistema usa 10% como base do Bolsão Elite.</p>
            <div className="mt-4 grid grid-cols-1 min-[540px]:grid-cols-2 md:grid-cols-3 gap-3">
              <div className="min-[540px]:col-span-2">
                <label className="block text-sm text-gray-600 mb-1">Lucro quinzenal (USD)</label>
                <input
                  type="number"
                  min="0"
                  value={Number(elite.fortnightProfitUsd || 0)}
                  onChange={(e) =>
                    setDraft((s) => ({
                      ...s,
                      elite: { ...(s.elite || {}), fortnightProfitUsd: Number(e.target.value || 0) },
                    }))
                  }
                  className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">10% (Bolsão)</label>
                <div className="w-full p-3 bg-gray-50 border rounded-lg font-black text-gray-800">
                  {formatMoney(Number(elite.fortnightProfitUsd || 0) * 0.1)}
                </div>
              </div>
            </div>
            {elite.lastPaidAt && (
              <p className="text-xs text-gray-500 mt-2">Último processamento registrado: {new Date(elite.lastPaidAt).toLocaleString('pt-BR')}</p>
            )}
            <div className="mt-4 flex flex-col min-[540px]:flex-row gap-3 min-[540px]:items-center min-[540px]:justify-end">
              <button
                type="button"
                onClick={() => {
                  if (eliteProcessBusy) return;
                  void (async () => {
                    try {
                      setEliteProcessBusy(true);
                      const res = await onSimulateElitePayout?.({ profitUsd: Number(elite.fortnightProfitUsd || 0) });
                      if (res) setDraft(res);
                      setEliteRecalcTick((n) => n + 1);
                    } finally {
                      setEliteProcessBusy(false);
                    }
                  })();
                }}
                disabled={eliteProcessBusy || Number(elite.fortnightProfitUsd || 0) <= 0}
                className={`px-5 py-3 rounded-xl font-black ${!eliteProcessBusy && Number(elite.fortnightProfitUsd || 0) > 0 ? 'bg-[#00FF00] text-black hover:bg-green-400' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
              >
                {eliteProcessBusy ? 'Processando...' : 'Registrar pagamento (server-side)'}
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-gray-800">Líderes do Bolsão (somente leitura)</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Mostra os ocupantes atuais e a fila por rank, respeitando a ordem de chegada. Usuários registrados: {eliteLeaders.usersCount}.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
                <button
                  type="button"
                  onClick={() => setEliteRecalcTick((n) => n + 1)}
                  className="px-4 py-2 rounded-xl border border-gray-200 text-gray-800 font-black hover:bg-gray-50"
                >
                  Recalcular agora
                </button>
                <button
                  type="button"
                  onClick={() => setEliteQualifiedOnly((s) => !s)}
                  className={`px-4 py-2 rounded-xl border font-black ${eliteQualifiedOnly ? 'bg-[#00FF00] text-black border-[#00FF00]' : 'bg-white text-gray-800 border-gray-200 hover:bg-gray-50'}`}
                >
                  Somente qualificados (Silver+)
                </button>
                <div className="bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                  <p className="text-xs text-gray-500">Bolsão (10%)</p>
                  <p className="text-lg font-black text-[#00FF00]">{formatMoney(elitePool)}</p>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-2 gap-4">
              {ELITE_CATEGORIES.map((cat) => {
                const block = eliteLeaders.board?.[cat.key];
                const occupants = block?.occupants || [];
                const waiting = block?.waiting || [];
                const slotAmount = calcElitePayoutPerSlot(elitePool, cat.key);
                return (
                  <div key={cat.key} className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-sm font-black text-gray-900">{cat.title}</p>
                        <p className="text-xs text-gray-500">
                          {cat.slots} vagas • {Math.round(Number(cat.pctPerSlot || 0) * 1000) / 10}% por vaga • {formatMoney(slotAmount)} por líder
                        </p>
                      </div>
                      <span className="text-xs font-black px-2 py-1 rounded bg-white border border-gray-200 text-gray-700">
                        {occupants.length}/{cat.slots}
                      </span>
                    </div>

                    <div className="mt-3 space-y-2">
                      {Array.from({ length: cat.slots }).map((_, i) => {
                        const occ = occupants[i];
                        return (
                          <div key={i} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2">
                            <p className="text-sm font-black text-gray-800">#{i + 1}</p>
                            {occ ? (
                              <div className="min-w-0 text-right">
                                <p className="text-sm font-black text-gray-900 truncate">{occ.username || occ.email}</p>
                                <p className="text-[11px] text-gray-500">Entrada: {occ.achievedAt ? formatDateTime(occ.achievedAt) : '—'}</p>
                              </div>
                            ) : (
                              <p className="text-sm text-gray-500 font-bold">Vaga disponível</p>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="mt-3">
                      <p className="text-xs font-black text-gray-700">Fila (aguardando vaga): {waiting.length}</p>
                      {waiting.length ? (
                        <div className="mt-2 space-y-1">
                          {waiting.slice(0, 4).map((w) => (
                            <div key={w.email} className="flex items-center justify-between gap-3 text-xs text-gray-600 bg-white rounded-lg border border-gray-200 px-3 py-2">
                              <span className="font-black truncate">{w.username || w.email}</span>
                              <span className="text-[11px] text-gray-500">{w.achievedAt ? formatDateTime(w.achievedAt) : '—'}</span>
                            </div>
                          ))}
                          {waiting.length > 4 && <p className="text-[11px] text-gray-500 mt-1">+{waiting.length - 4} na fila</p>}
                        </div>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">Sem fila no momento.</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 bg-gray-50 rounded-2xl border border-gray-100 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-black text-gray-900">{eliteQualifiedOnly ? 'Somente qualificados (Silver+)' : 'Todos usuários (audit)'}</p>
                  <p className="text-xs text-gray-500">
                    {eliteQualifiedOnly
                      ? `Total qualificados: ${Number(eliteLeaders?.qualifiedUsers?.length || 0)}`
                      : `Total usuários: ${Number(eliteLeaders?.allUsers?.length || 0)}`}{' '}
                    • Lista apenas para auditoria (não altera vagas).
                  </p>
                </div>
              </div>
              <div className="mt-3 space-y-2">
                {(eliteQualifiedOnly ? (eliteLeaders?.qualifiedUsers || []) : (eliteLeaders?.allUsers || [])).slice(0, 12).map((u) => {
                  const rk = String(u.rankKey || '').toUpperCase();
                  const at = u?.elite?.achievedAt?.[rk] || u?.createdAt || null;
                  return (
                    <div key={u.email} className="flex items-center justify-between gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900 truncate">{u.username || u.email}</p>
                        <p className="text-[11px] text-gray-500 truncate">{u.email}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-black text-gray-800">{rk}</p>
                        <p className="text-[11px] text-gray-500">{at ? formatDateTime(at) : '—'}</p>
                      </div>
                    </div>
                  );
                })}
                {eliteQualifiedOnly && (eliteLeaders?.qualifiedUsers || []).length > 12 && (
                  <p className="text-[11px] text-gray-500 mt-2">+{eliteLeaders.qualifiedUsers.length - 12} qualificados</p>
                )}
                {!eliteQualifiedOnly && (eliteLeaders?.allUsers || []).length > 12 && (
                  <p className="text-[11px] text-gray-500 mt-2">+{eliteLeaders.allUsers.length - 12} usuários</p>
                )}
              </div>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              Nota: se um líder sobe de rank, ele libera a vaga anterior; se cair de rank, ele desce de categoria. A ordem de chegada vem do timestamp do primeiro atingimento do rank.
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-gray-800">Histórico de pagamentos do Bolsão</h3>
                <p className="text-sm text-gray-500 mt-1">Lotes processados no servidor com trilha administrativa persistida.</p>
              </div>
              <button
                type="button"
                onClick={() => setEliteRecalcTick((n) => n + 1)}
                className="px-4 py-2 rounded-xl border border-gray-200 text-gray-800 font-black hover:bg-gray-50"
              >
                Atualizar histórico
              </button>
            </div>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5 space-y-3">
                {eliteBatches.length === 0 && <p className="text-sm text-gray-500">Nenhum lote de pagamento registrado ainda.</p>}
                {eliteBatches.map((batch) => (
                  <button
                    key={batch.id}
                    type="button"
                    onClick={() => setSelectedBatchId(batch.id)}
                    className={`w-full text-left rounded-2xl border px-4 py-4 ${selectedBatchId === batch.id ? 'border-[#00FF00] bg-emerald-50' : 'border-gray-200 bg-white hover:border-gray-300'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-gray-900 truncate">{formatDateTime(batch.run_at)}</p>
                        <p className="text-xs text-gray-500 mt-1">Modo: {batch.mode || '—'} • Itens: {Number(batch.items_count || 0)}</p>
                      </div>
                      <p className="text-sm font-black text-[#00FF00]">{formatMoney(batch.total_paid_usd)}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Lucro: {formatMoney(batch.profit_usd)} • Pool: {formatMoney(batch.pool_usd)}
                    </p>
                  </button>
                ))}
              </div>

              <div className="lg:col-span-7 rounded-2xl border border-gray-100 bg-gray-50 p-5">
                {!selectedBatchId ? (
                  <p className="text-sm text-gray-500">Selecione um lote para ver os beneficiados.</p>
                ) : (
                  <>
                    <p className="text-sm font-black text-gray-900">Beneficiados do lote</p>
                    <div className="mt-4 space-y-3">
                      {selectedBatchItems.length === 0 && <p className="text-sm text-gray-500">Nenhum item encontrado para este lote.</p>}
                      {selectedBatchItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-gray-200 bg-white px-4 py-3 flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 truncate">{item.username || item.email || 'Usuário'}</p>
                            <p className="text-xs text-gray-500 mt-1">
                              {item.category} • Vaga #{item.slot_no} • Entrada: {item.achieved_at ? formatDateTime(item.achieved_at) : '—'}
                            </p>
                          </div>
                          <p className="text-sm font-black text-[#00FF00]">{formatMoney(item.amount_usd)}</p>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-6">
            {banks.map((b) => (
              <div key={b.id} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-gray-800 truncate">{b.name}</h3>
                    <p className="text-xs text-gray-500">Vinculada: {b.quotaKey.toUpperCase()}</p>
                  </div>
                  <span className="text-xs font-bold px-2 py-1 rounded bg-gray-100 text-gray-600">
                    {statusOptions.find((s) => s.value === b.status)?.label || b.status}
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Status</label>
                    <select
                      value={b.status}
                      onChange={(e) => updateBank(b.id, { status: e.target.value })}
                      className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                    >
                      {statusOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-600 mb-1">Limite (USD)</label>
                    <input
                      type="number"
                      min="0"
                      value={b.limit}
                      onChange={(e) => updateBank(b.id, { limit: Number(e.target.value || 0) })}
                      className="w-full p-3 bg-gray-50 border rounded-lg focus:ring-[#00FF00] outline-none"
                    />
                    <p className="text-xs text-gray-500 mt-1">Atual: <span className="font-bold">{formatMoney(b.limit)}</span></p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <AdminBankHistoryView banks={banks} />

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-end">
            <button
              onClick={() => setDraft(config)}
              className="px-5 py-3 rounded-xl border border-gray-200 bg-white text-gray-700 font-bold hover:bg-gray-50"
            >
              Reverter
            </button>
            <button
              onClick={() => {
                if (!canSave || saveBusy) return;
                void (async () => {
                  try {
                    setSaveBusy(true);
                    const res = await onSave(draft);
                    if (res?.ok && res?.config) setDraft(res.config);
                  } finally {
                    setSaveBusy(false);
                  }
                })();
              }}
              disabled={!canSave || saveBusy}
              className={`px-6 py-3 rounded-xl font-black ${canSave && !saveBusy ? 'bg-[#00FF00] text-black hover:bg-green-400' : 'bg-gray-200 text-gray-400 cursor-not-allowed'}`}
            >
              {saveBusy ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </div>
        </>
      )}

      {tab === 'support' && (
        <AdminSupport
          draft={draft}
          setDraft={setDraft}
          onSave={(d) => onSave(d)}
        />
      )}

      {tab === 'monitor' && <AdminDailyPayoutMonitor />}

      {tab === 'faq' && <AdminFaq />}

      {tab === 'users' && <AdminUserView config={draft} />}

      {tab === 'wallet' && <AdminWalletView config={draft} />}
    </div>
  );
}
