import { CalendarClock, ChevronRight, Wallet } from 'lucide-react';
import { formatDateShort, formatMoneyUsd } from '../i18n/i18n.js';
import { getLotProgress, getQuotaEarningsSummary } from '../quota/quotaPresentation.js';

export default function QuotaLotProgressCard({ lot, lang, t, onOpenDetails, onRequestCancellation }) {
  const progress = getLotProgress(lot);
  const earnings = getQuotaEarningsSummary(lot);

  return (
    <div className="border border-gray-200 rounded-2xl p-4 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => onOpenDetails?.(lot)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-black text-gray-800">{lot.planTitle} x{lot.units}</p>
            <p className="mt-1 text-xs text-gray-500">{t.walletStart} {formatDateShort(lot.startAt, lang)}</p>
            <p className="text-xs text-gray-500">{t.walletEnd} {formatDateShort(lot.endAt, lang)}</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-black text-[#8A2BE2]">
            {t.walletLotOpenDetailsBtn}
            <ChevronRight size={14} />
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-500">{t.walletLotDailyGainLabel}</p>
            <p className="mt-1 text-sm font-black text-gray-900">{formatMoneyUsd(earnings.lot.dailyUsd, lang)}</p>
            <p className="mt-1 text-xs text-gray-500">{earnings.dailyPct}%{t.quotasPerDaySuffix}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-500">{t.walletLotMonthlyGainLabel}</p>
            <p className="mt-1 text-sm font-black text-gray-900">{formatMoneyUsd(earnings.lot.monthlyUsd, lang)}</p>
            <p className="mt-1 text-xs text-gray-500">{earnings.monthlyPct}%{t.quotasPerMonthSuffix}</p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-gray-500">{t.walletLotCycleGainLabel}</p>
            <p className="mt-1 text-sm font-black text-gray-900">{formatMoneyUsd(earnings.lot.cycleUsd, lang)}</p>
            <p className="mt-1 text-xs text-gray-500">6x {earnings.monthlyPct}%{t.quotasPerMonthSuffix}</p>
          </div>
        </div>

        <div className="mt-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-gray-500">{t.walletLotProgressLabel}</p>
            <p className="text-xs font-black text-gray-800">{progress.progressPct.toFixed(1)}%</p>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2 overflow-hidden">
            <div className="h-2.5 rounded-full bg-[#8A2BE2]" style={{ width: `${progress.progressPct}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-xs text-gray-500">
              <CalendarClock size={14} />
              {t.walletLotElapsedLabel} {progress.elapsedDays} {t.walletDays}
            </span>
            <span className="inline-flex items-center gap-2 text-xs font-black text-gray-800">
              <Wallet size={14} />
              {t.walletTimeRemaining} {progress.remainingDays} {t.walletDays}
            </span>
          </div>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onRequestCancellation?.(lot)}
        className="w-full mt-4 px-4 py-2 rounded-xl border border-gray-300 text-gray-800 font-black hover:border-red-300 hover:text-red-600"
      >
        {t.walletRequestCancellationBtn}
      </button>
    </div>
  );
}
