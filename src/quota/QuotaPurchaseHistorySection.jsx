import EmptyStateCard from '../components/ui/EmptyStateCard.jsx';
import StatusBadge from '../components/ui/StatusBadge.jsx';
import { PieChart } from 'lucide-react';
import { getTransactionStatusLabel } from '../payments/nowpaymentsPresentation.js';

export default function QuotaPurchaseHistorySection({
  t,
  transactions,
  lang,
  formatDateTime,
  formatMoneyUsd,
  translateTransactionType,
  getStatusLabel,
}) {
  const rows = (Array.isArray(transactions) ? transactions : []).slice(0, 25);

  return (
    <div className="mt-8 bg-white rounded-[28px] shadow-[0_24px_70px_-40px_rgba(15,23,42,0.22)] border border-gray-200 overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <h3 className="text-lg font-bold text-gray-800">{t.quotasHistoryTitle}</h3>
        <p className="text-sm text-gray-500 mt-1">{t.quotasHistorySubtitle}</p>
      </div>

      {rows.length === 0 ? (
        <div className="px-6 py-10">
          <div className="mx-auto max-w-xl">
            <EmptyStateCard icon={PieChart} title={t.quotasHistoryEmptyTitle} description={t.quotasHistoryEmptyDesc} />
          </div>
        </div>
      ) : (
        <>
          <div className="md:hidden p-4 space-y-3">
            {rows.map((tx) => (
              <div key={tx.id} className="rounded-2xl border border-gray-200 bg-gray-50/80 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-black text-gray-900">{translateTransactionType(tx.type, t)}</p>
                    <p className="mt-1 text-xs text-gray-500">{formatDateTime(tx.at, lang)}</p>
                  </div>
                  <StatusBadge className="rounded-full px-3 py-1 text-[11px] font-bold shrink-0">
                    {getTransactionStatusLabel(tx, t, getStatusLabel)}
                  </StatusBadge>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.quotasTablePayment}</p>
                    <p className="mt-2 text-sm font-black text-gray-900 break-words">{tx.payment || '—'}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-white px-3 py-3">
                    <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.quotasTableValue}</p>
                    <p className="mt-2 text-sm font-black text-gray-900">{formatMoneyUsd(tx.amount, lang)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50 text-gray-500 text-sm">
                  <th className="p-4">{t.quotasTableDate}</th>
                  <th className="p-4">{t.quotasTableType}</th>
                  <th className="p-4">{t.quotasTablePayment}</th>
                  <th className="p-4">{t.quotasTableStatus}</th>
                  <th className="p-4 text-right">{t.quotasTableValue}</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-700">
                {rows.map((tx) => (
                  <tr key={tx.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="p-4 whitespace-nowrap">{formatDateTime(tx.at, lang)}</td>
                    <td className="p-4">{translateTransactionType(tx.type, t)}</td>
                    <td className="p-4">{tx.payment || '—'}</td>
                    <td className="p-4">
                      <StatusBadge className="rounded text-xs px-2 py-1 font-bold">{getTransactionStatusLabel(tx, t, getStatusLabel)}</StatusBadge>
                    </td>
                    <td className="p-4 text-right font-bold">{formatMoneyUsd(tx.amount, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
