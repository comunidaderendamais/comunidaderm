import { useEffect, useState } from 'react';
import { Gift, Users } from 'lucide-react';
import BonusOverviewSection from '../bonus/BonusOverviewSection.jsx';
import EmptyStateCard from '../components/ui/EmptyStateCard.jsx';
import { calcElitePool, calcElitePayoutPerSlot, computeEliteBoard, ELITE_CATEGORIES, getEliteCategoryForRank } from '../elite/eliteEngine.js';
import { getT, fillTemplate, formatDateTime, formatMoneyUsd, formatMoneyUsdInt, getLocaleForLang, translateRankTitle } from '../i18n/i18n.js';
import { fetchEliteCandidates } from '../supabase/eliteRepo.js';
import { fetchMyTeamSummary } from '../supabase/dashboardRepo.js';
import { RANKS } from '../team/teamEngine.js';

export default function BonusView({ user, adminConfig, onOpenApn, lang }) {
  const t = getT(lang);
  const email = (user?.email || '').toLowerCase();
  const locale = getLocaleForLang(lang);
  const [summary, setSummary] = useState(null);
  const [eliteBoard, setEliteBoard] = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      const [teamRes, eliteRes] = await Promise.all([fetchMyTeamSummary({ maxDepth: 5 }), fetchEliteCandidates()]);
      if (cancelled) return;
      setSummary(teamRes.ok ? teamRes.summary : null);
      setEliteBoard(eliteRes.ok ? computeEliteBoard(eliteRes.users) : {});
      setLoading(false);
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [user?.id, user?.email]);

  const formatPct = (rate) => {
    const n = Number(rate || 0) * 100;
    const hasDecimal = Math.abs(n - Math.round(n)) > 1e-9;
    return `${n.toLocaleString(locale, { minimumFractionDigits: hasDecimal ? 1 : 0, maximumFractionDigits: 1 })}%`;
  };
  const eliteInfo = calcElitePool(adminConfig?.elite?.fortnightProfitUsd);
  const elitePool = eliteInfo.elitePool;
  const currentRankKey = String(summary?.rank?.key || 'FERRO').toUpperCase();
  const currentRankTitle = summary?.rank?.title || 'Ferro';
  const currentRankVolume = Number(summary?.rank?.volume || 0);
  const nextRank = summary?.rank?.next || null;
  const myEligibleCat = getEliteCategoryForRank(currentRankKey);

  const myAssignedCat = ELITE_CATEGORIES.map((c) => c.key).find((k) =>
    (eliteBoard?.[k]?.occupants || []).some((o) => String(o.email || '').toLowerCase() === email)
  );
  const myDisplayCat = myAssignedCat || myEligibleCat;
  const mySlot =
    myAssignedCat && eliteBoard?.[myAssignedCat]
      ? (eliteBoard[myAssignedCat].occupants || []).findIndex((o) => String(o.email || '').toLowerCase() === email)
      : -1;

  const getRankProgressVolume = (target) => {
    const legs = Array.isArray(summary?.legs) ? summary.legs : [];
    const numericTarget = Number(target || 0);
    const cap = numericTarget >= 200 ? numericTarget * 0.5 : null;
    return legs.reduce((acc, leg) => {
      const weighted = Number(leg?.weighted || 0);
      return acc + (cap == null ? weighted : Math.min(weighted, cap));
    }, 0);
  };
  const hasBonusMovement = currentRankVolume > 0 || Boolean(myDisplayCat) || Number(elitePool || 0) > 0;
  const bonusStatusLabel = myDisplayCat
    ? mySlot >= 0
      ? fillTemplate(t.bonusSlotTemplate, { slot: String(mySlot + 1), cat: String(myDisplayCat) })
      : fillTemplate(t.bonusQualifiedWaitingTemplate, { cat: String(myDisplayCat) })
    : t.bonusNotQualified;
  const nextRankLabel = nextRank
    ? fillTemplate(t.bonusNextRankTemplate, {
        rank: translateRankTitle(nextRank.title, t),
        target: formatMoneyUsdInt(nextRank.target, lang),
      })
    : t.bonusTop;
  const handleOpenResidualPdf = () =>
    onOpenApn?.({
      page: 11,
      title: `${t.apnPresentation} • ${t.apnResidualEarnings}`,
      shortcuts: [
        { label: t.apnResidualEarnings, page: 11 },
        { label: t.apnElitePool, page: 12 },
      ],
    });
  const handleOpenElitePdf = () =>
    onOpenApn?.({
      page: 12,
      title: `${t.apnPresentation} • ${t.apnElitePool}`,
      shortcuts: [
        { label: t.apnResidualEarnings, page: 11 },
        { label: t.apnElitePool, page: 12 },
      ],
    });

  return (
    <div className="p-4 min-[540px]:p-6 max-w-6xl mx-auto space-y-6">
      <BonusOverviewSection
        t={t}
        hasMovement={hasBonusMovement}
        rankTitle={translateRankTitle(currentRankTitle, t)}
        currentVolume={formatMoneyUsd(currentRankVolume, lang)}
        nextRankLabel={nextRankLabel}
        statusLabel={bonusStatusLabel}
        onOpenResidual={handleOpenResidualPdf}
        onOpenElite={handleOpenElitePdf}
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
          <div className="flex items-start gap-3">
            <Users className="w-5 h-5 text-emerald-900 mt-0.5" />
            <div>
              <p className="text-sm font-black text-emerald-900">{t.bonusRankSectionTitle}</p>
              <p className="text-xs text-gray-600 leading-snug max-w-md">
                {t.bonusRankQualificationRule}
              </p>
            </div>
          </div>
          <div className="mt-5 space-y-3">
            {RANKS.map((r) => (
              <div
                key={r.key}
                className="border border-gray-100 rounded-xl p-3 min-[540px]:p-4 bg-gray-50/70"
              >
                <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between gap-3">
                  <p className="text-lg font-black text-gray-900 leading-none">{translateRankTitle(r.title, t)}</p>
                  <div className="grid grid-cols-1 min-[540px]:grid-cols-2 gap-2 w-full min-[540px]:w-auto">
                    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusGoal}</p>
                      <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoneyUsdInt(r.target, lang)}</p>
                    </div>
                    <div className="rounded-lg bg-white border border-gray-200 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusPrize}</p>
                      <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoneyUsdInt(r.bonus, lang)}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-5 bg-emerald-900 rounded-2xl p-4 min-[540px]:p-6 shadow-sm border border-emerald-800 text-white">
          <p className="text-2xl min-[540px]:text-3xl font-black tracking-wide text-center">{t.bonusResidualShort}</p>

          <div className="mt-5 space-y-3 min-[540px]:hidden">
            {[1, 2, 3, 4, 5].map((lvl) => (
              <div key={lvl} className="rounded-xl border border-white/10 bg-white/5 p-3">
                <p className="text-sm font-black text-white mb-3">{fillTemplate(t.levelLabelTemplate, { n: String(lvl) })}</p>
                <div className="grid grid-cols-2 gap-2">
                  {RANKS.map((r) => {
                    const rate = lvl === 1 ? r.residual[1] : r.residual.other;
                    return (
                      <div key={`${r.key}-${lvl}`} className="rounded-lg bg-black/10 border border-white/10 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-white/70">{r.key === 'RM' ? 'RM' : translateRankTitle(r.title, t)}</p>
                        <p className="text-sm font-black text-white whitespace-nowrap">{formatPct(rate)}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className="hidden min-[540px]:block overflow-x-auto">
            <table className="mt-5 min-w-[520px] w-full text-left border-collapse">
              <thead>
                <tr className="text-sm text-white/90">
                  <th className="py-2 pr-4"> </th>
                  {RANKS.map((r) => (
                    <th key={r.key} className="py-2 pr-4 font-black">{r.key === 'RM' ? 'RM' : translateRankTitle(r.title, t)}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="text-sm">
                {[1, 2, 3, 4, 5].map((lvl) => (
                  <tr key={lvl} className="border-t border-white/10">
                    <td className="py-2 pr-4 font-black whitespace-nowrap">{fillTemplate(t.levelLabelTemplate, { n: String(lvl) })}</td>
                    {RANKS.map((r) => {
                      const rate = lvl === 1 ? r.residual[1] : r.residual.other;
                      return (
                        <td key={`${r.key}-${lvl}`} className="py-2 pr-4 font-semibold whitespace-nowrap">{formatPct(rate)}</td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 min-[540px]:p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-bold text-gray-800 mb-6">{t.bonusRewardsTrackTitle}</h3>
        {loading && <p className="text-sm text-gray-500 mb-4">{t.loading}</p>}
        {currentRankVolume <= 0 ? (
          <EmptyStateCard
            icon={Gift}
            title={t.bonusTrackEmptyTitle}
            description={t.bonusTrackEmptyDesc}
            className="mb-5"
          />
        ) : null}
        <div className="space-y-5">
          {RANKS.map((r) => {
            const v = getRankProgressVolume(r.target);
            const progress = r.target > 0 ? Math.min(100, (v / r.target) * 100) : 0;
            const unlocked = v >= r.target;
            return (
              <div key={r.key} className={`p-4 rounded-xl border ${unlocked ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between gap-3 mb-3">
                  <div className="min-w-0">
                    <p className={`font-black text-lg ${unlocked ? 'text-green-700' : 'text-gray-800'}`}>{translateRankTitle(r.title, t)}</p>
                    <div className="mt-2 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2">
                      <div className="rounded-lg bg-white/80 border border-gray-200 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusGoal}</p>
                        <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoneyUsdInt(r.target, lang)}</p>
                      </div>
                      <div className="rounded-lg bg-white/80 border border-gray-200 px-3 py-2">
                        <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusPrize}</p>
                        <p className="text-sm font-black text-gray-900 whitespace-nowrap">{formatMoneyUsdInt(r.bonus, lang)}</p>
                      </div>
                    </div>
                  </div>
                  <span className={`self-start min-[540px]:self-auto text-xs px-2 py-1 rounded font-black whitespace-nowrap ${unlocked ? 'bg-green-200 text-green-800' : 'bg-gray-200 text-gray-700'}`}>
                    {unlocked ? t.bonusAchieved : `${progress.toFixed(1)}%`}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                  <div className={`h-3 rounded-full ${unlocked ? 'bg-green-500' : 'bg-[#8A2BE2]'}`} style={{ width: `${progress}%` }} />
                </div>
                <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-2 gap-2 text-xs text-gray-500">
                  <div className="rounded-lg bg-white/70 border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusProgressLabel}</p>
                    <p className="font-black text-gray-700">{formatMoneyUsd(v, lang)} / {formatMoneyUsdInt(r.target, lang)}</p>
                  </div>
                  <div className="rounded-lg bg-white/70 border border-gray-200 px-3 py-2">
                    <p className="text-[11px] uppercase tracking-wide text-gray-500">{t.bonusResidualL1}</p>
                    <p className="font-black text-gray-700">{formatPct(r.residual[1])}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl p-4 min-[540px]:p-6 shadow-sm border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.bonusEliteTitle}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {t.bonusEliteDesc}
            </p>
          </div>
          <button
            type="button"
            onClick={handleOpenElitePdf}
            className="px-4 py-2 rounded-xl border border-gray-200 text-gray-800 font-black hover:bg-gray-50"
          >
            {t.bonusViewInPdf}
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500">{t.bonusBiweeklyProfitAdmin}</p>
            <p className="text-lg font-black text-gray-800">{formatMoneyUsdInt(eliteInfo.profit, lang)}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500">{t.bonusElitePool10}</p>
            <p className="text-lg font-black text-[#00FF00]">{formatMoneyUsd(elitePool, lang)}</p>
          </div>
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
            <p className="text-xs text-gray-500">{t.bonusYourStatus}</p>
            {myDisplayCat ? (
              <p className="text-sm font-black text-gray-800">
                {mySlot >= 0
                  ? fillTemplate(t.bonusSlotTemplate, { slot: String(mySlot + 1), cat: String(myDisplayCat) })
                  : fillTemplate(t.bonusQualifiedWaitingTemplate, { cat: String(myDisplayCat) })}
              </p>
            ) : (
              <p className="text-sm font-black text-gray-800">{t.bonusNotQualified}</p>
            )}
          </div>
        </div>

        {!myDisplayCat ? (
          <EmptyStateCard
            icon={Gift}
            title={t.bonusEliteEmptyTitle}
            description={t.bonusEliteEmptyDesc}
            className="mt-5"
          />
        ) : null}

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ELITE_CATEGORIES.map((cat) => {
            const block = eliteBoard?.[cat.key];
            const occupants = block?.occupants || [];
            const slotAmount = calcElitePayoutPerSlot(elitePool, cat.key);
            return (
              <div key={cat.key} className="bg-gray-50 rounded-2xl border border-gray-100 p-5">
                <div className="flex flex-col min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-gray-900">{cat.title}</p>
                    <p className="text-xs text-gray-500">
                      {cat.slots} {t.bonusSlotsWord} • {Math.round(Number(cat.pctPerSlot || 0) * 1000) / 10}% {t.bonusPerSlotWord} • {formatMoneyUsd(slotAmount, lang)} {t.bonusPerLeaderWord}
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
                      <div key={i} className="flex flex-col min-[540px]:flex-row min-[540px]:items-center min-[540px]:justify-between gap-2 bg-white rounded-xl border border-gray-200 px-3 py-3">
                        <p className="text-sm font-black text-gray-800">#{i + 1}</p>
                        {occ ? (
                          <div className="min-w-0 w-full min-[540px]:w-auto text-left min-[540px]:text-right">
                            <p className="text-sm font-black text-gray-900 break-all min-[540px]:break-normal min-[540px]:truncate">{occ.username || occ.email}</p>
                            <p className="text-[11px] text-gray-500">{t.bonusEntryLabel} {occ.achievedAt ? formatDateTime(occ.achievedAt, lang) : '—'}</p>
                          </div>
                        ) : (
                          <p className="text-sm text-gray-500 font-bold">{t.bonusSlotAvailable}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-gray-500 mt-4">
          {t.bonusRulesLabel} {t.bonusRulesText}
        </p>
        {adminConfig?.elite?.lastPaidAt && (
          <p className="text-xs text-gray-500 mt-1">
            {fillTemplate(t.bonusLastPaidSimulatedTemplate, { date: formatDateTime(adminConfig.elite.lastPaidAt, lang) })}
          </p>
        )}
      </div>
    </div>
  );
}

