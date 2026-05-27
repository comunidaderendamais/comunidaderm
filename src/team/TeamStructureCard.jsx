import { Users } from 'lucide-react';
import { formatTeamMoney, formatTeamPct } from './teamViewFormatters.js';
import { fillTemplate, getT } from '../i18n/i18n.js';

const TeamStructureCard = ({ t, rankTitle, totalBase, activeResidualRate, levels }) => {
  const tr = t || getT('pt');

  return (
    <div className="rounded-[28px] border border-slate-200 bg-white p-4 sm:p-5 shadow-[0_20px_60px_-35px_rgba(15,23,42,0.45)]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 border border-blue-100">
          <Users className="h-5 w-5" />
        </span>
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-lg font-bold text-gray-900 truncate">{tr.teamStructureTitle}</h3>
          <span className="shrink-0 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-blue-700 whitespace-nowrap">
            {tr.teamStructureLevelsBadge}
          </span>
        </div>
      </div>
      <p className="mt-3 text-sm text-gray-500 text-center mx-auto max-w-[40ch]">{tr.teamStructureSubtitle}</p>

      <div className="mt-5 grid grid-cols-1 min-[540px]:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
          <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{tr.teamStructureTotalBaseLabel}</p>
          <p className="mt-2 text-2xl font-black">{formatTeamMoney(totalBase)}</p>
          <p className="mt-1 text-xs text-slate-400">{tr.teamStructureTotalBaseHint}</p>
        </div>
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50 px-4 py-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-emerald-700">{tr.teamStructureActiveRateLabel}</p>
          <p className="mt-2 text-2xl font-black text-emerald-700">{formatTeamPct(activeResidualRate)}</p>
          <p className="mt-1 text-xs text-emerald-700/80">
            {fillTemplate(tr.teamStructureActiveRateHint, { rank: rankTitle })}
          </p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 min-[540px]:grid-cols-2 gap-3 text-sm">
        {levels.map(({ lvl, base, rate }) => (
          <div key={lvl} className="rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{fillTemplate(tr.teamLevelLabel, { lvl })}</p>
                <p className="mt-2 text-lg font-black text-gray-900">{formatTeamMoney(base)}</p>
              </div>
              <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] font-black text-gray-700">
                {formatTeamPct(rate)}
              </span>
            </div>
            <p className="mt-2 text-xs text-gray-500">{tr.teamStructureLevelBaseHint}</p>
          </div>
        ))}
      </div>
    </div>
);
};

export default TeamStructureCard;
