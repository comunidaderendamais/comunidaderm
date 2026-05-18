import { useMemo, useState } from 'react';
import { getBankByQuotaKey } from './adminStorage';
import { loadUsersState, listUsers } from '../users/usersStorage';
import { buildReferralLevels } from '../users/referralTree';
import { loadOrSeedTeamForUser } from '../team/teamStorage';
import { getCurrentRank } from '../team/teamEngine';

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

const getUserRankInfo = (u) => {
  const email = String(u?.email || '').toLowerCase();
  const seed = u?.username || email || 'user';
  const teamEntry = email ? loadOrSeedTeamForUser(email, seed) : null;
  return getCurrentRank(teamEntry?.team);
};

const sumTx = (txs, predicate) =>
  (Array.isArray(txs) ? txs : []).reduce((acc, tx) => {
    const amount = safeNum(tx?.amount || 0);
    if (!predicate(tx)) return acc;
    return acc + amount;
  }, 0);

export default function AdminUserView({ config }) {
  const [query, setQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState(null);

  const users = useMemo(() => listUsers(loadUsersState()), []);

  const filtered = useMemo(() => {
    const q = String(query || '').trim().toLowerCase();
    if (!q) return users.slice(0, 50);
    return users
      .filter((u) => {
        const email = String(u?.email || '').toLowerCase();
        const username = String(u?.username || '').toLowerCase();
        const userId = String(u?.userId || '').toLowerCase();
        const uuid = String(u?.uuid || u?.id || '').toLowerCase();
        return email.includes(q) || username.includes(q) || userId.includes(q) || uuid.includes(q);
      })
      .slice(0, 50);
  }, [users, query]);

  const selected = useMemo(() => {
    if (!selectedKey) return null;
    const key = String(selectedKey || '').toLowerCase();
    return users.find((u) => String(u?.email || '').toLowerCase() === key) || null;
  }, [users, selectedKey]);

  const selectedRank = useMemo(() => (selected ? getUserRankInfo(selected) : null), [selected]);

  const selectedTotals = useMemo(() => {
    const txs = Array.isArray(selected?.transactions) ? selected.transactions : [];
    const invested = safeNum(selected?.balances?.invested || 0);
    const available = safeNum(selected?.balances?.available || 0);
    const teamEarnings = safeNum(selected?.balances?.teamEarnings || 0);
    const eliteEarnings = safeNum(selected?.balances?.eliteEarnings || 0);
    const teEarnings = safeNum(selected?.balances?.teEarnings || 0);
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
  }, [selected]);

  const selectedLots = useMemo(() => {
    const lots = Array.isArray(selected?.quotaLots) ? selected.quotaLots : [];
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
        return {
          ...l,
          bankName: bank?.name || bank?.id || '—',
          leftMs,
          progressPct,
        };
      });
  }, [selected, config]);

  const selectedNetwork = useMemo(() => {
    if (!selected?.username) return [];
    const st = loadUsersState();
    const list = listUsers(st);
    const levels = buildReferralLevels({ users: list, rootUsername: selected.username, maxDepth: 5 });
    const PRICE_BY_PLAN = { cota10: 10, cota50: 50, cota100: 100 };
    return levels.map((lvlUsers, i) =>
      lvlUsers.map((u) => {
        const rankInfo = getUserRankInfo(u);
        const holdings = u?.holdings || {};
        const lots = Array.isArray(u?.quotaLots) ? u.quotaLots : [];
        const planStats = {
          cota10: { units: 0, lastAt: null, totalUsd: 0 },
          cota50: { units: 0, lastAt: null, totalUsd: 0 },
          cota100: { units: 0, lastAt: null, totalUsd: 0 },
        };
        lots.forEach((l) => {
          const k = String(l?.planKey || '');
          if (!planStats[k]) return;
          const units = safeNum(l?.units || 0);
          planStats[k].units += units;
          const at = String(l?.startAt || '');
          if (at && (!planStats[k].lastAt || String(planStats[k].lastAt) < at)) planStats[k].lastAt = at;
        });
        Object.keys(planStats).forEach((k) => {
          planStats[k].totalUsd = safeNum(planStats[k].units) * safeNum(PRICE_BY_PLAN[k] || 0);
        });
        const totalCotas = safeNum(holdings.cota10 || 0) + safeNum(holdings.cota50 || 0) + safeNum(holdings.cota100 || 0);
        return {
          key: String(u?.email || `${u?.username || ''}-${i}`),
          username: u?.username || '—',
          email: u?.email || '—',
          userId: u?.userId || '—',
          createdAt: u?.createdAt || u?.updatedAt || null,
          invested: safeNum(u?.balances?.invested || 0),
          holdings,
          totalCotas,
          planStats,
          rankTitle: rankInfo?.current?.title || '—',
        };
      })
    );
  }, [selected]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
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
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs text-gray-500">Resultados (máx. 50)</p>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {filtered.map((u) => {
              const email = String(u?.email || '').toLowerCase();
              const active = selectedKey && String(selectedKey || '').toLowerCase() === email;
              return (
                <button
                  key={email}
                  type="button"
                  onClick={() => setSelectedKey(email)}
                  className={`w-full text-left px-4 py-3 border-b border-gray-100 hover:bg-gray-50 ${active ? 'bg-emerald-50' : ''}`}
                >
                  <p className="text-sm font-black text-gray-900 truncate">@{u?.username || '—'}</p>
                  <p className="text-xs text-gray-500 truncate">{u?.email || '—'}</p>
                </button>
              );
            })}
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
                    <p className="text-xl font-black text-gray-900 truncate">@{selected?.username || '—'}</p>
                    <p className="mt-1 text-sm text-gray-600 truncate">{selected?.email || '—'}</p>
                  </div>
                  <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-3 w-full min-[540px]:w-auto">
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">userId</p>
                      <p className="mt-1 text-sm font-black text-gray-900 break-all">{selected?.userId || '—'}</p>
                    </div>
                    <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">Cadastro</p>
                      <p className="mt-1 text-sm font-black text-gray-900">{selected?.createdAt ? formatDate(selected.createdAt) : '—'}</p>
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
                    <p className="text-xl font-black text-emerald-700">{selectedRank?.current?.title || '—'}</p>
                    <p className="mt-1 text-xs text-gray-500">Volume: <span className="font-black text-gray-800">{formatMoney(selectedRank?.volume || 0)}</span></p>
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

                        <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
                          <div className="h-2.5 rounded-full bg-[#8A2BE2]" style={{ width: `${Number(l.progressPct || 0).toFixed(2)}%` }} />
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

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
                            <div key={u.key} className="rounded-2xl border border-gray-200 bg-white px-4 py-4">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-black text-gray-900 truncate">@{u.username}</p>
                                  <p className="mt-1 text-xs text-gray-500 truncate">{u.email}</p>
                                  <p className="mt-1 text-[11px] text-gray-500">Cadastro: {u.createdAt ? formatDate(u.createdAt) : '—'}</p>
                                </div>
                                <span className="shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 whitespace-nowrap">
                                  {u.rankTitle}
                                </span>
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
                                  { k: 'cota10', label: 'COTA 10' },
                                  { k: 'cota50', label: 'COTA 50' },
                                  { k: 'cota100', label: 'COTA 100' },
                                ]
                                  .filter((x) => safeNum(u?.planStats?.[x.k]?.units || 0) > 0)
                                  .map((x) => (
                                    <span
                                      key={x.k}
                                      className="rounded-full border border-[#00FF00]/20 bg-[#00FF00]/10 px-2.5 py-1 text-[11px] font-black text-emerald-800 whitespace-nowrap"
                                    >
                                      {x.label}: {safeNum(u?.planStats?.[x.k]?.units || 0)} • {formatMoney(u?.planStats?.[x.k]?.totalUsd || 0)}
                                      {u?.planStats?.[x.k]?.lastAt ? ` • ${formatDate(u.planStats[x.k].lastAt)}` : ''}
                                    </span>
                                  ))}
                                {safeNum(u?.planStats?.cota10?.units || 0) === 0 &&
                                  safeNum(u?.planStats?.cota50?.units || 0) === 0 &&
                                  safeNum(u?.planStats?.cota100?.units || 0) === 0 && (
                                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 text-[11px] font-black text-gray-600 whitespace-nowrap">
                                      Sem aplicações
                                    </span>
                                  )}
                              </div>
                            </div>
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
