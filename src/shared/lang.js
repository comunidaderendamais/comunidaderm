export const LANG_STORAGE_KEY = 'rm_lang';

export const normalizeLang = (value) => {
  const key = String(value || '').trim().toLowerCase();
  if (!key) return 'pt';
  if (key === 'pt' || key.startsWith('pt-')) return 'pt';
  if (key === 'en' || key.startsWith('en-')) return 'en';
  if (key === 'es' || key.startsWith('es-')) return 'es';
  return 'pt';
};

export const detectBrowserLang = () => {
  try {
    const raw = String(navigator?.language || navigator?.languages?.[0] || '');
    return normalizeLang(raw);
  } catch {
    return 'pt';
  }
};

export const getLangFromUrl = (href = '') => {
  try {
    const source = String(href || window.location.href || '');
    const url = new URL(source);
    const queryLang = String(url.searchParams.get('lang') || '').trim();
    const fromQuery = queryLang ? normalizeLang(queryLang) : '';
    if (fromQuery) return fromQuery;

    const hash = String(url.hash || '').replace(/^#/, '');
    const hashParams = new URLSearchParams(hash);
    const hashLang = String(hashParams.get('lang') || '').trim();
    const fromHash = hashLang ? normalizeLang(hashLang) : '';
    if (fromHash) return fromHash;
  } catch {}

  return '';
};

export const persistLang = (lang) => {
  try {
    localStorage.setItem(LANG_STORAGE_KEY, normalizeLang(lang));
  } catch {}
};

export const getInitialLang = (href = '') => {
  const fromUrl = getLangFromUrl(href);
  if (fromUrl) {
    persistLang(fromUrl);
    return fromUrl;
  }

  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored) return normalizeLang(stored);
    const detected = detectBrowserLang();
    localStorage.setItem(LANG_STORAGE_KEY, detected);
    return detected;
  } catch {
    return 'pt';
  }
};
