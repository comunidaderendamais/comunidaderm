import { useState } from 'react';
import ReportsOverviewSection from '../reports/ReportsOverviewSection.jsx';
import { formatDateTime, formatMoneyUsd, getStatusLabel, getT, translateTransactionType } from '../i18n/i18n.js';
import { normalizeUser } from '../shared/normalizeUser.js';

export default function ReportsView({ user, lang }) {
  const currentUser = normalizeUser(user);
  const t = getT(lang);
  const [visibleCount, setVisibleCount] = useState(20);

  const reports = (Array.isArray(currentUser.transactions) ? currentUser.transactions : [])
    .slice()
    .sort((a, b) => String(b?.at || '').localeCompare(String(a?.at || '')))
    .map((tx, i) => ({
      id: tx.id || i,
      date: formatDateTime(tx.at, lang),
      type: translateTransactionType(tx.type, t),
      value: `${tx.amount >= 0 ? '+' : '-'}${formatMoneyUsd(Math.abs(tx.amount), lang)}`,
      status: getStatusLabel(tx.status, t),
      color: tx.amount > 0 ? 'text-green-600' : 'text-red-500',
    }));
  const totalCount = reports.length;
  const creditCount = reports.filter((rep) => String(rep.value || '').startsWith('+')).length;
  const debitCount = reports.filter((rep) => String(rep.value || '').startsWith('-')).length;
  const latestDate = reports[0]?.date || '';

  return (
    <div className="p-4 min-[540px]:p-6 max-w-7xl mx-auto space-y-6">
      <ReportsOverviewSection
        t={t}
        totalCount={totalCount}
        creditCount={creditCount}
        debitCount={debitCount}
        latestDate={latestDate}
        hasReports={reports.length > 0}
      />

      <div className="overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-[0_20px_60px_-40px_rgba(15,23,42,0.28)]">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 text-gray-500 text-sm">
                <th className="p-4">{t.reportsTableDateTime}</th>
                <th className="p-4">{t.reportsTableDescription}</th>
                <th className="p-4">{t.quotasTableStatus}</th>
                <th className="p-4 text-right">{t.quotasTableValue}</th>
              </tr>
            </thead>
            <tbody className="text-sm text-gray-700">
              {reports.length === 0 && (
                <tr>
                  <td className="px-6 py-10 text-center text-gray-500" colSpan="4">
                    <div className="mx-auto max-w-xl">
                      <p className="text-base font-black text-gray-800">{t.reportsTableEmptyTitle}</p>
                      <p className="mt-2 text-sm leading-6 text-gray-500">{t.reportsTableEmptyDesc}</p>
                    </div>
                  </td>
                </tr>
              )}
              {reports.slice(0, visibleCount).map((rep) => (
                <tr key={rep.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                  <td className="p-4 whitespace-nowrap">{rep.date}</td>
                  <td className="p-4">{rep.type}</td>
                  <td className="p-4"><span className="bg-gray-100 text-gray-600 px-2 py-1 rounded text-xs">{rep.status}</span></td>
                  <td className={`p-4 text-right font-bold ${rep.color}`}>{rep.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {reports.length > visibleCount && (
          <button
            type="button"
            onClick={() => setVisibleCount((c) => c + 20)}
            className="w-full p-4 text-center bg-gray-50 border-t border-gray-100 text-sm text-gray-500 cursor-pointer hover:text-gray-800"
          >
            {t.reportsLoadMore}
          </button>
        )}
      </div>
    </div>
  );
}

