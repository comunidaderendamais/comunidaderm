import { Gift } from 'lucide-react';
import { formatTeamMoney, getLegProgressPct } from './teamViewFormatters.js';
import { fillTemplate, getLocaleForLang, getT, translateRankTitle } from '../i18n/i18n.js';

const TeamRankCard = ({ t, lang, rankInfo, rankProgressPct, nextRankVolume, nextTargetPerLeg, entryFee }) => {
  const tr = t || getT(lang);
  const locale = getLocaleForLang(lang);

  return (
    <div className="rounded-[28px] border border-violet-200 bg-white p-4 sm:p-5 shadow-[0_20px_60px_-35px_rgba(139,92,246,0.45)]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-50 text-violet-600 border border-violet-100">
          <Gift className="h-5 w-5" />
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 truncate">{tr.teamRankTitle}</h3>
          <span className="shrink-0 rounded-full border border-violet-100 bg-violet-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-violet-700 whitespace-nowrap">
            {tr.teamRankBadge}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-500 text-center mx-auto max-w-[44ch]">{tr.teamRankSubtitle}</p>

      <div className="mt-5 rounded-[24px] bg-gradient-to-br from-violet-950 via-slate-950 to-slate-900 px-4 py-5 text-white">
        <div className="flex flex-col gap-3 min-[540px]:flex-row min-[540px]:items-start min-[540px]:justify-between">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-violet-200/80">{tr.teamRankVolumeLabel}</p>
            <p className="mt-2 text-3xl font-black">{formatTeamMoney(rankInfo?.volume)}</p>
            <p className="mt-1 text-xs text-slate-300">{tr.teamRankVolumeRuleHint}</p>
          </div>
          <div className="min-[540px]:text-right">
            <p className="text-[11px] uppercase tracking-[0.18em] text-violet-200/80">{tr.teamRankStatusLabel}</p>
            <p className="mt-2 text-xl font-black text-violet-300">{translateRankTitle(rankInfo?.current?.title, tr)}</p>
            <p className="mt-1 text-xs text-slate-300">
              {rankInfo?.next
                ? fillTemplate(tr.teamRankNextTemplate, {
                    title: translateRankTitle(rankInfo.next.title, tr),
                    target: formatTeamMoney(rankInfo.next.target),
                  })
                : tr.teamRankTopHint}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <div className="flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em] text-slate-400">
            <span>{tr.teamRankProgressLabel}</span>
            <span>{Number(rankProgressPct || 0).toLocaleString(locale, { maximumFractionDigits: 0 })}%</span>
          </div>
          <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-2.5 rounded-full bg-violet-400" style={{ width: `${rankProgressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {(nextRankVolume?.legs || []).map((leg) => {
          const pct = getLegProgressPct({ used: leg.used, targetPerLeg: nextTargetPerLeg });
          const id = String(leg.id || '').replace('leg', '');
          return (
            <div key={leg.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-black text-gray-900">
                  {fillTemplate(tr.teamLegLabel, { id })}
                </p>
                <p className="text-[11px] text-right font-semibold text-gray-500">
                  {formatTeamMoney(leg.used)} / {formatTeamMoney(nextTargetPerLeg)}
                </p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-200">
                <div className="h-2.5 rounded-full bg-violet-500" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-gray-500">{tr.teamLegContributionHint}</p>
            </div>
          );
        })}
      </div>

      <div className="mt-4 rounded-[24px] border border-violet-100 bg-violet-50/60 px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <p className="min-w-0 text-[13px] min-[380px]:text-sm font-black text-gray-900 leading-snug">
            {tr.teamEntryEarningsTitle}
          </p>
          <span className="shrink-0 rounded-full border border-violet-200 bg-white px-2.5 py-1 text-[11px] font-black text-violet-700 whitespace-nowrap">
            {tr.teamEntryEarningsBadge}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 min-[540px]:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white bg-white px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{fillTemplate(tr.teamLevelLabel, { lvl: 1 })}</p>
            <p className="mt-2 text-lg font-black text-gray-900">{formatTeamMoney(entryFee?.level1)}</p>
            <p className="mt-1 text-xs text-violet-700">{tr.teamEntryLevel1Hint}</p>
          </div>
          <div className="rounded-2xl border border-white bg-white px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{fillTemplate(tr.teamLevelLabel, { lvl: 2 })}</p>
            <p className="mt-2 text-lg font-black text-gray-900">{formatTeamMoney(entryFee?.level2)}</p>
            <p className="mt-1 text-xs text-violet-700">{tr.teamEntryLevel2Hint}</p>
          </div>
          <div className="rounded-2xl border border-white bg-white px-3 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{fillTemplate(tr.teamLevelLabel, { lvl: 3 })}</p>
            <p className="mt-2 text-lg font-black text-gray-900">{formatTeamMoney(entryFee?.level3)}</p>
            <p className="mt-1 text-xs text-violet-700">{tr.teamEntryLevel3Hint}</p>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500">{tr.teamEntryAutoHint}</p>
      </div>
    </div>
);
};

export default TeamRankCard;
