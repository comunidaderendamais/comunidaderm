import { useEffect } from 'react';
import { X } from 'lucide-react';

export default function AuthModal({ isOpen, title, onClose, children, t }) {
  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const close = () => {
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[140]">
      <div className="absolute inset-0 bg-black/70" onClick={close} />
      <div className="absolute left-1/2 top-1/2 w-[min(1040px,94vw)] -translate-x-1/2 -translate-y-1/2">
        <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#0B1220] shadow-[0_60px_160px_-90px_rgba(0,0,0,0.8)]">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-black/30 px-5 py-4">
            <div className="min-w-0">
              <p className="text-[11px] font-black uppercase tracking-[0.18em] text-emerald-200/80">Renda Mais</p>
              <h3 className="truncate text-base font-black text-white sm:text-lg">{title}</h3>
            </div>
            <button
              type="button"
              onClick={close}
              title={t?.close || 'Fechar'}
              className="flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-white/70 transition hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="max-h-[calc(92vh-72px)] overflow-y-auto px-5 py-6 sm:px-7 sm:py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

