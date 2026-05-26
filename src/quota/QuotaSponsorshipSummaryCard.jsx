const safeNum = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};

const formatDateTimeSafe = (value, locale) => {
  try {
    return new Date(value).toLocaleString(locale || 'pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    });
  } catch {
    return String(value || '-');
  }
};

const buildFallbackSummary = (items) => {
  const safeItems = Array.isArray(items) ? items : [];
  return safeItems.reduce(
    (acc, item) => {
      const totalUsd = safeNum(item?.totalUsd);
      const pendingUsd = safeNum(item?.pendingUsd);
      const collectedUsd = safeNum(item?.collectedUsd);
      const isOpen = String(item?.status || 'OPEN').toUpperCase() !== 'SETTLED';
      return {
        totalCount: acc.totalCount + 1,
        openCount: acc.openCount + (isOpen ? 1 : 0),
        settledCount: acc.settledCount + (isOpen ? 0 : 1),
        totalUsd: acc.totalUsd + totalUsd,
        pendingUsd: acc.pendingUsd + pendingUsd,
        collectedUsd: acc.collectedUsd + collectedUsd,
      };
    },
    {
      totalCount: 0,
      openCount: 0,
      settledCount: 0,
      totalUsd: 0,
      pendingUsd: 0,
      collectedUsd: 0,
    }
  );
};

const getTxMeta = (tx) => tx?.meta?.meta || tx?.meta || {};

export default function QuotaSponsorshipSummaryCard({
  t,
  locale,
  sponsorship,
  transactions,
  quotaLots,
  formatMoney,
}) {
  const items = Array.isArray(sponsorship?.items) ? sponsorship.items : [];
  const summary = sponsorship?.summary || buildFallbackSummary(items);
  const hasOpenSponsorship = safeNum(summary?.openCount) > 0;
  const lots = Array.isArray(quotaLots) ? quotaLots : [];
  const openItems = items
    .filter((item) => String(item?.status || 'OPEN').toUpperCase() !== 'SETTLED')
    .slice()
    .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));

  if (!hasOpenSponsorship) return null;

  const latestOffsets = (Array.isArray(transactions) ? transactions : [])
    .filter((tx) => String(tx?.kind || '').toUpperCase() === 'PATROCINIO_ABATE')
    .slice()
    .sort((a, b) => String(b?.at || '').localeCompare(String(a?.at || '')))
    .slice(0, 5);

  return (
    <div className="mt-8 bg-white rounded-[28px] shadow-[0_24px_70px_-40px_rgba(15,23,42,0.22)] border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <div className="flex flex-col gap-3 min-[640px]:flex-row min-[640px]:items-start min-[640px]:justify-between">
          <div>
            <h3 className="text-lg font-bold text-gray-800">{t.quotasSponsorshipTitle}</h3>
            <p className="text-sm text-gray-500 mt-1">{t.quotasSponsorshipSubtitle}</p>
          </div>
          <span className="inline-flex w-fit items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
            {t.quotasSponsorshipOpenCountTemplate.replace('{count}', String(safeNum(summary?.openCount)))}
          </span>
        </div>
      </div>

      <div className="p-6 space-y-6">
        <div className="grid grid-cols-1 gap-4 min-[540px]:grid-cols-3">
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.quotasSponsorshipPendingLabel}</p>
            <p className="mt-2 text-2xl font-black text-amber-600">{formatMoney(summary?.pendingUsd || 0)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.quotasSponsorshipCollectedLabel}</p>
            <p className="mt-2 text-2xl font-black text-emerald-700">{formatMoney(summary?.collectedUsd || 0)}</p>
          </div>
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.quotasSponsorshipOpenLabel}</p>
            <p className="mt-2 text-2xl font-black text-gray-900">{safeNum(summary?.openCount)}</p>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-gray-900">{t.quotasSponsorshipOpenLotsTitle}</p>
            <span className="text-xs text-gray-500">{t.quotasSponsorshipOpenCountTemplate.replace('{count}', String(openItems.length))}</span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-2">
            {openItems.map((item) => {
              const linkedLot = lots.find((lot) => String(lot?.id || '') === String(item?.lotId || ''));
              return (
                <div key={String(item?.id || item?.lotId || item?.createdAt || Math.random())} className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-gray-900">{item?.planTitle || t.quotasSponsorshipFallbackPlan}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {t.quotasSponsorshipUnitsTemplate.replace('{count}', String(safeNum(item?.units || 0)))}
                      </p>
                    </div>
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-amber-700">
                      {formatMoney(item?.pendingUsd || 0)}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 min-[540px]:grid-cols-[minmax(0,1fr)_24px_minmax(0,1fr)] min-[540px]:items-center">
                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.quotasSponsorshipCardLabel}</p>
                      <p className="mt-2 text-sm font-black text-gray-900">{item?.id || '-'}</p>
                    </div>

                    <div className="hidden min-[540px]:flex items-center justify-center text-gray-300 text-lg font-black">→</div>

                    <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                      <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.quotasSponsorshipLinkedLotLabel}</p>
                      <p className="mt-2 text-sm font-black text-gray-900">{linkedLot?.id || item?.lotId || '-'}</p>
                      <p className="mt-1 text-xs text-gray-500">
                        {linkedLot?.planTitle || item?.planTitle || t.quotasSponsorshipFallbackPlan}
                        {linkedLot?.status ? ` • ${linkedLot.status}` : ''}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-black text-gray-900">{t.quotasSponsorshipRecentOffsetsTitle}</p>
            <span className="text-xs text-gray-500">{t.quotasSponsorshipRecentOffsetsCount.replace('{count}', String(latestOffsets.length))}</span>
          </div>

          <div className="mt-3 space-y-3">
            {latestOffsets.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 px-4 py-5 text-sm text-gray-500">
                {t.quotasSponsorshipNoOffsets}
              </div>
            ) : (
              latestOffsets.map((tx) => {
                const meta = getTxMeta(tx);
                return (
                  <div key={tx.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-4">
                    <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center min-[640px]:justify-between">
                      <div>
                        <p className="text-sm font-black text-gray-900">{tx.type || t.quotasSponsorshipOffsetFallbackType}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {t.quotasSponsorshipSourceLabel}: {meta?.sourceKind || tx.payment || '-'}
                        </p>
                      </div>
                      <div className="text-left min-[640px]:text-right">
                        <p className="text-sm font-black text-gray-900">{formatMoney(Math.abs(safeNum(tx.amount)))}</p>
                        <p className="mt-1 text-xs text-gray-500">{formatDateTimeSafe(tx.at, locale)}</p>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
