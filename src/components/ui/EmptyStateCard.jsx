import { ArrowRight, Sparkles } from 'lucide-react';

const TONE_STYLES = {
  neutral: {
    panel: 'border-dashed border-gray-200 bg-gray-50/80',
    icon: 'border-gray-200 bg-white text-gray-700',
    title: 'text-gray-900',
    desc: 'text-gray-600',
    button: 'border border-gray-200 bg-white text-gray-900 hover:bg-gray-50',
  },
  emerald: {
    panel: 'border-emerald-100 bg-emerald-50/80',
    icon: 'border-emerald-100 bg-white/80 text-emerald-700',
    title: 'text-emerald-900',
    desc: 'text-emerald-800/80',
    button: 'bg-slate-950 text-white hover:bg-slate-800',
  },
  violet: {
    panel: 'border-violet-100 bg-violet-50/80',
    icon: 'border-violet-100 bg-white/80 text-violet-700',
    title: 'text-violet-900',
    desc: 'text-violet-800/80',
    button: 'bg-slate-950 text-white hover:bg-slate-800',
  },
};

export default function EmptyStateCard({
  icon: Icon = Sparkles,
  title,
  description,
  tone = 'neutral',
  ctaLabel,
  onCtaClick,
  className = '',
  children,
}) {
  const styles = TONE_STYLES[tone] || TONE_STYLES.neutral;

  return (
    <div className={`rounded-[24px] border px-5 py-5 ${styles.panel} ${className}`.trim()}>
      <div className="flex items-start gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border ${styles.icon}`.trim()}>
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className={`text-sm font-black ${styles.title}`.trim()}>{title}</p>
          <p className={`mt-2 text-sm leading-6 ${styles.desc}`.trim()}>{description}</p>
        </div>
      </div>

      {children ? <div className="mt-4">{children}</div> : null}

      {ctaLabel && onCtaClick ? (
        <button
          type="button"
          onClick={onCtaClick}
          className={`mt-4 inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-black transition ${styles.button}`.trim()}
        >
          {ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
