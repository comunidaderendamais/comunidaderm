import { useEffect, useMemo, useState } from 'react';
import { getBankByQuotaKey } from './adminStorage';
import { adminGetUserNetwork, adminGetUserState, adminGrantSponsorship, adminReassignUserSponsor, adminSearchUsers } from '../supabase/adminRepo.js';
import { getQuotaPlanPresentation } from '../quota/quotaPresentation.js';
import AdminUserSponsorshipPanel from './AdminUserSponsorshipPanel.jsx';

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const formatMoney = (v) => `$${Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const formatDate = (iso) => {
  try {
    return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return String(iso || '');
  }
};

const pickBankForQuotaKey = (config, quotaKey) => {
  const bank = getBankByQuotaKey(config, quotaKey);
  if (bank) return bank;
  const banks = Object.values(config?.banks || {});
  return banks.find((b) => String(b?.quotaKey || '') === String(quotaKey || '')) || null;
};

const sumTx = (txs, predicate) =>
  (Array.isArray(txs) ? txs : []).reduce((acc, tx) => {
    const amount = safeNum(tx?.amount || 0);
    if (!predicate(tx)) return acc;
    return acc + amount;
  }, 0);

export default function AdminUserView({ config }) {
  const [query, setQuery] = useState('');
  const [sponsorFilter, setSponsorFilter] = useState('all');
  const [selectedKey, setSelectedKey] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedFull, setSelectedFull] = useState(null);
  const [networkLevels, setNetworkLevels] = useState([]);
  const [reloadTick, setReloadTick] = useState(0);
  const [sponsorshipBusy, setSponsorshipBusy] = useState(false);
  const [sponsorSearch, setSponsorSearch] = useState('');
  const [sponsorSearchLoading, setSponsorSearchLoading] = useState(false);
  const [sponsorCandidates, setSponsorCandidates] = useState([]);
  const [selectedSponsorCandidate, setSelectedSponsorCandidate] = useState(null);
  const [sponsorReason, setSponsorReason] = useState('');
  const [sponsorChangeBusy, setSponsorChangeBusy] = useState(false);
  const [sponsorChangeConfirmOpen, setSponsorChangeConfirmOpen] = useState(false);
  const [sponsorFeedback, setSponsorFeedback] = useState(null);
  const [sponsorAuditBusy, setSponsorAuditBusy] = useState(false);
  const [sponsorAuditRows, setSponsorAuditRows] = useState([]);
  const [sponsorAuditAt, setSponsorAuditAt] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      try {
        const res = await adminSearchUsers({
          q: String(query || '').trim(),
          maxRows: 50,
          withoutSponsorOnly: sponsorFilter === 'without' || sponsorFilter === 'without_invested',
          onlyWithSponsor: sponsorFilter === 'with',
          withInvestmentOnly: sponsorFilter === 'without_invested',
        });
        if (!cancelled) setUsers(res.ok ? res.users : []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [query, sponsorFilter]);

  const filtered = useMemo(() => {
    return users.slice(0, 50);
  }, [users, query]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    return users.find((u) => String(u?.id || '') === String(selectedKey)) || null;
  }, [users, selectedKey]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!selected?.id) {
        setSelectedFull(null);
        setNetworkLevels([]);
        return;
      }
      const [stateRes, netRes] = await Promise.all([
        adminGetUserState({ userId: selected.id, maxTransactions: 500 }),
        adminGetUserNetwork({ rootId: selected.id, maxDepth: 5 }),
      ]);
      if (cancelled) return;
      setSelectedFull(stateRes.ok ? stateRes.user : null);
      if (!netRes.ok) {
        setNetworkLevels([]);
        return;
      }
      const rows = netRes.rows;
      const grouped = [1, 2, 3, 4, 5].map((lvl) =>
        rows
          .filter((r) => Number(r?.level) === lvl)
          .map((r) => ({
            key: String(r?.id || `${lvl}`),
            username: r?.username || '—',
            email: r?.email || '—',
            userId: r?.user_id || '—',
            createdAt: r?.created_at || null,
            invested: safeNum(r?.balances?.invested || 0),
            holdings: r?.holdings || {},
            totalCotas: safeNum(r?.holdings?.cota10 || 0) + safeNum(r?.holdings?.cota50 || 0) + safeNum(r?.holdings?.cota100 || 0),
            planStats: {
              cota10: { units: safeNum(r?.holdings?.cota10 || 0), lastAt: null, totalUsd: safeNum(r?.holdings?.cota10 || 0) * 10 },
              cota50: { units: safeNum(r?.holdings?.cota50 || 0), lastAt: null, totalUsd: safeNum(r?.holdings?.cota50 || 0) * 50 },
              cota100: { units: safeNum(r?.holdings?.cota100 || 0), lastAt: null, totalUsd: safeNum(r?.holdings?.cota100 || 0) * 100 },
            },
            rankTitle: String(r?.rank_key || '—').toUpperCase(),
          }))
      );
      setNetworkLevels(grouped);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, reloadTick]);

  useEffect(() => {
    setSponsorSearch('');
    setSponsorCandidates([]);
    setSelectedSponsorCandidate(null);
    setSponsorReason('');
    setSponsorChangeConfirmOpen(false);
    setSponsorFeedback(null);
  }, [selected?.id]);

  useEffect(() => {
    let cancelled = false;
    const term = String(sponsorSearch || '').trim();
    if (!selected?.id || term.length < 2) {
      setSponsorCandidates([]);
      setSponsorSearchLoading(false);
      return undefined;
    }

    const run = async () => {
      setSponsorSearchLoading(true);
      try {
        const res = await adminSearchUsers({ q: term, maxRows: 12 });
        if (cancelled) return;
        const rows = res.ok ? res.users.filter((item) => String(item?.id || '') !== String(selected.id || '')) : [];
        setSponsorCandidates(rows);
      } finally {
        if (!cancelled) setSponsorSearchLoading(false);
      }
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [sponsorSearch, selected?.id]);

  const handleGrantSponsorship = async ({ planKey, units, note }) => {
    if (!selected?.id) return { ok: false, error: 'Selecione um usuário.' };
    setSponsorshipBusy(true);
    try {
      const res = await adminGrantSponsorship({
        userId: selected.id,
        planKey,
        units,
        note,
      });
      if (res.ok) setReloadTick((value) => value + 1);
      return res;
    } finally {
      setSponsorshipBusy(false);
    }
  };

  const handleRequestSponsorReassign = () => {
    if (!selected?.id) {
      setSponsorFeedback({ type: 'error', message: 'Selecione um usuário.' });
      return;
    }
    if (!selectedSponsorCandidate?.id) {
      setSponsorFeedback({ type: 'error', message: 'Selecione o novo patrocinador.' });
      return;
    }
    setSponsorFeedback(null);
    setSponsorChangeConfirmOpen(true);
  };

  const handleReassignSponsor = async () => {
    if (!selected?.id || !selectedSponsorCandidate?.id) return;
    setSponsorChangeBusy(true);
    try {
      const res = await adminReassignUserSponsor({
        userId: selected.id,
        sponsorId: selectedSponsorCandidate.id,
        reason: sponsorReason,
      });
      if (!res.ok) {
        setSponsorFeedback({ type: 'error', message: res.error || 'Não foi possível alterar o patrocinador.' });
        return;
      }
      setSponsorSearch('');
      setSponsorCandidates([]);
      setSelectedSponsorCandidate(null);
      setSponsorReason('');
      setSponsorChangeConfirmOpen(false);
      setReloadTick((value) => value + 1);
      setSponsorFeedback({ type: 'success', message: 'Patrocinador alterado com sucesso.' });
    } catch (error) {
      setSponsorFeedback({
        type: 'error',
        message: error instanceof Error ? error.message : 'Falha inesperada ao alterar o patrocinador.',
      });
    } finally {
      setSponsorChangeBusy(false);
    }
  };

  const handleRunSponsorAudit = async () => {
    setSponsorAuditBusy(true);
    try {
      const res = await adminSearchUsers({
        q: '',
        maxRows: 200,
        withoutSponsorOnly: true,
        withInvestmentOnly: sponsorFilter === 'without_invested',
      });
      if (!res.ok) {
        alert(res.error || 'Não foi possível carregar a auditoria de patrocinadores.');
        return;
      }
      setSponsorAuditRows(res.users);
      setSponsorAuditAt(new Date().toISOString());
    } finally {
      setSponsorAuditBusy(false);
    }
  };

  const selectedTotals = useMemo(() => {
    const base = selectedFull || selected;
    const txs = Array.isArray(base?.transactions) ? base.transactions : [];
    const invested = safeNum(base?.balances?.invested || 0);
    const available = safeNum(base?.balances?.available || 0);
    const teamEarnings = safeNum(base?.balances?.teamEarnings || 0);
    const eliteEarnings = safeNum(base?.balances?.eliteEarnings || 0);
    const teEarnings = safeNum(base?.balances?.teEarnings || 0);
    const totalResidual = sumTx(txs, (t) => safeNum(t?.amount || 0) > 0 && String(t?.kind || '') === 'RESIDUAL');
    const totalTe = sumTx(txs, (t) => safeNum(t?.amount || 0) > 0 && String(t?.kind || '') === 'TE');
    const teLevel1 = sumTx(
      txs,
      (t) => safeNum(t?.amount || 0) > 0 && String(t?.kind || '') === 'TE' && /nível\s*1/i.test(String(t?.type || ''))
    );
    const teLevel2 = sumTx(
      txs,
      (t) => safeNum(t?.amount || 0) > 0 && String(t?.kind || '') === 'TE' && /nível\s*2/i.test(String(t?.type || ''))
    );
    const teLevel3 = sumTx(
      txs,
      (t) => safeNum(t?.amount || 0) > 0 && String(t?.kind || '') === 'TE' && /nível\s*3/i.test(String(t?.type || ''))
    );
    const totalElite = sumTx(txs, (t) => safeNum(t?.amount || 0) > 0 && String(t?.kind || '') === 'ELITE');
    const totalWithdrawn = Math.abs(
      sumTx(txs, (t) => safeNum(t?.amount || 0) < 0 && String(t?.type || '').toLowerCase().includes('saque'))
    );

    return {
      invested,
      available,
      teamEarnings,
      eliteEarnings,
      teEarnings,
      totalResidual,
      totalTe,
      teLevel1,
      teLevel2,
      teLevel3,
      totalElite,
      totalWithdrawn,
    };
  }, [selected, selectedFull]);

  const selectedDailyByLot = useMemo(() => {
    const base = selectedFull || selected;
    const txs = Array.isArray(base?.transactions) ? base.transactions : [];
    const map = {};
    txs
      .filter((tx) => String(tx?.kind || '').toUpperCase() === 'DAILY')
      .sort((a, b) => String(b?.at || '').localeCompare(String(a?.at || '')))
      .forEach((tx) => {
        const lotId = String(tx?.meta?.lotId || '');
        if (!lotId || map[lotId]) return;
        map[lotId] = tx;
      });
    return map;
  }, [selected, selectedFull]);

  const selectedLots = useMemo(() => {
    const base = selectedFull || selected;
    const lots = Array.isArray(base?.quotaLots) ? base.quotaLots : [];
    const now = Date.now();
    return lots
      .slice()
      .sort((a, b) => String(b?.startAt || '').localeCompare(String(a?.startAt || '')))
      .map((l) => {
        const startTs = Date.parse(l?.startAt || '');
        const endTs = Date.parse(l?.endAt || '');
        const leftMs = Number.isFinite(endTs) ? Math.max(0, endTs - now) : null;
        const durationMs = Number.isFinite(startTs) && Number.isFinite(endTs) ? Math.max(1, endTs - startTs) : null;
        const progressPct =
          Number.isFinite(durationMs) && Number.isFinite(leftMs) ? Math.min(100, Math.max(0, ((durationMs - leftMs) / durationMs) * 100)) : 0;
        const bank = pickBankForQuotaKey(config, l?.planKey);
        const latestDaily = selectedDailyByLot[String(l?.id || '')] || null;
        const plan = getQuotaPlanPresentation({ planKey: l?.planKey, planTitle: l?.planTitle, planPrice: l?.planPrice });
        return {
          ...l,
          bankName: bank?.name || bank?.id || '—',
          leftMs,
          progressPct,
          fixedDailyPct: plan.dailyPct,
          latestDaily,
        };
      });
  }, [selected, selectedFull, config, selectedDailyByLot]);

  const selectedNetwork = useMemo(() => {
    return networkLevels;
  }, [networkLevels]);

  const shown = selectedFull || selected;
  const currentSponsor = shown?.sponsor || null;
  const sponsorLogs = Array.isArray(shown?.sponsorLogs) ? shown.sponsorLogs : [];
  const currentSponsorLabel = currentSponsor?.username ? `@${currentSponsor.username}` : 'sem patrocinador';
  const nextSponsorLabel = selectedSponsorCandidate?.username ? `@${selectedSponsorCandidate.username}` : selectedSponsorCandidate?.email || 'novo patrocinador';
  const sponsorAuditSummary = useMemo(() => {
    const rows = Array.isArray(sponsorAuditRows) ? sponsorAuditRows : [];
    const countQuotaUnits = (item) =>
      safeNum(item?.holdings?.cota10 || 0) + safeNum(item?.holdings?.cota50 || 0) + safeNum(item?.holdings?.cota100 || 0);
    const total = rows.length;
    const invested = rows.filter((item) => safeNum(item?.balances?.invested || 0) > 0).length;
    const withQuotas = rows.filter((item) => countQuotaUnits(item) > 0).length;
    const createdLast7Days = rows.filter((item) => {
      const createdAt = Date.parse(item?.createdAt || '');
      if (!Number.isFinite(createdAt)) return false;
      return Date.now() - createdAt <= 7 * 24 * 60 * 60 * 1000;
    }).length;
    return {
      total,
      invested,
      withQuotas,
      withoutQuotas: Math.max(0, total - withQuotas),
      createdLast7Days,
    };
  }, [sponsorAuditRows]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-gray-900">Usuários</h3>
              <p className="text-sm text-gray-500 mt-1">Buscar por login, e-mail, userId ou uuid/id.</p>
            </div>
            <div className="w-full lg:w-[420px]">
              <label className="text-xs font-black text-gray-600">Buscar</label>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ex: alfabrazil, email@..., rm_..., uuid..."
                className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
              />
            </div>
          </div>

          <div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSponsorFilter('all')}
                  className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${sponsorFilter === 'all' ? 'border-violet-200 bg-violet-50 text-violet-800' : 'border-gray-200 bg-white text-gray-600'}`}
                >
                  Todos
                </button>
                <button
                  type="button"
                  onClick={() => setSponsorFilter('without')}
                  className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${sponsorFilter === 'without' ? 'border-red-200 bg-red-50 text-red-800' : 'border-gray-200 bg-white text-gray-600'}`}
                >
                  Sem patrocinador
                </button>
                <button
                  type="button"
                  onClick={() => setSponsorFilter('with')}
                  className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${sponsorFilter === 'with' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-gray-200 bg-white text-gray-600'}`}
                >
                  Com patrocinador
                </button>
                <button
                  type="button"
                  onClick={() => setSponsorFilter('without_invested')}
                  className={`rounded-full border px-4 py-2 text-xs font-black uppercase tracking-[0.18em] ${sponsorFilter === 'without_invested' ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-gray-200 bg-white text-gray-600'}`}
                >
                  Sem sponsor + investido
                </button>
              </div>

              <button
                type="button"
                onClick={() => void handleRunSponsorAudit()}
                disabled={sponsorAuditBusy}
                className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-black text-gray-800 transition hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sponsorAuditBusy ? 'Auditando sem sponsor...' : 'Auditar usuários sem sponsor'}
              </button>
            </div>

            <p className="mt-3 text-xs text-gray-500">
              Use o filtro para localizar rapidamente usuários sem sponsor. A auditoria em lote só gera leitura operacional e não altera usuários antigos.
            </p>
          </div>
        </div>
      </div>

      {(sponsorAuditAt || sponsorAuditRows.length > 0) && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-5 border-b border-gray-100 flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-start min-[640px]:justify-between">
            <div>
              <p className="text-sm font-black text-gray-900">Auditoria operacional: usuários sem patrocinador</p>
              <p className="mt-1 text-xs text-gray-500">
                Snapshot em lote para acompanhamento manual. Nenhum usuário foi alterado automaticamente.
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-gray-700">
              {sponsorAuditAt ? `Atualizado em ${formatDate(sponsorAuditAt)}` : 'Sem snapshot'}
            </span>
          </div>

          <div className="p-5">
            <div className="grid grid-cols-1 min-[540px]:grid-cols-2 xl:grid-cols-4 gap-4">
              <div className="rounded-2xl border border-red-100 bg-red-50/60 p-4">
                <p className="text-xs text-gray-500">Total sem sponsor</p>
                <p className="mt-1 text-xl font-black text-red-700">{sponsorAuditSummary.total}</p>
              </div>
              <div className="rounded-2xl border border-amber-100 bg-amber-50/70 p-4">
                <p className="text-xs text-gray-500">Com investimento</p>
                <p className="mt-1 text-xl font-black text-amber-700">{sponsorAuditSummary.invested}</p>
              </div>
              <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                <p className="text-xs text-gray-500">Com cotas</p>
                <p className="mt-1 text-xl font-black text-sky-700">{sponsorAuditSummary.withQuotas}</p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50/70 p-4">
                <p className="text-xs text-gray-500">Cadastros últimos 7 dias</p>
                <p className="mt-1 text-xl font-black text-violet-700">{sponsorAuditSummary.createdLast7Days}</p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-gray-200 bg-gray-50/60 overflow-hidden">
              <div className="border-b border-gray-100 px-4 py-3 flex items-center justify-between gap-3">
                <p className="text-sm font-black text-gray-900">Usuários encontrados na auditoria</p>
                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700">
                  máx. 200
                </span>
              </div>
              <div className="max-h-[260px] overflow-y-auto">
                {sponsorAuditRows.length === 0 ? (
                  <p className="p-4 text-sm text-gray-500">Nenhum usuário sem patrocinador encontrado no snapshot atual.</p>
                ) : (
                  sponsorAuditRows.map((item) => {
                    const itemId = String(item?.id || '');
                    const quotaUnits =
                      safeNum(item?.holdings?.cota10 || 0) + safeNum(item?.holdings?.cota50 || 0) + safeNum(item?.holdings?.cota100 || 0);
                    return (
                      <button
                        key={`audit-${itemId}`}
                        type="button"
                        onClick={() => {
                          setQuery(item?.username || item?.email || itemId);
                          setSponsorFilter('all');
                          setSelectedKey(itemId);
                        }}
                        className="w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-white"
                      >
                        <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-start min-[640px]:justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 truncate">@{item?.username || '—'}</p>
                            <p className="mt-1 text-xs text-gray-500 truncate">{item?.email || '—'}</p>
                            <p className="mt-1 text-[11px] text-gray-500">Cadastro: {item?.createdAt ? formatDate(item.createdAt) : '—'}</p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <span className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-black text-red-800">
                              Sem sponsor
                            </span>
                            <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700">
                              Investido: {formatMoney(item?.balances?.invested || 0)}
                            </span>
                            <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700">
                              Cotas: {quotaUnits}
                            </span>
                          </div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs text-gray-500">
              {sponsorFilter === 'without'
                ? 'Resultados sem patrocinador'
                : sponsorFilter === 'with'
                  ? 'Resultados com patrocinador'
                  : sponsorFilter === 'without_invested'
                    ? 'Resultados sem sponsor + com investimento'
                    : 'Resultados'}{' '}
              (máx. 50)
            </p>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {filtered.map((u) => {
              const id = String(u?.id || '');
              const active = selectedKey && String(selectedKey || '') === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSelectedKey(id)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${active ? 'bg-emerald-50' : ''}`}
                >
                  <p className="text-sm font-black text-gray-900 truncate">@{u?.username || '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{u?.email || '—'}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.16em] ${u?.hasSponsor ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-800'}`}
                    >
                      {u?.hasSponsor ? 'Com sponsor' : 'Sem sponsor'}
                    </span>
                    {u?.hasSponsor ? (
                      <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-[10px] font-black text-gray-600">
                        {u?.referrerUsername ? `@${u.referrerUsername}` : u?.sponsorEmail || 'Sponsor vinculado'}
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
            {loading && <p className="p-4 text-sm text-gray-500">Carregando...</p>}
            {!filtered.length && <p className="p-4 text-sm text-gray-500">Nenhum usuário encontrado.</p>}
          </div>
        </div>

        <div className="lg:col-span-8 space-y-6">
          {!selected ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
              <p className="text-sm text-gray-500">Selecione um usuário para ver os detalhes.</p>
            </div>
          ) : (
            <>
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs text-gray-500">Login</p>
                    <p className="text-xl font-black text-gray-900 truncate">@{shown?.username || '—'}</p>
                    <p className="mt-1 text-sm text-gray-600 truncate">{shown?.email || '—'}</p>
                  </div>
                  <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3 w-full min-[540px]:w-auto">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">userId</p>
                      <p className="mt-1 text-sm font-black text-gray-900 break-all">{shown?.userId || '—'}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Cadastro</p>
                      <p className="mt-1 text-sm font-black text-gray-900">{shown?.createdAt ? formatDate(shown.createdAt) : '—'}</p>
                    </div>
                  </div>
                </div>

                <div className="mt-5 grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                    <p className="text-xs text-gray-500">Total investido</p>
                    <p className="text-xl font-black text-gray-900">{formatMoney(selectedTotals.invested)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                    <p className="text-xs text-gray-500">Saldo disponível</p>
                    <p className="text-xl font-black text-gray-900">{formatMoney(selectedTotals.available)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                    <p className="text-xs text-gray-500">Ganhos de equipe (saldo)</p>
                    <p className="text-xl font-black text-gray-900">{formatMoney(selectedTotals.teamEarnings)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                    <p className="text-xs text-gray-500">Rank atual</p>
                    <p className="text-xl font-black text-emerald-700">{String(shown?.rankKey || '—').toUpperCase()}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">TE Nível 1</p>
                    <p className="text-lg font-black text-gray-900">{formatMoney(selectedTotals.teLevel1)}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">TE Nível 2</p>
                    <p className="text-lg font-black text-gray-900">{formatMoney(selectedTotals.teLevel2)}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">TE Nível 3</p>
                    <p className="text-lg font-black text-gray-900">{formatMoney(selectedTotals.teLevel3)}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">Total TE (3 níveis)</p>
                    <p className="text-lg font-black text-gray-900">{formatMoney(selectedTotals.totalTe)}</p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">Total residual</p>
                    <p className="text-lg font-black text-gray-900">{formatMoney(selectedTotals.totalResidual)}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">Total Elite</p>
                    <p className="text-lg font-black text-gray-900">{formatMoney(selectedTotals.totalElite)}</p>
                  </div>
                  <div className="bg-white rounded-2xl border border-gray-200 p-5">
                    <p className="text-xs text-gray-500">Total sacado</p>
                    <p className="text-lg font-black text-gray-900">{formatMoney(selectedTotals.totalWithdrawn)}</p>
                  </div>
                </div>

                <div className="mt-5 rounded-2xl border border-violet-100 bg-violet-50/50 p-5">
                  <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-start min-[640px]:justify-between">
                    <div>
                      <p className="text-sm font-black text-gray-900">Patrocinador atual</p>
                      <p className="mt-1 text-xs text-gray-500">Visualize o sponsor atual e faça a troca com auditoria completa.</p>
                    </div>
                    <span className="shrink-0 rounded-full border border-violet-200 bg-white px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
                      {currentSponsor?.username ? 'Com sponsor' : 'Sem sponsor'}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 min-[640px]:grid-cols-3 gap-3">
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Username</p>
                      <p className="mt-1 text-sm font-black text-gray-900 break-all">{currentSponsor?.username ? `@${currentSponsor.username}` : '—'}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">E-mail</p>
                      <p className="mt-1 text-sm font-black text-gray-900 break-all">{currentSponsor?.email || '—'}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">ID sponsor</p>
                      <p className="mt-1 text-sm font-black text-gray-900 break-all">{currentSponsor?.id || '—'}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4">
                    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                      <div>
                        <label className="text-xs font-black text-gray-600">Buscar novo patrocinador</label>
                        <input
                          value={sponsorSearch}
                          onChange={(e) => setSponsorSearch(e.target.value)}
                          placeholder="Digite login, e-mail ou uuid do sponsor"
                          className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                        />
                      </div>

                      <div className="rounded-2xl border border-gray-100 bg-gray-50/60 max-h-[220px] overflow-y-auto">
                        {sponsorSearchLoading ? <p className="p-4 text-sm text-gray-500">Buscando patrocinadores...</p> : null}
                        {!sponsorSearchLoading && sponsorSearch.trim().length < 2 ? (
                          <p className="p-4 text-sm text-gray-500">Digite pelo menos 2 caracteres para buscar.</p>
                        ) : null}
                        {!sponsorSearchLoading && sponsorSearch.trim().length >= 2 && sponsorCandidates.length === 0 ? (
                          <p className="p-4 text-sm text-gray-500">Nenhum patrocinador encontrado.</p>
                        ) : null}
                        {sponsorCandidates.map((candidate) => {
                          const active = String(selectedSponsorCandidate?.id || '') === String(candidate?.id || '');
                          return (
                            <button
                              key={String(candidate?.id || candidate?.email || Math.random())}
                              type="button"
                              onClick={() => setSelectedSponsorCandidate(candidate)}
                              className={`w-full border-b border-gray-100 px-4 py-3 text-left hover:bg-gray-50 ${active ? 'bg-emerald-50' : 'bg-transparent'}`}
                            >
                              <p className="text-sm font-black text-gray-900 truncate">@{candidate?.username || '—'}</p>
                              <p className="mt-1 text-xs text-gray-500 truncate">{candidate?.email || '—'}</p>
                              <p className="mt-1 text-[11px] text-gray-400 truncate">{candidate?.id || '—'}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                      <div className="rounded-2xl border border-gray-100 bg-gray-50 px-4 py-3">
                        <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Novo patrocinador selecionado</p>
                        <p className="mt-1 text-sm font-black text-gray-900">{selectedSponsorCandidate?.username ? `@${selectedSponsorCandidate.username}` : '—'}</p>
                        <p className="mt-1 text-xs text-gray-500 break-all">{selectedSponsorCandidate?.email || 'Selecione um usuário na busca ao lado.'}</p>
                      </div>

                      <div>
                        <label className="text-xs font-black text-gray-600">Motivo da alteração</label>
                        <textarea
                          value={sponsorReason}
                          onChange={(e) => setSponsorReason(e.target.value)}
                          rows={4}
                          placeholder="Ex.: cadastro sem patrocinador, correção operacional, ajuste solicitado..."
                          className="mt-1 w-full rounded-xl border border-gray-200 px-4 py-3 outline-none focus:ring-2 focus:ring-[#00FF00]"
                        />
                      </div>

                      <button
                        type="button"
                        onClick={handleRequestSponsorReassign}
                        disabled={sponsorChangeBusy || !selectedSponsorCandidate?.id}
                        className="w-full rounded-xl bg-[#00FF00] px-4 py-3 text-sm font-black text-black transition hover:bg-green-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {sponsorChangeBusy ? 'Alterando patrocinador...' : 'Alterar patrocinador'}
                      </button>

                      {sponsorFeedback ? (
                        <div
                          className={`rounded-2xl border px-4 py-3 text-sm ${
                            sponsorFeedback.type === 'success'
                              ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                              : 'border-red-200 bg-red-50 text-red-800'
                          }`}
                        >
                          {sponsorFeedback.message}
                        </div>
                      ) : null}

                      {sponsorChangeConfirmOpen ? (
                        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                          <p className="text-sm font-black text-amber-900">Confirmar troca de patrocinador</p>
                          <p className="mt-2 text-sm text-amber-900">
                            Usuário: <span className="font-black">@{shown?.username || 'usuario'}</span>
                          </p>
                          <p className="mt-1 text-sm text-amber-900">
                            De: <span className="font-black">{currentSponsorLabel}</span>
                          </p>
                          <p className="mt-1 text-sm text-amber-900">
                            Para: <span className="font-black">{nextSponsorLabel}</span>
                          </p>
                          <p className="mt-2 text-xs text-amber-800">
                            Essa ação atualiza o sponsor do usuário e registra log administrativo.
                          </p>
                          <div className="mt-4 flex flex-col gap-2 min-[540px]:flex-row">
                            <button
                              type="button"
                              onClick={() => void handleReassignSponsor()}
                              disabled={sponsorChangeBusy}
                              className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-black text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {sponsorChangeBusy ? 'Confirmando...' : 'Confirmar alteração'}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSponsorChangeConfirmOpen(false)}
                              disabled={sponsorChangeBusy}
                              className="rounded-xl border border-amber-200 bg-white px-4 py-3 text-sm font-black text-amber-900 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Cancelar
                            </button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-2xl border border-gray-200 bg-white overflow-hidden">
                    <div className="border-b border-gray-100 px-4 py-3">
                      <p className="text-sm font-black text-gray-900">Histórico de alterações de patrocinador</p>
                      <p className="mt-1 text-xs text-gray-500">Log completo com sponsor anterior, sponsor novo, admin responsável, data e motivo.</p>
                    </div>
                    <div className="max-h-[280px] overflow-y-auto">
                      {sponsorLogs.length === 0 ? (
                        <p className="p-4 text-sm text-gray-500">Nenhuma alteração registrada para este usuário.</p>
                      ) : (
                        sponsorLogs.map((log) => (
                          <div key={String(log?.id || log?.createdAt || Math.random())} className="border-b border-gray-100 px-4 py-4 last:border-b-0">
                            <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-start min-[640px]:justify-between">
                              <div className="min-w-0">
                                <p className="text-sm font-black text-gray-900">
                                  {log?.previousSponsorUsername ? `@${log.previousSponsorUsername}` : 'Sem sponsor'} {' -> '} @{log?.nextSponsorUsername || '—'}
                                </p>
                                <p className="mt-1 text-xs text-gray-500">
                                  Admin: <span className="font-black text-gray-700">{log?.actorEmail || '—'}</span> • {log?.createdAt ? formatDate(log.createdAt) : '—'}
                                </p>
                              </div>
                              <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-black text-gray-700 uppercase tracking-[0.18em]">
                                {log?.source || 'ADMIN_PANEL'}
                              </span>
                            </div>
                            <p className="mt-2 text-sm text-gray-600">
                              Motivo: <span className="font-black text-gray-800">{log?.reason || 'Não informado.'}</span>
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <p className="text-sm font-black text-gray-900">Cotas e cronômetro</p>
                  <p className="text-xs text-gray-500 mt-1">Datas de compra/início/fim e banca (inferida por quotaKey).</p>
                </div>
                <div className="p-5 space-y-3">
                  {selectedLots.length === 0 ? (
                    <p className="text-sm text-gray-500">Nenhuma cota registrada.</p>
                  ) : (
                    selectedLots.map((l) => (
                      <div key={l.id} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                        <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-gray-900 truncate">{l.planTitle || l.planKey}</p>
                            <p className="mt-1 text-xs text-gray-500">
                              Unidades: <span className="font-black text-gray-800">{safeNum(l.units || 0)}</span> • Banca:{' '}
                              <span className="font-black text-gray-800">{l.bankName}</span>
                            </p>
                          </div>
                          <span className="shrink-0 rounded-full border border-gray-200 bg-white px-3 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                            {String(l.status || '—')}
                          </span>
                        </div>

                        <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-3 gap-3">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Início</p>
                            <p className="mt-1 text-sm font-black text-gray-900">{l.startAt ? formatDate(l.startAt) : '—'}</p>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Término</p>
                            <p className="mt-1 text-sm font-black text-gray-900">{l.endAt ? formatDate(l.endAt) : '—'}</p>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Restante</p>
                            <p className="mt-1 text-sm font-black text-gray-900">
                              {Number.isFinite(l.leftMs) ? `${Math.ceil(l.leftMs / (1000 * 60 * 60 * 24))} dias` : '—'}
                            </p>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-3 gap-3">
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Taxa fixa</p>
                            <p className="mt-1 text-sm font-black text-gray-900">
                              {Number(l.fixedDailyPct || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%
                            </p>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Última taxa aplicada</p>
                            <p className="mt-1 text-sm font-black text-gray-900">
                              {l.latestDaily
                                ? `${Number(l.latestDaily?.meta?.effectiveDailyPct || l.fixedDailyPct || 0).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 4 })}%`
                                : '—'}
                            </p>
                          </div>
                          <div className="rounded-xl border border-gray-200 bg-white px-3 py-2">
                            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Último diário</p>
                            <p className="mt-1 text-sm font-black text-gray-900">
                              {l.latestDaily ? formatMoney(l.latestDaily?.amount || 0) : '—'}
                            </p>
                          </div>
                        </div>

                        {l.latestDaily && (
                          <p className="mt-3 text-xs text-gray-500">
                            {l.latestDaily?.meta?.overrideApplied ? 'Exceção diária aplicada' : 'Taxa fixa aplicada'} em {formatDate(l.latestDaily?.at)} •{' '}
                            {l.latestDaily?.meta?.bankName || l.bankName}
                          </p>
                        )}

                        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                          <div className="h-2.5 rounded-full bg-[#8A2BE2]" style={{ width: `${Number(l.progressPct || 0).toFixed(2)}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <AdminUserSponsorshipPanel
                user={shown}
                transactions={shown?.transactions}
                onGrantSponsorship={handleGrantSponsorship}
                busy={sponsorshipBusy}
              />

              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <p className="text-sm font-black text-gray-900">Rede do usuário (1º ao 5º nível)</p>
                  <p className="text-xs text-gray-500 mt-1">Login, e-mail, rank e cotas por indicado.</p>
                </div>
                <div className="p-5 space-y-4">
                  {selectedNetwork.map((lvlUsers, idx) => (
                    <div key={idx} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-black text-gray-900">{idx + 1}º nível</p>
                        <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700">
                          {lvlUsers.length}
                        </span>
                      </div>
                      {lvlUsers.length === 0 ? (
                        <p className="mt-3 text-sm text-gray-500">Sem indicados.</p>
                      ) : (
                        <div className="mt-3 grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {lvlUsers.map((u) => (
                            (() => {
                              const hasAnyQuota =
                                safeNum(u?.planStats?.cota10?.units || 0) +
                                  safeNum(u?.planStats?.cota50?.units || 0) +
                                  safeNum(u?.planStats?.cota100?.units || 0) >
                                0;
                              const statusLabel = hasAnyQuota ? 'ATIVO' : 'INATIVO';
                              const statusPillClass = hasAnyQuota
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                                : 'border-red-200 bg-red-50 text-red-800';
                              const cardClass = hasAnyQuota
                                ? 'border-emerald-200 bg-emerald-50/35 border-l-4 border-l-emerald-500'
                                : 'border-red-200 bg-red-50/30 border-l-4 border-l-red-500';

                              return (
                                <div key={u.key} className={`rounded-2xl border px-4 py-4 ${cardClass}`.trim()}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-gray-900 truncate">@{u.username}</p>
                                  <p className="mt-1 text-xs text-gray-500 truncate">{u.email}</p>
                                  <p className="mt-1 text-[11px] text-gray-500">Cadastro: {u.createdAt ? formatDate(u.createdAt) : '—'}</p>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                  <span
                                    className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.18em] whitespace-nowrap ${statusPillClass}`.trim()}
                                  >
                                    {statusLabel}
                                  </span>
                                  <span className="shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 whitespace-nowrap">
                                    {u.rankTitle}
                                  </span>
                                </div>
                              </div>

                              <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2">
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Total investido</p>
                                  <p className="mt-1 text-sm font-black text-gray-900">{formatMoney(u.invested)}</p>
                                </div>
                                <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Cotas</p>
                                  <p className="mt-1 text-sm font-black text-gray-900">{u.totalCotas}</p>
                                </div>
                              </div>

                              <div className="mt-3 flex flex-wrap gap-2">
                                {[
                                  { k: 'cota10', label: 'COTA 10', activeClass: 'border-sky-200 bg-sky-50 text-sky-800' },
                                  { k: 'cota50', label: 'COTA 50', activeClass: 'border-violet-200 bg-violet-50 text-violet-800' },
                                  { k: 'cota100', label: 'COTA 100', activeClass: 'border-amber-200 bg-amber-50 text-amber-900' },
                                ].map((x) => {
                                  const units = safeNum(u?.planStats?.[x.k]?.units || 0);
                                  const totalUsd = safeNum(u?.planStats?.[x.k]?.totalUsd || 0);
                                  const lastAt = u?.planStats?.[x.k]?.lastAt || null;
                                  const isActiveQuota = units > 0;
                                  const cls = isActiveQuota ? x.activeClass : 'border-gray-200 bg-gray-50 text-gray-500';

                                  return (
                                    <span key={x.k} className={`rounded-full border px-2.5 py-1 text-[11px] font-black whitespace-nowrap ${cls}`.trim()}>
                                      {x.label}: {units} • {formatMoney(totalUsd)}
                                      {lastAt ? ` • ${formatDate(lastAt)}` : ''}
                                    </span>
                                  );
                                })}
                              </div>
                                </div>
                              );
                            })()
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
