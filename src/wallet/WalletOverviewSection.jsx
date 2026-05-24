import { ArrowRight, Sparkles } from 'lucide-react';

export default function WalletOverviewSection({
  t,
  hasMovement,
  availableBalance,
  activeCyclesCount,
  pendingDepositsCount,
  onOpenQuotas,
  onOpenSettings,
  hasWallet,
}) {
  return (
    <div className="relative overflow-hidden rounded-[32px] border border-slate-200 bg-[radial-gradient(circle_at_top_left,rgba(138,43,226,0.14),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(0,255,0,0.1),transparent_28%),linear-gradient(180deg,#ffffff_0%,#f8fafc_100%)] p-6 shadow-[0_28px_80px_-48px_rgba(15,23,42,0.35)] sm:p-8">
      <div className="pointer-events-none absolute -left-16 top-0 h-40 w-40 rounded-full bg-[#8A2BE2]/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-16 right-0 h-40 w-40 rounded-full bg-[#00FF00]/10 blur-3xl" />

      <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.9fr)] xl:items-start">
        <div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-violet-700">
              <Sparkles className="h-4 w-4" />
              {hasMovement ? t.walletHeroActiveBadge : t.walletHeroEmptyBadge}
            </span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-700">
              {t.walletHeroSupportBadge}
            </span>
          </div>

          <h2 className="mt-5 text-3xl font-black tracking-tight text-gray-950 sm:text-4xl">{t.walletTitle}</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-gray-600 sm:text-base">
            {hasMovement ? t.walletHeroActiveDesc : t.walletHeroEmptyDesc}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={onOpenQuotas}
              className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
            >
              {t.walletIncreaseEarningsCta}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-900 transition hover:bg-gray-50"
            >
              {hasWallet ? t.walletManageWalletsBtn : t.walletConfigureNow}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.4)] backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.walletHeroAvailableLabel}</p>
            <p className="mt-3 text-2xl font-black text-[#8A2BE2]">{availableBalance}</p>
            <p className="mt-2 text-xs leading-5 text-gray-500">{t.walletHeroAvailableHint}</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.4)] backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.walletHeroCyclesLabel}</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{activeCyclesCount}</p>
            <p className="mt-2 text-xs leading-5 text-gray-500">{t.walletHeroCyclesHint}</p>
          </div>
          <div className="rounded-[24px] border border-slate-200 bg-white/90 p-4 shadow-[0_18px_40px_-36px_rgba(15,23,42,0.4)] backdrop-blur">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.walletHeroPendingLabel}</p>
            <p className="mt-3 text-2xl font-black text-gray-950">{pendingDepositsCount}</p>
            <p className="mt-2 text-xs leading-5 text-gray-500">{t.walletHeroPendingHint}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
