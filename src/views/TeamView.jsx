import { useEffect, useMemo, useState } from 'react';
import TeamOverviewSection from '../team/TeamOverviewSection.jsx';
import { fetchMyNetwork, fetchMyTeamSummary } from '../supabase/dashboardRepo.js';
import { fillTemplate, getT, translateRankTitle } from '../i18n/i18n.js';

const getLocale = (lang) => {
  const key = String(lang || '').trim().toLowerCase();
  if (key === 'en') return 'en-US';
  if (key === 'es') return 'es-ES';
  return 'pt-BR';
};

const PAGE_SIZE = 6;

const safeNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const PLAN_KEYS = ['cota10', 'cota50', 'cota100'];

const getPlanStats = (user) => {
  const holdings = user?.holdings || {};
  const provided = user?.planStats || {};
  return PLAN_KEYS.map((key) => {
    const units = safeNum(provided?.[key]?.units ?? holdings?.[key] ?? 0);
    return {
      key,
      units,
      totalUsd: safeNum(provided?.[key]?.totalUsd ?? (key === 'cota10' ? units * 10 : key === 'cota50' ? units * 50 : units * 100)),
    };
  });
};

const normalizeUserRow = (user, index) => {
  const planStats = getPlanStats(user);
  const totalCotas = safeNum(user?.totalCotas || planStats.reduce((acc, plan) => acc + plan.units, 0));
  return {
    key: String(user?.key || user?.id || user?.userId || `${index}`),
    username: String(user?.username || user?.login || user?.userId || '—'),
    email: String(user?.email || '—'),
    createdAt: user?.createdAt || user?.created_at || null,
    invested: safeNum(user?.invested ?? user?.balances?.invested ?? 0),
    rankTitle: user?.rankTitle || user?.rank_key || user?.rankKey || '—',
    totalCotas,
    planStats,
  };
};

const buildLevelsFromLegs = (directLegs) => {
  return [1, 2, 3, 4, 5].map((level) => {
    const users = [];
    (Array.isArray(directLegs) ? directLegs : []).forEach((leg, legIndex) => {
      const members = leg?.membersByLevel?.[level];
      if (!Array.isArray(members)) return;
      members.forEach((member, memberIndex) => {
        users.push(normalizeUserRow(member, `${level}-${legIndex}-${memberIndex}`));
      });
    });
    return { level, users };
  });
};

const resolveLegSource = (source) => {
  if (!source || typeof source !== 'object') return [];
  if (Array.isArray(source?.directLegs)) return source.directLegs;
  if (Array.isArray(source?.team?.directLegs)) return source.team.directLegs;
  if (Array.isArray(source?.teamState?.directLegs)) return source.teamState.directLegs;
  if (Array.isArray(source?.team_state?.directLegs)) return source.team_state.directLegs;
  if (Array.isArray(source?.profile?.team_state?.directLegs)) return source.profile.team_state.directLegs;
  if (Array.isArray(source?.profile?.teamState?.directLegs)) return source.profile.teamState.directLegs;
  return [];
};

const normalizeLevels = (levels) => {
  return [1, 2, 3, 4, 5].map((level) => {
    const source =
      (Array.isArray(levels) ? levels : []).find((item, idx) => Number(item?.level || item?.lvl || idx + 1) === level) || null;
    const users = Array.isArray(source?.users)
      ? source.users.map((user, index) => normalizeUserRow(user, `${level}-${index}`))
      : Array.isArray(source)
        ? source.map((user, index) => normalizeUserRow(user, `${level}-${index}`))
        : [];
    return { level, users };
  });
};

const TeamNetworkLevelsCard = ({ t, lang, levels }) => {
  const tr = t || getT(lang);
  const locale = getLocale(lang);
  const formatDate = (iso) => {
    try {
      return new Date(iso).toLocaleDateString(locale, { dateStyle: 'short' });
    } catch {
      return String(iso || '');
    }
  };
  const formatMoney = (value) =>
    new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(safeNum(value));

  const safeLevels = useMemo(() => {
    if (Array.isArray(levels) && levels.length) return normalizeLevels(levels);
    if (Array.isArray(levels?.levels) && levels.levels.length) return normalizeLevels(levels.levels);
    if (Array.isArray(levels?.networkLevels) && levels.networkLevels.length) return normalizeLevels(levels.networkLevels);
    const directLegs = resolveLegSource(levels);
    if (directLegs.length) return buildLevelsFromLegs(directLegs);
    return normalizeLevels([]);
  }, [levels]);
  const [pageByLevel, setPageByLevel] = useState({});

  const total = safeLevels.reduce((acc, lvl) => acc + (Array.isArray(lvl?.users) ? lvl.users.length : 0), 0);

  return (
    <div className="rounded-[32px] border border-slate-200 bg-white p-4 min-[540px]:p-6 lg:p-7 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.35)]">
      <div className="flex flex-col gap-3 min-[840px]:flex-row min-[840px]:items-start min-[840px]:justify-between">
        <div className="min-w-0">
          <h3 className="text-lg font-black text-gray-900 truncate">{tr.teamNetworkTitle}</h3>
          <p className="mt-2 text-sm text-gray-500">{tr.teamNetworkSubtitle}</p>
        </div>
        <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-slate-700 whitespace-nowrap">
          {fillTemplate(tr.teamUsersCountTemplate, { count: total })}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        {safeLevels.map((lvl) => {
          const users = Array.isArray(lvl?.users) ? lvl.users : [];
          const page = Math.max(1, Number(pageByLevel[lvl.level] || 1));
          const totalPages = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
          const visibleUsers = users.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

          return (
            <div key={lvl.level} className="rounded-[28px] border border-slate-200 bg-slate-50/70 p-4 min-[540px]:p-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-gray-900">{fillTemplate(tr.teamLevelLabel, { lvl: lvl.level })}</p>
                <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700 whitespace-nowrap">
                  {users.length}
                </span>
              </div>

              {users.length === 0 ? (
                <p className="mt-3 text-sm text-gray-500">{tr.teamNoReferralsAtLevel}</p>
              ) : (
                <>
                  <div className="mt-3 grid grid-cols-1 xl:grid-cols-2 gap-3">
                    {visibleUsers.map((u) => {
                      const rankLabel = translateRankTitle(u.rankTitle, tr);
                      const hasAnyQuota = u.planStats.some((plan) => plan.units > 0);
                      const statusLabel = hasAnyQuota ? tr.teamStatusActive : tr.teamStatusInactive;
                      const statusPillClass = hasAnyQuota
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-red-200 bg-red-50 text-red-800';
                      const cardClass = hasAnyQuota
                        ? 'border-emerald-200 bg-emerald-50/35 border-l-4 border-l-emerald-500'
                        : 'border-red-200 bg-red-50/30 border-l-4 border-l-red-500';

                      return (
                        <div
                          key={u.key}
                          className={`rounded-[26px] border px-4 py-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.55)] min-[540px]:px-5 ${cardClass}`.trim()}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-base font-black text-slate-950 truncate">@{u.username || '—'}</p>
                              <p className="mt-1 text-xs text-slate-500">{tr.teamSignupLabel}: {u.createdAt ? formatDate(u.createdAt) : '—'}</p>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                              <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-black uppercase tracking-[0.18em] whitespace-nowrap ${statusPillClass}`.trim()}>
                                {statusLabel}
                              </span>
                              <span className="shrink-0 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700 whitespace-nowrap">
                                {rankLabel}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2.5">
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{tr.teamInvestedLabel}</p>
                              <p className="mt-1.5 text-lg font-black text-slate-950">{formatMoney(u.invested)}</p>
                            </div>
                            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3.5 py-3">
                              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{tr.teamQuotasLabel}</p>
                              <p className="mt-1.5 text-lg font-black text-slate-950">{u.totalCotas}</p>
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-3 gap-2">
                            {u.planStats.map((plan) => (
                              <div key={plan.key} className="rounded-2xl border border-slate-200 bg-white px-3 py-3">
                                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-500">{tr[`${plan.key}Label`] || plan.key.toUpperCase()}</p>
                                <p className="mt-1 text-base font-black text-slate-950">{plan.units}</p>
                                <p className="mt-1 text-xs text-slate-500">{formatMoney(plan.totalUsd)}</p>
                              </div>
                            ))}
                          </div>

                          {!hasAnyQuota ? (
                            <div className="mt-3">
                              <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-black text-slate-600 whitespace-nowrap">
                                {tr.teamNoActiveQuotas}
                              </span>
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {totalPages > 1 ? (
                    <div className="mt-4 flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
                      <p className="text-xs text-slate-500">
                        {fillTemplate(tr.teamPaginationTemplate, {
                          start: String((page - 1) * PAGE_SIZE + 1),
                          end: String(Math.min(page * PAGE_SIZE, users.length)),
                          total: String(users.length),
                        })}
                      </p>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setPageByLevel((current) => ({ ...current, [lvl.level]: Math.max(1, page - 1) }))}
                          disabled={page <= 1}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {tr.teamPaginationPrev}
                        </button>
                        <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700 whitespace-nowrap">
                          {page} / {totalPages}
                        </span>
                        <button
                          type="button"
                          onClick={() => setPageByLevel((current) => ({ ...current, [lvl.level]: Math.min(totalPages, page + 1) }))}
                          disabled={page >= totalPages}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {tr.teamPaginationNext}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default function TeamView({ user, lang, onOpenApn }) {
  const t = getT(lang);
  const [summary, setSummary] = useState(null);
  const [networkLevels, setNetworkLevels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [copiedRefLink, setCopiedRefLink] = useState(false);
  const refLink = `https://comunidaderm.com/ref/${user?.username || 'user'}`;

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const [summaryRes, networkRes] = await Promise.all([fetchMyTeamSummary({ maxDepth: 5 }), fetchMyNetwork({ maxDepth: 5 })]);
      if (cancelled) return;
      setSummary(summaryRes.ok ? summaryRes.summary : null);
      setNetworkLevels(networkRes.ok ? networkRes.levels : []);
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  const rankTitle = translateRankTitle(summary?.rank?.title || 'Ferro', t);
  const directVol = Number(summary?.directVolume || 0);
  const indirectVol = Number(summary?.indirectVolume || 0);
  const residualTotal = Number(user?.balances?.teamEarnings || 0);
  const te1 = Number(summary?.entryFee?.level1 || 0);
  const te2 = Number(summary?.entryFee?.level2 || 0);
  const te3 = Number(summary?.entryFee?.level3 || 0);
  const legs = Array.isArray(summary?.legs) ? summary.legs : [];
  const currentRankVolume = Number(summary?.rank?.volume || 0);
  const nextRank = summary?.rank?.next || null;
  const networkSource =
    Array.isArray(networkLevels) && networkLevels.some((level) => Array.isArray(level?.users) && level.users.length > 0)
      ? networkLevels
      : {
          ...(summary || {}),
          teamState: user?.teamState || summary?.teamState || summary?.team_state || {},
        };

  const handleCopyRefLink = async () => {
    try {
      await navigator.clipboard.writeText(refLink);
      setCopiedRefLink(true);
      window.setTimeout(() => setCopiedRefLink(false), 1800);
    } catch {
      setCopiedRefLink(false);
    }
  };

  const handleOpenPresentation = () =>
    onOpenApn?.({
      page: 10,
      title: `${t.apnPresentation} • ${t.apnTeamEarnings}`,
      shortcuts: [
        { label: t.apnTeamEarnings, page: 10 },
        { label: t.apnResidual, page: 11 },
      ],
    });

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      <TeamOverviewSection
        t={t}
        rankTitle={rankTitle}
        directVol={directVol}
        indirectVol={indirectVol}
        residualTotal={residualTotal}
        entryFee={{ level1: te1, level2: te2, level3: te3 }}
        legs={legs}
        currentRankVolume={currentRankVolume}
        nextRank={nextRank}
        loading={loading}
        copied={copiedRefLink}
        onCopyRefLink={handleCopyRefLink}
        onOpenPresentation={handleOpenPresentation}
      />
      <TeamNetworkLevelsCard t={t} lang={lang} levels={networkSource} />
    </div>
  );
}
