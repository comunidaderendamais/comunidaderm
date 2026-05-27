import { PieChart } from 'lucide-react';
import { formatTeamMoney, formatTeamPct } from './teamViewFormatters.js';
import { fillTemplate } from '../i18n/i18n.js';

const TeamResidualCard = ({ t, rankTitle, residual, onSimulateResidual }) => {
  const tr = t || {};

  return (
    <div className="rounded-[28px] border border-emerald-200 bg-white p-4 sm:p-5 shadow-[0_20px_60px_-35px_rgba(16,185,129,0.45)]">
      <div className="rounded-[24px] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-4 py-5 text-white">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-emerald-300 border border-white/10">
            <PieChart className="h-5 w-5" />
          </span>
          <div className="flex items-center gap-2 min-w-0">
            <h3 className="text-lg font-bold truncate">{tr.teamResidualTitle}</h3>
            <span className="shrink-0 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-300 whitespace-nowrap">
              {tr.teamResidualPayoutTimeBadge}
            </span>
          </div>
        </div>
        <p className="mt-3 max-w-[42ch] text-left text-sm text-slate-300">{tr.teamResidualSubtitle}</p>

        <div className="mt-5 grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{tr.teamResidualTotalDailyLabel}</p>
            <p className="mt-2 text-3xl font-black text-emerald-300">{formatTeamMoney(residual?.total)}</p>
            <p className="mt-1 text-xs text-slate-400">{tr.teamResidualTotalDailyHint}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{tr.teamResidualRankLabel}</p>
            <p className="mt-2 text-2xl font-black">{rankTitle}</p>
            <p className="mt-1 text-xs text-slate-400">{tr.teamResidualRankHint}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
        {Object.entries(residual?.byLevel || {}).map(([lvl, val]) => (
          <div key={lvl} className="rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">
                {fillTemplate(tr.teamLevelLabel, { lvl })}
              </p>
              <span className="rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[11px] font-black text-emerald-700">
                {lvl === '1' ? formatTeamPct(residual?.rates?.[1]) : formatTeamPct(residual?.rates?.other)}
              </span>
            </div>
            <p className="mt-2 text-xl font-black text-gray-900">{formatTeamMoney(val)}</p>
            <p className="mt-1 text-xs text-gray-500">{tr.teamResidualLevelProjectionHint}</p>
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onSimulateResidual}
        className="mt-4 w-full rounded-2xl bg-[#00FF00] px-4 py-3 text-sm font-black text-black transition hover:bg-green-400"
      >
        {tr.teamResidualSimulateBtn}
      </button>
      <p className="mt-3 text-center text-xs text-gray-500">{tr.teamResidualPhase2Hint}</p>
    </div>
);
};

export default TeamResidualCard;
