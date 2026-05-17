import { faqItems } from './faqData';

const FAQ_KEY = 'rm_faq';

export const defaultFaqState = {
  version: 1,
  items: faqItems,
};

export const normalizeFaqState = (state) => {
  const items = Array.isArray(state?.items) ? state.items : [];
  return {
    version: defaultFaqState.version,
    items: items
      .map((it) => ({
        q: typeof it?.q === 'string' ? it.q : '',
        a: typeof it?.a === 'string' ? it.a : '',
      }))
      .filter((it) => it.q || it.a),
  };
};

export const loadFaqState = () => {
  try {
    const raw = localStorage.getItem(FAQ_KEY);
    if (!raw) {
      const seeded = normalizeFaqState(defaultFaqState);
      localStorage.setItem(FAQ_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    const normalized = normalizeFaqState(parsed);
    if (parsed?.version !== normalized.version) {
      localStorage.setItem(FAQ_KEY, JSON.stringify(normalized));
    }
    return normalized;
  } catch {
    const seeded = normalizeFaqState(defaultFaqState);
    localStorage.setItem(FAQ_KEY, JSON.stringify(seeded));
    return seeded;
  }
};

export const saveFaqState = (state) => {
  const normalized = normalizeFaqState(state);
  localStorage.setItem(FAQ_KEY, JSON.stringify(normalized));
  return normalized;
};

