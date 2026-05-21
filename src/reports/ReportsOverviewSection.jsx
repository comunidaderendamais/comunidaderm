import { ArrowDownLeft, ArrowUpRight, CalendarClock, FileText, Sparkles } from 'lucide-react';
import EmptyStateCard from '../components/ui/EmptyStateCard.jsx';

const MetricCard = ({ icon: Icon, accentClass, label, value, hint }) => (
  <div className="rounded-[24px] border border-white/70 bg-white/95 p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.28)] backdrop-blur">
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
);

export default function ReportsOverviewSection({
  t,
  totalCount,
  creditCount,
  debitCount,
  latestDate,
  hasReports,
}) {
  const quickItems = [
    {
      title: t.reportsQuickItem1Title,
      desc: t.reportsQuickItem1Desc,
    },
    {
      title: t.reportsQuickItem2Title,
      desc: t.reportsQuickItem2Desc,
    },
    {
      title: t.reportsQuickItem3Title,
      desc: t.reportsQuickItem3Desc,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[32px] border border-[#8A2BE2]/60 bg-[radial-gradient(circle_at_top_left,rgba(138,43,226,0.22),transparent_38%),radial-gradient(circle_at_bottom_right,rgba(0,255,0,0.12),transparent_28%),linear-gradient(135deg,#050816_0%,#0b1225_58%,#111827_100%)] p-6 shadow-[0_28px_90px_-45px_rgba(138,43,226,0.55)] sm:p-8">
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
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.reportsHeroLatestLabel}</p>
              <p className="mt-2 text-xl font-black text-white">{latestDate || t.reportsHeroLatestEmpty}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{t.reportsHeroLatestHint}</p>
            </div>
            <div className="rounded-[24px] border border-white/10 bg-white/6 p-4 backdrop-blur">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.reportsHeroCountLabel}</p>
              <p className="mt-2 text-2xl font-black text-[#00FF00]">{totalCount}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{t.reportsHeroCountHint}</p>
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
          <EmptyStateCard
            icon={Sparkles}
            title={t.reportsEmptyTitle}
            description={t.reportsEmptySubtitle}
            className="h-full"
          >
            <p className="rounded-2xl border border-gray-200 bg-white/75 px-4 py-4 text-sm leading-6 text-gray-600">
              {t.reportsEmptyPanel}
            </p>
          </EmptyStateCard>

          <div className="rounded-[28px] border border-slate-200 bg-[linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.3)]">
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
      ) : null}
    </div>
  );
}
