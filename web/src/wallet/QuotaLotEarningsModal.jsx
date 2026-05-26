import { X } from 'lucide-react';
import InfoRow from '../components/ui/InfoRow.jsx';
import { formatDateTime, formatMoneyUsd } from '../i18n/i18n.js';
import { getLotProgress, getQuotaEarningsSummary } from '../quota/quotaPresentation.js';

export default function QuotaLotEarningsModal({ open, lot, lang, t, onClose }) {
  if (!open || !lot) return null;

  const earnings = getQuotaEarningsSummary(lot);
  const progress = getLotProgress(lot);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative w-full max-w-2xl rounded-2xl border border-[#8A2BE2] bg-white shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-4 bg-[#1A1A1A] px-5 py-4 text-white">
          <div>
            <p className="text-xs text-gray-300">{t.walletLotDetailsModalTitle}</p>
            <p className="text-lg font-black">{lot.planTitle} x{lot.units}</p>
          </div>
          <button type="button" onClick={onClose} className="text-white">
            <X size={22} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="rounded-2xl border border-purple-200 bg-purple-50 px-4 py-4">
            <p className="text-sm font-black text-[#6b21a8]">{t.walletLotDetailsHint}</p>
            <p className="mt-1 text-sm text-[#6b21a8]">
              {t.walletLotPurchasedAtLabel} {formatDateTime(lot.startAt, lang)}. {t.walletLotProgressLabel} {progress.progressPct.toFixed(1)}%.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-sm font-black text-gray-800">{t.walletLotPerQuotaTitle}</p>
              <InfoRow label={t.walletLotDailyGainLabel} value={`${formatMoneyUsd(earnings.perUnit.dailyUsd, lang)} • ${earnings.dailyPct}%${t.quotasPerDaySuffix}`} />
              <InfoRow label={t.walletLotMonthlyGainLabel} value={`${formatMoneyUsd(earnings.perUnit.monthlyUsd, lang)} • ${earnings.monthlyPct}%${t.quotasPerMonthSuffix}`} />
              <InfoRow label={t.walletLotCycleGainLabel} value={`${formatMoneyUsd(earnings.perUnit.cycleUsd, lang)} • ${earnings.cyclePct}% / ${earnings.cycleMonths} ${t.walletCycleMonthsWord}`} />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-black text-gray-800">{t.walletLotThisLotTitle}</p>
              <InfoRow label={t.walletLotDailyGainLabel} value={formatMoneyUsd(earnings.lot.dailyUsd, lang)} hint={`${lot.units}x ${earnings.title}`} />
              <InfoRow label={t.walletLotMonthlyGainLabel} value={formatMoneyUsd(earnings.lot.monthlyUsd, lang)} hint={`${lot.units}x ${earnings.title}`} />
              <InfoRow label={t.walletLotCycleGainLabel} value={formatMoneyUsd(earnings.lot.cycleUsd, lang)} hint={`${lot.units}x ${earnings.title}`} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
