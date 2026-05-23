import { useEffect, useRef, useState } from 'react';
import { ArrowRight, ChevronDown, Clock, FileText, ShieldCheck, Sparkles, TrendingUp, Users, Wallet } from 'lucide-react';

const LANGUAGE_OPTIONS = ['pt', 'en', 'es'];

const getApnPdfPath = (lang) => {
  const l = String(lang || '').toLowerCase();
  if (l === 'en') return '/apn/APN_RENDA_MAIS_EN-US.pdf';
  if (l === 'es') return '/apn/APN_RENDA_MAIS_ES-ES.pdf';
  return '/apn/APN_RENDA_MAIS_BR.pdf';
};

const FeatureCard = ({ icon: Icon, title, description, tone }) => {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-100 bg-emerald-50/70 text-emerald-700'
      : tone === 'violet'
        ? 'border-violet-100 bg-violet-50/70 text-violet-700'
        : 'border-slate-200 bg-white/80 text-slate-700';

  return (
    <div className="rounded-[26px] border border-white/70 bg-white/90 p-5 shadow-[0_28px_70px_-52px_rgba(15,23,42,0.45)] backdrop-blur">
      <div className={`flex h-12 w-12 items-center justify-center rounded-2xl border ${toneClass}`.trim()}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="mt-4 text-lg font-black text-gray-900">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-gray-600">{description}</p>
    </div>
  );
};

export default function InstitutionalPage({ lang, setLang, t, onLogin, onRegister, onOpenPdf }) {
  const apnHref = getApnPdfPath(lang);
  const [isAuthMenuOpen, setIsAuthMenuOpen] = useState(false);
  const authMenuRef = useRef(null);

  useEffect(() => {
    if (!isAuthMenuOpen) return;
    const onDocPointerDown = (event) => {
      const root = authMenuRef.current;
      if (!root) return;
      if (root.contains(event.target)) return;
      setIsAuthMenuOpen(false);
    };
    const onDocKeyDown = (event) => {
      if (event.key === 'Escape') setIsAuthMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDocPointerDown);
    document.addEventListener('keydown', onDocKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onDocPointerDown);
      document.removeEventListener('keydown', onDocKeyDown);
    };
  }, [isAuthMenuOpen]);

  const handleBuyQuotas = () => {
    try {
      sessionStorage.setItem('rmPostLoginView', 'quotas');
    } catch {}
    onRegister?.();
  };

  return (
    <div className="min-h-screen bg-[#0B1220]">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute -left-40 top-0 h-[520px] w-[520px] rounded-full bg-[#8A2BE2]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 h-[520px] w-[520px] rounded-full bg-[#00FF00]/12 blur-3xl" />
        <header className="relative mx-auto flex w-full max-w-7xl flex-nowrap items-center gap-2 px-4 py-4 sm:gap-4 sm:px-6 sm:py-5 max-[380px]:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 max-[380px]:gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 shadow-[0_0_28px_rgba(0,255,0,0.15)] max-[380px]:h-10 max-[380px]:w-10">
              <img src="/LOGO_RENDA_MAIS_02_COLOR.png" alt="Renda Mais" className="h-9 w-9 object-contain max-[380px]:h-7 max-[380px]:w-7" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.24em] text-emerald-300/80 max-[380px]:hidden">
                {t.institutionalBrandKicker}
              </p>
              <h1 className="truncate text-base font-black text-white sm:text-lg max-[380px]:text-[13px]">
                {t.institutionalBrandTitle}
              </h1>
            </div>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:gap-3 max-[380px]:gap-1.5">
            <div className="flex items-center justify-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-1 sm:gap-2 sm:p-1.5">
              {LANGUAGE_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setLang(option)}
                  className={`rounded-xl px-2 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] transition sm:px-3 sm:py-2 sm:text-[11px] max-[380px]:px-1.5 ${
                    option === lang ? 'bg-[#00FF00] text-black' : 'text-white/70 hover:bg-white/10 hover:text-white'
                  }`.trim()}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="hidden items-center gap-2 max-[380px]:gap-1.5 sm:flex">
              <button
                type="button"
                onClick={onLogin}
                className="whitespace-nowrap rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-black text-white transition hover:bg-white/10 sm:px-4 sm:py-3 sm:text-sm max-[380px]:px-2 max-[380px]:py-2 max-[380px]:text-[10px]"
              >
                <span className="max-[360px]:hidden">{t.login}</span>
                <span className="hidden max-[360px]:block">{t.loginShort ?? t.login}</span>
              </button>
              <button
                type="button"
                onClick={onRegister}
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-2xl bg-[#00FF00] px-3 py-2 text-[11px] font-black text-black shadow-[0_28px_70px_-52px_rgba(0,255,0,0.65)] transition hover:-translate-y-0.5 hover:shadow-[0_34px_85px_-52px_rgba(0,255,0,0.75)] sm:px-4 sm:py-3 sm:text-sm max-[380px]:px-2 max-[380px]:py-2 max-[380px]:text-[10px] max-[380px]:gap-1.5"
              >
                <span className="max-[360px]:hidden">{t.register}</span>
                <span className="hidden max-[360px]:block">{t.registerShort ?? t.register}</span>
                <ArrowRight className="hidden h-4 w-4 sm:block" />
              </button>
            </div>

            <div ref={authMenuRef} className="relative sm:hidden">
              <button
                type="button"
                onClick={() => setIsAuthMenuOpen((v) => !v)}
                className="inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-2xl border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-black text-white transition hover:bg-white/10 max-[380px]:px-2 max-[380px]:py-2 max-[380px]:text-[10px]"
              >
                {t.login}
                <ChevronDown className={`h-4 w-4 transition ${isAuthMenuOpen ? 'rotate-180' : ''}`.trim()} />
              </button>
              {isAuthMenuOpen ? (
                <div className="absolute right-0 top-[calc(100%+10px)] z-50 w-44 rounded-2xl border border-white/10 bg-[#0B1220]/95 p-2 shadow-[0_40px_120px_-80px_rgba(0,0,0,0.85)] backdrop-blur">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAuthMenuOpen(false);
                      onLogin?.();
                    }}
                    className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs font-black text-white/90 transition hover:bg-white/10"
                  >
                    <span>{t.login}</span>
                    <ArrowRight className="h-4 w-4 text-white/60" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAuthMenuOpen(false);
                      onRegister?.();
                    }}
                    className="mt-1 flex w-full items-center justify-between gap-2 rounded-xl bg-[#00FF00] px-3 py-2 text-xs font-black text-black transition hover:brightness-110"
                  >
                    <span>{t.register}</span>
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <div className="relative mx-auto w-full max-w-7xl px-4 pb-10 sm:px-6 sm:pb-14">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch">
            <div className="flex h-full flex-col rounded-[34px] border border-white/10 bg-white/5 p-6 shadow-[0_40px_120px_-85px_rgba(15,23,42,0.75)] backdrop-blur sm:p-8">
              <div className="flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-violet-200/30 bg-violet-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-violet-100">
                  <Sparkles className="h-4 w-4 text-violet-200" />
                  {t.institutionalHeroBadge}
                </span>
                <span className="inline-flex items-center rounded-full border border-emerald-200/30 bg-emerald-500/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-emerald-100">
                  {t.institutionalHeroSecondaryBadge}
                </span>
              </div>

              <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">{t.institutionalHeroTitle}</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-white/70 sm:text-base">{t.institutionalHeroSubtitle}</p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  onClick={onRegister}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00FF00] px-5 py-3 text-sm font-black text-black shadow-[0_24px_60px_-40px_rgba(0,255,0,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_72px_-38px_rgba(0,255,0,0.72)]"
                >
                  {t.institutionalHeroPrimaryCta}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                >
                  {t.institutionalHeroSecondaryCta}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">{t.institutionalStatOneLabel}</p>
                  <p className="mt-2 text-2xl font-black text-white">{t.institutionalStatOneValue}</p>
                  <p className="mt-2 text-sm leading-6 text-white/65">{t.institutionalStatOneHint}</p>
                </div>
                <div className="rounded-[26px] border border-white/10 bg-black/20 p-4">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">{t.institutionalStatTwoLabel}</p>
                  <p className="mt-2 text-2xl font-black text-white">{t.institutionalStatTwoValue}</p>
                  <p className="mt-2 text-sm leading-6 text-white/65">{t.institutionalStatTwoHint}</p>
                </div>
              </div>

              <div className="rm-neon-banner mt-6 p-5 sm:p-6">
                <div className="rm-neon-banner-content">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200/80">
                        {t.institutionalWithdrawalBannerKicker}
                      </p>
                      <p className="mt-2 text-lg font-black text-white sm:text-xl">{t.institutionalWithdrawalBannerTitle}</p>
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-white/85">
                          <Clock className="h-4 w-4 text-emerald-200" />
                          <span className="whitespace-nowrap">{t.institutionalWithdrawalBannerNoFee}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-white/85">
                          <Wallet className="h-4 w-4 text-violet-200" />
                          <span className="whitespace-nowrap text-white/70">{t.institutionalWithdrawalBannerLimitLabel}</span>
                          <span className="rm-neon-number whitespace-nowrap text-sm font-black sm:text-base">
                            {t.institutionalWithdrawalBannerLimitValue}
                          </span>
                        </span>
                      </div>
                    </div>
                    <div className="hidden h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-emerald-200 sm:flex">
                      <Wallet className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="rm-neon-banner rm-neon-static rm-neon-surface mt-4 p-4 sm:p-5">
                <div className="rm-neon-banner-content">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200/80">
                    {t.institutionalQuotaUnitPriceKicker}
                  </p>
                  <p className="mt-2 text-base font-black text-white sm:text-lg">
                    {t.institutionalQuotaUnitPriceTitle}{' '}
                    <span className="rm-neon-number whitespace-nowrap">{t.institutionalQuotaUnitPriceValue}</span>
                  </p>
                  <p className="mt-1 text-xs font-medium text-white/65">{t.institutionalQuotaUnitPriceHint}</p>
                </div>
              </div>

              <div className="mt-6 flex flex-1 items-end">
                <div className="relative w-full overflow-hidden rounded-[26px] border border-white/10 bg-black/20 p-5">
                  <img
                    src="/PERSONAGEM%20RENDA%20MAIS%20com%20LOGO.png"
                    alt=""
                    className="pointer-events-none absolute -bottom-10 right-0 w-[180px] opacity-25 blur-[0.5px] drop-shadow-[0_0_18px_rgba(0,255,0,0.12)] sm:w-[220px] lg:w-[240px]"
                    loading="lazy"
                  />
                  <div className="relative z-10 max-w-[360px]">
                    <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">
                      {t.institutionalLimitsFillerTitle}
                    </p>
                    <div className="mt-3 grid gap-2 sm:gap-3">
                      <div className="rounded-2xl border border-emerald-300/20 bg-white/5 p-2.5 shadow-[0_26px_70px_-60px_rgba(0,255,0,0.18)] sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-black text-white sm:text-xs">{t.institutionalLimitsIndividualLabel}</p>
                          <span className="rm-neon-number text-[11px] font-black sm:text-xs">100</span>
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-white/70 sm:text-xs">
                          {t.institutionalLimitsIndividualValue}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-violet-300/20 bg-white/5 p-2.5 shadow-[0_26px_70px_-60px_rgba(138,43,226,0.18)] sm:p-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] font-black text-white sm:text-xs">{t.institutionalLimitsGlobalLabel}</p>
                          <span className="rm-neon-number text-[11px] font-black sm:text-xs">100.000</span>
                        </div>
                        <p className="mt-1 text-[11px] font-medium text-white/70 sm:text-xs">{t.institutionalLimitsGlobalValue}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 lg:h-full">
              <div className="rounded-[34px] border border-white/10 bg-white/5 p-6 shadow-[0_40px_120px_-92px_rgba(15,23,42,0.75)] backdrop-blur sm:p-7">
                <h3 className="text-lg font-black text-white">{t.institutionalDocTitle}</h3>
                <p className="mt-2 text-sm leading-6 text-white/70">{t.institutionalDocDesc}</p>

                <div className="mt-5 grid gap-3">
                  <button
                    type="button"
                    onClick={() => (onOpenPdf ? onOpenPdf(apnHref) : window.open(apnHref, '_blank', 'noopener,noreferrer'))}
                    className="inline-flex items-center justify-between gap-3 rounded-2xl bg-white/10 px-4 py-3 text-sm font-black text-white transition hover:bg-white/15"
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-emerald-200">
                        <FileText className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-black">{t.institutionalDocCta}</span>
                        <span className="mt-1 block text-xs font-medium text-white/60">{t.institutionalDocCtaHint}</span>
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4" />
                  </button>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <p className="text-xs leading-6 text-white/70">{t.institutionalDocDisclaimer}</p>
                  </div>
                </div>
              </div>

              <div className="rm-neon-banner rm-neon-static rm-neon-surface p-5 sm:p-7 lg:flex lg:flex-1 lg:flex-col">
                <img
                  src="/PERSONAGEM%20RENDA%20MAIS%20com%20LOGO.png"
                  alt=""
                  className="pointer-events-none absolute bottom-0 right-0 hidden w-[320px] translate-x-10 translate-y-10 opacity-30 blur-[1px] drop-shadow-[0_0_22px_rgba(138,43,226,0.14)] sm:block"
                  loading="lazy"
                />
                <div className="rm-neon-banner-content">
                  <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200/80">
                    {t.institutionalQuotaSummaryKicker}
                  </p>
                  <h3 className="mt-2 text-lg font-black text-white">{t.institutionalQuotaSummaryTitle}</h3>

                  <div className="mt-5 grid gap-3">
                  {[
                    {
                      title: t.institutionalQuotaPack10Title,
                      value: t.institutionalQuotaPack10Value,
                      yield: t.institutionalQuotaPack10Yield,
                      daily: t.institutionalQuotaPack10Daily,
                      cycle: t.institutionalQuotaPack10Cycle,
                      max: t.institutionalQuotaPack10MaxGrowth,
                    },
                    {
                      title: t.institutionalQuotaPack50Title,
                      value: t.institutionalQuotaPack50Value,
                      yield: t.institutionalQuotaPack50Yield,
                      daily: t.institutionalQuotaPack50Daily,
                      cycle: t.institutionalQuotaPack50Cycle,
                      max: t.institutionalQuotaPack50MaxGrowth,
                    },
                    {
                      title: t.institutionalQuotaPack100Title,
                      value: t.institutionalQuotaPack100Value,
                      yield: t.institutionalQuotaPack100Yield,
                      daily: t.institutionalQuotaPack100Daily,
                      cycle: t.institutionalQuotaPack100Cycle,
                      max: t.institutionalQuotaPack100MaxGrowth,
                    },
                  ].map((pack) => (
                    <div
                      key={pack.title}
                      className="rounded-[26px] border border-white/10 bg-gradient-to-br from-emerald-500/10 via-black/20 to-violet-500/10 p-4 shadow-[0_30px_80px_-70px_rgba(15,23,42,0.85)] backdrop-blur transition hover:border-white/20"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-black text-white">{pack.title}</p>
                        <p className="rm-neon-number text-sm font-black">{pack.value}</p>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                        <p className="text-xs font-black text-white/60">{t.institutionalQuotaYieldLabel}</p>
                        <p className="text-xs font-black text-white/85">{pack.yield}</p>
                        <p className="text-xs font-black text-white/60">{t.institutionalQuotaDailyAvgLabel}</p>
                        <p className="text-xs font-black text-white/85">{pack.daily}</p>
                        <p className="text-xs font-black text-white/60">{t.institutionalQuotaCycleLabel}</p>
                        <p className="text-xs font-black text-white/85">{pack.cycle}</p>
                        <p className="text-xs font-black text-white/60">{t.institutionalQuotaMaxGrowthLabel}</p>
                        <p className="text-xs font-black text-white/85">{pack.max}</p>
                      </div>
                      <button
                        type="button"
                        onClick={handleBuyQuotas}
                        className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#00FF00] px-4 py-2.5 text-xs font-black text-black shadow-[0_22px_60px_-42px_rgba(0,255,0,0.65)] transition hover:-translate-y-0.5 hover:shadow-[0_28px_72px_-42px_rgba(0,255,0,0.78)]"
                      >
                        {t.institutionalQuotaBuyCta}
                        <ArrowRight className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:mt-14 lg:grid-cols-4">
            <FeatureCard
              icon={Wallet}
              title={t.institutionalFeatureOneTitle}
              description={t.institutionalFeatureOneDesc}
              tone="emerald"
            />
            <FeatureCard
              icon={TrendingUp}
              title={t.institutionalFeatureTwoTitle}
              description={t.institutionalFeatureTwoDesc}
              tone="violet"
            />
            <FeatureCard
              icon={Users}
              title={t.institutionalFeatureThreeTitle}
              description={t.institutionalFeatureThreeDesc}
            />
            <FeatureCard
              icon={ShieldCheck}
              title={t.institutionalFeatureFourTitle}
              description={t.institutionalFeatureFourDesc}
              tone="emerald"
            />
          </div>

          <section className="mt-10 rounded-[34px] border border-white/10 bg-white/5 p-6 shadow-[0_40px_120px_-92px_rgba(15,23,42,0.75)] backdrop-blur sm:mt-14 sm:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200/80">{t.institutionalStepsKicker}</p>
                <h3 className="mt-3 text-2xl font-black text-white sm:text-3xl">{t.institutionalStepsTitle}</h3>
                <p className="mt-3 text-sm leading-7 text-white/70 sm:text-base">{t.institutionalStepsDesc}</p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                >
                  {t.institutionalStepsSecondaryCta}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onRegister}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00FF00] px-5 py-3 text-sm font-black text-black shadow-[0_24px_60px_-44px_rgba(0,255,0,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_30px_72px_-44px_rgba(0,255,0,0.72)]"
                >
                  {t.institutionalStepsPrimaryCta}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">{t.institutionalStepOneLabel}</p>
                <h4 className="mt-3 text-lg font-black text-white">{t.institutionalStepOneTitle}</h4>
                <p className="mt-2 text-sm leading-6 text-white/70">{t.institutionalStepOneDesc}</p>
              </div>
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">{t.institutionalStepTwoLabel}</p>
                <h4 className="mt-3 text-lg font-black text-white">{t.institutionalStepTwoTitle}</h4>
                <p className="mt-2 text-sm leading-6 text-white/70">{t.institutionalStepTwoDesc}</p>
              </div>
              <div className="rounded-[26px] border border-white/10 bg-black/20 p-5">
                <p className="text-[11px] font-black uppercase tracking-[0.18em] text-white/60">{t.institutionalStepThreeLabel}</p>
                <h4 className="mt-3 text-lg font-black text-white">{t.institutionalStepThreeTitle}</h4>
                <p className="mt-2 text-sm leading-6 text-white/70">{t.institutionalStepThreeDesc}</p>
              </div>
            </div>
          </section>

          <footer className="mt-10 pb-12 sm:mt-14">
            <div className="flex flex-col gap-3 rounded-[28px] border border-white/10 bg-white/5 px-6 py-6 shadow-[0_38px_110px_-90px_rgba(15,23,42,0.75)] backdrop-blur sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-black text-white">{t.institutionalFooterTitle}</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={onLogin}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-black text-white transition hover:bg-white/10"
                >
                  {t.login}
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={onRegister}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#00FF00] px-5 py-3 text-sm font-black text-black shadow-[0_26px_70px_-52px_rgba(0,255,0,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_32px_84px_-52px_rgba(0,255,0,0.72)]"
                >
                  {t.register}
                  <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
}

