import {
  ArrowRight,
  BookOpen,
  CircleDollarSign,
  FileText,
  PieChart,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import EmptyStateCard from '../components/ui/EmptyStateCard.jsx';

const METRIC_ICONS = {
  invested: CircleDollarSign,
  teamEarnings: TrendingUp,
  totalBalance: Wallet,
  rank: ShieldCheck,
};

const MetricCard = ({ iconKey, badge, title, value, desc, hint, accentClass }) => {
  const Icon = METRIC_ICONS[iconKey] || Sparkles;

  return (
    <div
      className="rm-neon-banner rm-neon-static rm-neon-light p-5 shadow-[0_20px_60px_-40px_rgba(15,23,42,0.25)] backdrop-blur"
      style={{ '--rm-neon-radius': '24px' }}
    >
      <div className="rm-neon-banner-content">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${accentClass}`.trim()}>
              <Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-gray-900">{title}</p>
              <p className="mt-1 text-xs leading-5 text-gray-500">{desc}</p>
            </div>
          </div>
          {badge ? (
            <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-gray-700">
              {badge}
            </span>
          ) : null}
        </div>

        <p className="mt-5 text-3xl font-black tracking-tight text-gray-950">{value}</p>
        <p className="mt-3 text-sm leading-6 text-gray-500">{hint}</p>
      </div>
    </div>
  );
};

export default function HomeOverviewSection({
  t,
  totalLimit,
  currentSold,
  percentage,
  hasMovement,
  rankTitle,
  rankDesc,
  cards,
  onOpenQuotas,
}) {
  const handleOpenQuotas = () => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('app:navigate', { detail: { view: 'quotas' } }));
    }
    onOpenQuotas?.();
  };

  return (
    <div className="space-y-6">
      <div
        className="rm-neon-banner rm-neon-static rm-neon-light p-6 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.35)] sm:p-8"
        style={{ '--rm-neon-radius': '32px' }}
      >
        <div className="rm-neon-banner-content">
          <div className="pointer-events-none absolute -left-14 top-0 h-40 w-40 rounded-full bg-[#8A2BE2]/10 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 right-0 h-40 w-40 rounded-full bg-[#00FF00]/10 blur-3xl" />

          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)] xl:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
                <Sparkles className="h-4 w-4" />
                {hasMovement ? t.homeHeroActiveBadge : t.homeHeroEmptyBadge}
              </span>
              <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
                {t.homeHeroSupportBadge}
              </span>
            </div>

            <h2 className="mt-5 text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">{t.investorPanel}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">
              {hasMovement ? t.homeHeroActiveDesc : t.homeHeroEmptyDesc}
            </p>

            <div className="mt-5 rounded-[22px] border border-white/80 bg-white/80 p-3.5 shadow-[0_20px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur sm:mt-6 sm:rounded-[24px] sm:p-4">
              <div className="flex flex-col gap-3 sm:gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="flex items-start gap-2.5 sm:gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600 sm:h-11 sm:w-11">
                    <PieChart className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
                  </span>
                  <div>
                    <h3 className="text-[15px] font-black text-gray-900 sm:text-base">{t.quotas}</h3>
                    <p className="mt-0.5 text-[13px] leading-5 text-gray-500 sm:mt-1 sm:text-sm sm:leading-6">{t.homeQuotaCtaHint}</p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleOpenQuotas}
                  className="group flex w-full flex-col gap-2.5 rounded-[20px] bg-[linear-gradient(135deg,#020617_0%,#111827_58%,#1f2937_100%)] px-4 py-3.5 text-left text-white shadow-[0_24px_60px_-28px_rgba(15,23,42,0.85)] ring-1 ring-white/10 transition hover:-translate-y-0.5 hover:shadow-[0_30px_70px_-26px_rgba(15,23,42,0.95)] sm:w-auto sm:min-w-[320px] sm:gap-3 sm:rounded-[22px] sm:px-5 sm:py-4"
                >
                  <span className="text-[11px] uppercase tracking-[0.18em] text-emerald-300/90">{t.quotas}</span>
                  <span className="flex items-center justify-between gap-3">
                    <span className="min-w-0 flex-1 whitespace-nowrap text-[12px] font-black text-white min-[360px]:text-[13px] sm:text-[15px]">
                      {t.buyQuota}
                    </span>
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-white/12 bg-white/10 text-white transition group-hover:bg-white/14">
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </span>
                </button>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1">
            <div
              className="rm-neon-banner rm-neon-static rm-neon-light p-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.4)] backdrop-blur"
              style={{ '--rm-neon-radius': '24px' }}
            >
              <div className="rm-neon-banner-content">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.totalLimit}</p>
                  <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-gray-700">
                    {t.homeBetaPhase}
                  </span>
                </div>
                <p className="mt-3 text-2xl font-black text-[#8A2BE2]">
                  {currentSold.toLocaleString()}
                  <span className="text-base font-bold text-gray-500"> / {totalLimit.toLocaleString()}</span>
                </p>
                <div className="mt-4 h-3 overflow-hidden rounded-full bg-gray-200">
                  <div
                    className="h-3 rounded-full bg-gradient-to-r from-[#8A2BE2] to-[#00FF00] transition-all duration-1000"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <p className="mt-3 text-xs leading-5 text-gray-500">{t.homeHeroProgressHint}</p>
              </div>
            </div>

            <div
              className="rm-neon-banner rm-neon-static rm-neon-light p-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.4)] backdrop-blur"
              style={{ '--rm-neon-radius': '24px' }}
            >
              <div className="rm-neon-banner-content">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.rank}</p>
                <p className="mt-3 text-2xl font-black text-gray-950">{rankTitle}</p>
                <p className="mt-2 text-sm leading-6 text-gray-500">{rankDesc}</p>
                <p className="mt-3 text-xs leading-5 text-gray-500">{t.homeHeroRankHint}</p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 min-[540px]:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <MetricCard
            key={card.key}
            iconKey={card.key}
            badge={card.badge}
            title={card.title}
            value={card.value}
            desc={card.desc}
            hint={card.hint}
            accentClass={card.accentClass}
          />
        ))}
      </div>
    </div>
  );
}

export function HomeRecentEarningsSection({ t, recentItems, onOpenReports }) {
  const hasRecentEarnings = recentItems.length > 0;

  return (
    <div
      className="rm-neon-banner rm-neon-static rm-neon-light p-6 shadow-[0_24px_70px_-42px_rgba(15,23,42,0.28)]"
      style={{ '--rm-neon-radius': '28px' }}
    >
      <div className="rm-neon-banner-content">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-600">
              <FileText className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-black text-gray-900">{t.homeLastDailyEarningsTitle}</h3>
              <p className="mt-1 text-sm leading-6 text-gray-500">
                {hasRecentEarnings ? t.homeRecentActiveDesc : t.homeRecentEmptySubtitle}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenReports?.()}
            className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-900 transition hover:bg-gray-50"
          >
            {t.homeViewFullReport}
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {hasRecentEarnings ? (
          <div className="mt-5 space-y-3">
            {recentItems.map((item, index) => (
              <div
                key={item.id || index}
                className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-4"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-black text-gray-900">{item.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{item.date}</p>
                </div>
                <span className="shrink-0 text-sm font-black text-[#00AA44]">{item.amount}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
            <EmptyStateCard
              icon={FileText}
              title={t.homeRecentEmptyTitle}
              description={t.homeRecentEmptyPanel}
            />
            <EmptyStateCard
              icon={BookOpen}
              title={t.homeProjectPresentationTitle}
              description={t.homeRecentEmptyGuide}
              tone="emerald"
            />
          </div>
        )}
      </div>
    </div>
  );
}
