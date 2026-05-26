import { X, Info } from 'lucide-react';

const VARIANTS = {
  info: {
    wrap: 'border border-violet-200 bg-violet-50 text-violet-900',
    icon: Info,
  },
  success: {
    wrap: 'border border-green-200 bg-green-50 text-green-900',
    icon: Info,
  },
  warning: {
    wrap: 'border border-amber-200 bg-amber-50 text-amber-900',
    icon: Info,
  },
};

export default function ToastNotice({ open, message, onClose, variant = 'info', className = '' }) {
  const current = VARIANTS[variant] || VARIANTS.info;
  const Icon = current.icon;

  if (!open || !message) return null;

  return (
    <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[120] w-[min(740px,92vw)] ${className}`.trim()}>
      <div className={`rounded-2xl px-4 py-3 shadow-xl ${current.wrap}`.trim()}>
        <div className="flex items-start gap-2 sm:gap-3">
          <Icon size={18} className="mt-0.5 shrink-0" />
          <p className="text-[clamp(11px,3.2vw,18px)] font-black leading-6 min-w-0 whitespace-nowrap">
            {message}
          </p>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto -mr-1 h-8 w-8 sm:h-9 sm:w-9 rounded-xl flex items-center justify-center hover:bg-black/5 transition"
            aria-label="Fechar"
            title="Fechar"
          >
            <X size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
