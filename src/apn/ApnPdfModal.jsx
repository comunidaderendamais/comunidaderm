import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { getT } from '../i18n/i18n.js';

const chipBase = 'px-3 py-2 rounded-xl text-sm font-bold border transition';

const APN_PDF_STORAGE_KEY = 'rm_apn_pdf_lang';
const APN_PDF_FILES = {
  pt: 'APN_RENDA_MAIS_BR.pdf',
  en: 'APN_RENDA_MAIS_EN-US.pdf',
  es: 'APN_RENDA_MAIS_ES-ES.pdf',
  fr: 'APN_RENDA_MAIS_FR-FR.pdf',
};

const getDocLangDefault = (lang) => {
  const key = String(lang || '').trim().toLowerCase();
  if (key === 'en') return 'en';
  if (key === 'es') return 'es';
  if (key === 'fr') return 'fr';
  return 'pt';
};

export default function ApnPdfModal({ isOpen, initialPage = 1, title, onClose, shortcuts = [], t, lang }) {
  const tr = t || getT(lang);
  const [page, setPage] = useState(Number(initialPage || 1));
  const [docLang, setDocLang] = useState(() => {
    try {
      const stored = String(localStorage.getItem(APN_PDF_STORAGE_KEY) || '').trim().toLowerCase();
      if (stored === 'pt' || stored === 'en' || stored === 'es' || stored === 'fr') return stored;
    } catch {}
    return getDocLangDefault(lang);
  });

  useEffect(() => {
    if (!isOpen) return;
    setPage(Number(initialPage || 1));
  }, [isOpen, initialPage]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const safePage = Math.max(1, Number.isFinite(Number(page)) ? Number(page) : 1);
  const file = APN_PDF_FILES[docLang] || APN_PDF_FILES.pt;
  const src = `/apn/${file}#page=${safePage}`;

  const close = () => {
    onClose?.();
  };

  return (
    <div className="fixed inset-0 z-[120]">
      <div className="absolute inset-0 bg-black/60" onClick={close}></div>

      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(1200px,94vw)] h-[min(820px,92vh)] bg-white rounded-2xl shadow-2xl overflow-hidden border border-[#8A2BE2]">
        <div className="bg-[#1A1A1A] text-white border-b border-[#8A2BE2] px-4 py-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-gray-300">{tr.apnOfficialLabel}</p>
            <h3 className="text-lg font-black truncate">{title || tr.apnPresentation}</h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={close}
              className="h-10 w-10 rounded-xl border border-gray-700 hover:border-red-500 flex items-center justify-center text-gray-200 hover:text-white"
              title={tr.close}
              type="button"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <span className="text-sm font-bold text-gray-700">{tr.apnPdfLanguageLabel}</span>
              <select
                value={docLang}
                onChange={(e) => {
                  const next = String(e.target.value || '').trim().toLowerCase();
                  setDocLang(next);
                  try {
                    localStorage.setItem(APN_PDF_STORAGE_KEY, next);
                  } catch {}
                }}
                className="bg-transparent text-sm font-black text-gray-900 outline-none"
              >
                <option value="pt">{tr.apnPdfLangPt}</option>
                <option value="en">{tr.apnPdfLangEn}</option>
                <option value="es">{tr.apnPdfLangEs}</option>
                <option value="fr">{tr.apnPdfLangFr}</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, Number(p || 1) - 1))}
              className={`${chipBase} bg-white text-gray-700 border-gray-200 hover:border-[#00FF00] flex items-center gap-2`}
            >
              <ChevronLeft size={16} />
              {tr.apnPrev}
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, Number(p || 1) + 1))}
              className={`${chipBase} bg-white text-gray-700 border-gray-200 hover:border-[#00FF00] flex items-center gap-2`}
            >
              {tr.apnNext}
              <ChevronRight size={16} />
            </button>

            <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-3 py-2">
              <span className="text-sm font-bold text-gray-700">{tr.apnPage}</span>
              <input
                value={String(page)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw.trim() === '') {
                    setPage('');
                    return;
                  }
                  const n = Number(raw);
                  if (Number.isFinite(n)) setPage(n);
                }}
                className="w-20 bg-transparent text-sm font-black text-gray-900 outline-none"
                inputMode="numeric"
              />
            </div>

            {shortcuts.map((s) => (
              <button
                key={`${s.page}-${s.label}`}
                type="button"
                onClick={() => setPage(s.page)}
                className={`${chipBase} bg-white text-gray-700 border-gray-200 hover:border-[#00FF00]`}
              >
                {s.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">
            {tr.apnTip}
          </p>
        </div>

        <div className="h-[calc(100%-132px)] bg-black">
          <iframe title="APN Renda Mais" src={src} className="w-full h-full" />
        </div>
      </div>
    </div>
  );
}
