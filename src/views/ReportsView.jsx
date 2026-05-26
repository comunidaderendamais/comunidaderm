import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, FileText, Sparkles } from 'lucide-react';
import EmptyStateCard from '../components/ui/EmptyStateCard.jsx';
import { formatDateTime, formatMoneyUsd, getStatusLabel, getT, translateTransactionType } from '../i18n/i18n.js';
import { getTransactionStatusLabel } from '../payments/nowpaymentsPresentation.js';
import { normalizeUser } from '../shared/normalizeUser.js';

const MetricCard = ({ icon: Icon, accentClass, label, value, hint }) => (
  <div
    className="rm-neon-banner rm-neon-static rm-neon-light p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.28)] backdrop-blur"
    style={{ '--rm-neon-radius': '24px' }}
  >
    <div className="rm-neon-banner-content">
      <div className="flex items-center gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl border ${accentClass}`.trim()}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-black text-gray-900">{label}</p>
          <p className="mt-1 text-xs leading-5 text-gray-500">{hint}</p>
        </div>
      </div>
      <p className="mt-5 text-3xl font-black text-gray-950">{value}</p>
    </div>
  </div>
);

function ReportsOverviewSection({ t, totalCount, creditCount, debitCount, latestDate, hasReports }) {
  const quickItems = [
    { title: t.reportsQuickItem1Title, desc: t.reportsQuickItem1Desc },
    { title: t.reportsQuickItem2Title, desc: t.reportsQuickItem2Desc },
    { title: t.reportsQuickItem3Title, desc: t.reportsQuickItem3Desc },
  ];

  return (
    <div className="space-y-6">
      <div
        className="rm-neon-banner rm-neon-static rm-neon-surface p-6 shadow-[0_28px_90px_-45px_rgba(138,43,226,0.55)] sm:p-8"
        style={{ '--rm-neon-radius': '32px' }}
      >
        <div className="rm-neon-banner-content">
          <div className="pointer-events-none absolute -left-16 top-0 h-44 w-44 rounded-full bg-[#8A2BE2]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 right-0 h-44 w-44 rounded-full bg-[#00FF00]/10 blur-3xl" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.95fr)] xl:items-end">
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/80">
                  <FileText className="h-4 w-4 text-[#00FF00]" />
                  {hasReports ? t.reportsHeroActiveBadge : t.reportsHeroEmptyBadge}
                </span>
                <span className="inline-flex items-center rounded-full border border-[#00FF00]/20 bg-[#00FF00]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#9DFF9D]">
                  {t.reportsHeroSupportBadge}
                </span>
              </div>
              <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">{t.reportsTitle}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">
                {hasReports ? t.reportsHeroActiveDesc : t.reportsHeroEmptyDesc}
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
              <div className="rm-neon-banner rm-neon-static rm-neon-surface p-4 backdrop-blur" style={{ '--rm-neon-radius': '24px' }}>
                <div className="rm-neon-banner-content">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.reportsHeroLatestLabel}</p>
                  <p className="mt-2 text-xl font-black text-white">{latestDate || t.reportsHeroLatestEmpty}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{t.reportsHeroLatestHint}</p>
                </div>
              </div>
              <div className="rm-neon-banner rm-neon-static rm-neon-surface p-4 backdrop-blur" style={{ '--rm-neon-radius': '24px' }}>
                <div className="rm-neon-banner-content">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.reportsHeroCountLabel}</p>
                  <p className="mt-2 text-2xl font-black text-[#00FF00]">{totalCount}</p>
                  <p className="mt-2 text-xs leading-5 text-slate-400">{t.reportsHeroCountHint}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-4">
        <MetricCard
          icon={Sparkles}
          accentClass="border-violet-100 bg-violet-50 text-violet-600"
          label={t.reportsMetricTotalTitle}
          value={String(totalCount)}
          hint={t.reportsMetricTotalHint}
        />
        <MetricCard
          icon={ArrowDownLeft}
          accentClass="border-emerald-100 bg-emerald-50 text-emerald-600"
          label={t.reportsMetricCreditsTitle}
          value={String(creditCount)}
          hint={t.reportsMetricCreditsHint}
        />
        <MetricCard
          icon={ArrowUpRight}
          accentClass="border-rose-100 bg-rose-50 text-rose-600"
          label={t.reportsMetricDebitsTitle}
          value={String(debitCount)}
          hint={t.reportsMetricDebitsHint}
        />
        <MetricCard
          icon={CalendarClock}
          accentClass="border-sky-100 bg-sky-50 text-sky-600"
          label={t.reportsMetricLatestTitle}
          value={latestDate || t.reportsMetricLatestEmpty}
          hint={t.reportsMetricLatestHint}
        />
      </div>

      {!hasReports ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
          <EmptyStateCard icon={Sparkles} title={t.reportsEmptyTitle} description={t.reportsEmptySubtitle} className="h-full">
            <p className="rounded-2xl border border-gray-200 bg-white/75 px-4 py-4 text-sm leading-6 text-gray-600">
              {t.reportsEmptyPanel}
            </p>
          </EmptyStateCard>

          <div className="rm-neon-banner rm-neon-static rm-neon-light p-6 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.3)]" style={{ '--rm-neon-radius': '28px' }}>
            <div className="rm-neon-banner-content">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600">
                  <FileText className="h-5 w-5" />
                </span>
                <div>
                  <h3 className="text-lg font-black text-gray-900">{t.reportsQuickTitle}</h3>
                  <p className="mt-1 text-sm text-gray-500">{t.reportsQuickSubtitle}</p>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                {quickItems.map((item, index) => (
                  <div key={item.title} className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50/80 px-4 py-4">
                    <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-950 text-xs font-black text-white">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-sm font-black text-gray-900">{item.title}</p>
                      <p className="mt-1 text-sm leading-6 text-gray-500">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
      status: getTransactionStatusLabel(tx, t, getStatusLabel),
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
