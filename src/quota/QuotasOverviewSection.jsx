import { ArrowRight, Sparkles } from 'lucide-react';

export default function QuotasOverviewSection({
  t,
  hasMovement,
  onOpenHowToJoin,
  onOpenBanks,
}) {
  return (
    <div>
      <div className="rm-neon-banner rm-neon-static rm-neon-light relative p-5 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.35)] sm:p-6 lg:p-8">
        <div className="pointer-events-none absolute -left-16 top-0 z-0 h-32 w-32 rounded-full bg-[#8A2BE2]/10 blur-3xl sm:h-36 sm:w-36 lg:h-40 lg:w-40" />
        <div className="pointer-events-none absolute -bottom-16 right-0 z-0 h-32 w-32 rounded-full bg-[#00FF00]/10 blur-3xl sm:h-36 sm:w-36 lg:h-40 lg:w-40" />

        <div className="rm-neon-banner-content">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-violet-700 sm:gap-2 sm:px-3 sm:py-1.5 sm:text-[11px]">
              <Sparkles className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
              {hasMovement ? t.quotasHeroActiveBadge : t.quotasHeroEmptyBadge}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-700 sm:px-3 sm:py-1.5 sm:text-[11px]">
              {t.quotasHeroSupportBadge}
            </span>
          </div>

          <h2 className="mt-4 whitespace-nowrap text-[1.35rem] font-black tracking-tight text-gray-950 sm:mt-5 sm:text-3xl lg:text-4xl">
            {t.quotasPageTitle}
          </h2>
          <p className="mt-2.5 max-w-3xl text-sm leading-6 text-gray-600 sm:mt-3 sm:text-[15px] lg:text-base">
            {hasMovement ? t.quotasHeroActiveDesc : t.quotasHeroEmptyDesc}
          </p>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:flex-col sm:gap-3 md:max-w-[420px] lg:max-w-none lg:flex-row lg:flex-wrap lg:items-center">
            <button
              type="button"
              onClick={onOpenHowToJoin}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-[0_22px_50px_-28px_rgba(15,23,42,0.75)] transition hover:-translate-y-0.5 hover:bg-slate-800 hover:shadow-[0_28px_60px_-28px_rgba(15,23,42,0.85)] lg:w-auto lg:min-w-[220px] lg:justify-between lg:px-5"
            >
              {t.quotasHowToJoinPdf}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onOpenBanks}
              className="rm-glow-light-green inline-flex w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white/92 px-4 py-3 text-sm font-black text-gray-900 shadow-[0_20px_45px_-34px_rgba(15,23,42,0.35)] transition hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white hover:shadow-[0_24px_55px_-34px_rgba(15,23,42,0.45)] lg:w-auto lg:min-w-[220px] lg:justify-between lg:px-5"
            >
              {t.quotasBanksPdf}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
