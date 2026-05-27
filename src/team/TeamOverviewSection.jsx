import { ArrowRight, Check, Copy, Gift, PieChart, Users } from 'lucide-react';
import { formatTeamMoney } from './teamViewFormatters.js';
import { fillTemplate } from '../i18n/i18n.js';

const CardShell = ({ icon: Icon, accentClass, badge, title, subtitle, value, valueClassName = '', children, hint }) => (
  <div
    className="rm-neon-banner rm-neon-static rm-neon-light p-5 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.35)] backdrop-blur"
    style={{ '--rm-neon-radius': '28px' }}
  >
    <div className="rm-neon-banner-content">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm ${accentClass}`.trim()}>
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-base font-black text-gray-900">{title}</h3>
            <p className="mt-1 text-sm text-gray-500">{subtitle}</p>
          </div>
        </div>
        {badge ? (
          <span className="shrink-0 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[11px] font-black uppercase tracking-[0.18em] text-gray-700">
            {badge}
          </span>
        ) : null}
      </div>

      <p className={`mt-5 text-3xl font-black text-gray-950 ${valueClassName}`.trim()}>{value}</p>
      <div className="mt-4">{children}</div>
      {hint ? <p className="mt-4 text-xs leading-5 text-gray-500">{hint}</p> : null}
    </div>
  </div>
);

export default function TeamOverviewSection({
  t,
  rankTitle,
  directVol,
  indirectVol,
  residualTotal,
  entryFee,
  legs,
  currentRankVolume,
  nextRank,
  loading,
  copied,
  onCopyRefLink,
  onOpenPresentation,
}) {
  const activeLegs = (Array.isArray(legs) ? legs : []).filter((leg) => Number(leg?.weighted || 0) > 0);
  const totalEntry = Number(entryFee?.level1 || 0) + Number(entryFee?.level2 || 0) + Number(entryFee?.level3 || 0);
  const hasMovement =
    Number(directVol || 0) > 0 ||
    Number(indirectVol || 0) > 0 ||
    Number(residualTotal || 0) > 0 ||
    totalEntry > 0 ||
    activeLegs.length > 0;
  const progressPct = nextRank?.target
    ? Math.max(0, Math.min(100, (Number(currentRankVolume || 0) / Number(nextRank.target || 0)) * 100))
    : 100;
  const stepItems = [
    {
      title: t.teamQuickStartStep1Title,
      desc: t.teamQuickStartStep1Desc,
    },
    {
      title: t.teamQuickStartStep2Title,
      desc: t.teamQuickStartStep2Desc,
    },
    {
      title: t.teamQuickStartStep3Title,
      desc: t.teamQuickStartStep3Desc,
    },
  ];
  const heroBadge = loading
    ? t.teamHeroLoadingBadge
    : hasMovement
      ? t.teamHeroActiveBadge
      : t.teamHeroEmptyBadge;
  const heroDescription = loading
    ? t.teamHeroLoadingDesc
    : hasMovement
      ? t.teamHeroActiveDesc
      : t.teamHeroEmptyDesc;

  return (
    <div className="space-y-6">
      <div
        className="rm-neon-banner rm-neon-static rm-neon-surface p-6 shadow-[0_28px_90px_-45px_rgba(138,43,226,0.55)] sm:p-8"
        style={{ '--rm-neon-radius': '32px' }}
      >
        <div className="rm-neon-banner-content">
          <div className="pointer-events-none absolute -left-20 top-0 h-48 w-48 rounded-full bg-[#8A2BE2]/15 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-16 right-0 h-48 w-48 rounded-full bg-[#00FF00]/10 blur-3xl" />
          <div className="relative grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.95fr)] xl:items-end">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-white/80">
                <Users className="h-4 w-4 text-[#00FF00]" />
                {heroBadge}
              </span>
              <span className="inline-flex items-center rounded-full border border-[#00FF00]/20 bg-[#00FF00]/10 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.18em] text-[#9DFF9D]">
                {t.teamHeroSupportBadge}
              </span>
            </div>
            <h2 className="mt-5 text-3xl font-black tracking-tight text-white sm:text-4xl">{t.teamPageTitle}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-300 sm:text-base">{heroDescription}</p>

            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onCopyRefLink}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#00FF00]/30 bg-[#00FF00]/10 px-4 py-3 text-sm font-black text-[#C7FFC7] transition hover:border-[#00FF00]/50 hover:bg-[#00FF00]/15"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t.copied : t.teamCopyReferralBtn}
              </button>
              <button
                type="button"
                onClick={onOpenPresentation}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-black text-white transition hover:border-white/20 hover:bg-white/10"
              >
                {t.viewPresentation}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
            <div className="rm-neon-banner rm-neon-static rm-neon-surface p-4 backdrop-blur" style={{ '--rm-neon-radius': '24px' }}>
              <div className="rm-neon-banner-content">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.rank}</p>
              <p className="mt-2 text-2xl font-black text-[#00FF00]">{rankTitle}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{t.teamHeroRankHint}</p>
              </div>
            </div>
            <div className="rm-neon-banner rm-neon-static rm-neon-surface p-4 backdrop-blur" style={{ '--rm-neon-radius': '24px' }}>
              <div className="rm-neon-banner-content">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.teamDirectVolume}</p>
              <p className="mt-2 text-2xl font-black text-white">{formatTeamMoney(directVol)}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{t.teamHeroDirectHint}</p>
              </div>
            </div>
            <div className="rm-neon-banner rm-neon-static rm-neon-surface p-4 backdrop-blur" style={{ '--rm-neon-radius': '24px' }}>
              <div className="rm-neon-banner-content">
              <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.teamIndirectVolume}</p>
              <p className="mt-2 text-2xl font-black text-white">{formatTeamMoney(indirectVol)}</p>
              <p className="mt-2 text-xs leading-5 text-slate-400">{t.teamHeroIndirectHint}</p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <CardShell
          icon={PieChart}
          accentClass="border-emerald-100 bg-emerald-50 text-emerald-600"
          badge={t.teamResidualCardBadge}
          title={t.teamResidualCardTitle}
          subtitle={t.teamResidualCardSubtitle}
          value={formatTeamMoney(residualTotal)}
          valueClassName="text-[#00FF00]"
          hint={residualTotal > 0 ? t.teamResidualCardHint : t.teamResidualEmptyHint}
        >
          <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.teamResidualCardSupportLabel}</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-gray-700">
              {residualTotal > 0 ? t.teamResidualCardSupportActive : t.teamResidualCardSupportEmpty}
            </p>
          </div>
        </CardShell>

        <CardShell
          icon={Gift}
          accentClass="border-violet-100 bg-violet-50 text-violet-600"
          badge={t.teamEntryFeeCardBadge}
          title={t.teamEntryFeeCardTitle}
          subtitle={t.teamEntryFeeCardSubtitle}
          value={formatTeamMoney(totalEntry)}
          hint={totalEntry > 0 ? t.teamEntryFeeCardHint : t.teamEntryFeeEmptyHint}
        >
          <div className="space-y-2">
            {[1, 2, 3].map((level) => {
              const amount = Number(entryFee?.[`level${level}`] || 0);
              return (
                <div key={level} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="text-sm font-semibold text-gray-700">{fillTemplate(t.teamLevelLabel, { lvl: level })}</span>
                  <span className="text-sm font-black text-gray-900">{formatTeamMoney(amount)}</span>
                </div>
              );
            })}
          </div>
        </CardShell>

        <CardShell
          icon={Users}
          accentClass="border-sky-100 bg-sky-50 text-sky-600"
          badge={fillTemplate(t.teamLegsCountBadge, { count: activeLegs.length })}
          title={t.teamLegsTitle}
          subtitle={t.teamLegsSubtitle}
          value={activeLegs.length ? fillTemplate(t.teamLegsCountTemplate, { count: activeLegs.length }) : t.teamLegsEmptyValue}
          valueClassName="text-slate-900 text-[2rem] leading-none"
          hint={activeLegs.length ? t.teamLegsHint : t.teamLegsEmptyHint}
        >
          {loading && !activeLegs.length ? (
            <p className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-4 text-sm text-gray-500">{t.loading}</p>
          ) : activeLegs.length ? (
            <div className="space-y-2">
              {activeLegs.slice(0, 3).map((leg) => (
                <div key={leg.id} className="flex items-center justify-between rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                  <span className="truncate pr-3 text-sm font-semibold text-gray-700">{leg.username || leg.id}</span>
                  <span className="shrink-0 text-sm font-black text-gray-900">{formatTeamMoney(Number(leg.weighted || 0))}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/80 px-4 py-4 text-sm leading-6 text-gray-500">
              {t.teamLegsEmptyPanel}
            </div>
          )}
        </CardShell>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
        <div
          className="rm-neon-banner rm-neon-static rm-neon-light p-6 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.3)]"
          style={{ '--rm-neon-radius': '28px' }}
        >
          <div className="rm-neon-banner-content">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-100 bg-emerald-50 text-emerald-600">
                <Check className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-black text-gray-900">{t.teamQuickStartTitle}</h3>
                <p className="mt-1 text-sm text-gray-500">{t.teamQuickStartSubtitle}</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {stepItems.map((item, index) => (
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

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={onCopyRefLink}
                className="inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                {copied ? t.copied : t.teamCopyReferralBtn}
              </button>
              <button
                type="button"
                onClick={onOpenPresentation}
                className="inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm font-black text-gray-900 transition hover:bg-gray-50"
              >
                {t.viewPresentation}
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        <div
          className="rm-neon-banner rm-neon-static rm-neon-light p-6 shadow-[0_24px_70px_-40px_rgba(15,23,42,0.3)]"
          style={{ '--rm-neon-radius': '28px' }}
        >
          <div className="rm-neon-banner-content">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-violet-100 bg-violet-50 text-violet-600">
                <Gift className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-black text-gray-900">{t.teamEvolutionTitle}</h3>
                <p className="mt-1 text-sm text-gray-500">{t.teamEvolutionSubtitle}</p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-950 px-4 py-4 text-white">
                <p className="text-[11px] uppercase tracking-[0.18em] text-slate-400">{t.teamEvolutionCurrentRankLabel}</p>
                <p className="mt-2 text-2xl font-black text-[#00FF00]">{rankTitle}</p>
                <p className="mt-2 text-xs leading-5 text-slate-400">{t.teamEvolutionCurrentRankHint}</p>
              </div>
              <div className="rounded-2xl border border-violet-100 bg-violet-50 px-4 py-4">
                <p className="text-[11px] uppercase tracking-[0.18em] text-violet-700">{t.teamEvolutionNextRankLabel}</p>
                <p className="mt-2 text-2xl font-black text-gray-900">
                  {nextRank?.title ? nextRank.title : t.teamEvolutionTopValue}
                </p>
                <p className="mt-2 text-xs leading-5 text-violet-700/80">
                  {nextRank?.target
                    ? fillTemplate(t.teamEvolutionTargetTemplate, {
                        target: formatTeamMoney(Number(nextRank.target || 0)),
                      })
                    : t.teamEvolutionTopHint}
                </p>
              </div>
            </div>

            <div className="mt-5 rounded-2xl border border-gray-200 bg-white px-4 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.teamEvolutionProgressLabel}</p>
                <p className="text-sm font-black text-gray-900">{Math.round(progressPct)}%</p>
              </div>
              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-200">
                <div className="h-2.5 rounded-full bg-gradient-to-r from-violet-500 to-[#00FF00]" style={{ width: `${progressPct}%` }} />
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.teamEvolutionCurrentVolumeLabel}</p>
                  <p className="mt-2 text-sm font-black text-gray-900">{formatTeamMoney(Number(currentRankVolume || 0))}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.teamDirectVolume}</p>
                  <p className="mt-2 text-sm font-black text-gray-900">{formatTeamMoney(Number(directVol || 0))}</p>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-gray-50 px-3 py-3">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-gray-500">{t.teamIndirectVolume}</p>
                  <p className="mt-2 text-sm font-black text-gray-900">{formatTeamMoney(Number(indirectVol || 0))}</p>
                </div>
              </div>
              <p className="mt-3 text-xs leading-5 text-gray-500">
                {nextRank?.target ? t.teamEvolutionRuleHint : t.teamEvolutionTopRuleHint}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
