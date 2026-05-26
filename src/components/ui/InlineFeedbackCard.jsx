import { AlertCircle, CheckCircle2, Info } from 'lucide-react';

const VARIANTS = {
  success: {
    wrap: 'border border-green-200 bg-green-50 text-green-700',
    icon: CheckCircle2,
  },
  danger: {
    wrap: 'border border-red-200 bg-red-50 text-red-700',
    icon: AlertCircle,
  },
  info: {
    wrap: 'border border-blue-200 bg-blue-50 text-blue-700',
    icon: Info,
  },
};

export default function InlineFeedbackCard({ title = '', message = '', variant = 'info', className = '' }) {
  const current = VARIANTS[variant] || VARIANTS.info;
  const Icon = current.icon;

  if (!title && !message) return null;

  return (
    <div className={`rounded-2xl px-4 py-4 ${current.wrap} ${className}`.trim()}>
      <div className="flex items-start gap-3">
        <Icon size={18} className="mt-0.5 shrink-0" />
        <div className="min-w-0">
          {title ? <p className="text-sm font-black">{title}</p> : null}
          {message ? <p className={`text-sm leading-6 ${title ? 'mt-1' : ''}`.trim()}>{message}</p> : null}
        </div>
      </div>
    </div>
  );
}
