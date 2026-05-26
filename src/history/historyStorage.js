const HISTORY_KEY = 'rm_bank_history';

export const normalizeYmd = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const getTodayYmd = () => normalizeYmd(new Date());

export const getYesterdayYmd = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return normalizeYmd(d);
};

export const emptyHistoryState = { banks: {} };

export const normalizeHistoryState = (state) => {
  const banks = state?.banks && typeof state.banks === 'object' ? state.banks : {};
  const next = { banks: {} };
  Object.keys(banks).forEach((bankId) => {
    const days = banks[bankId] && typeof banks[bankId] === 'object' ? banks[bankId] : {};
    next.banks[bankId] = {};
    Object.keys(days).forEach((ymd) => {
      const rec = days[ymd] || {};
      next.banks[bankId][ymd] = {
        videos: Array.isArray(rec.videos) ? rec.videos.filter(Boolean) : [],
        images: Array.isArray(rec.images) ? rec.images.filter(Boolean) : [],
        note: typeof rec.note === 'string' ? rec.note : '',
      };
    });
  });
  return next;
};

export const loadHistoryState = () => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return emptyHistoryState;
    return normalizeHistoryState(JSON.parse(raw));
  } catch {
    return emptyHistoryState;
  }
};

export const saveHistoryState = (state) => {
  const normalized = normalizeHistoryState(state);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(normalized));
  return normalized;
};

export const getBankDayHistory = (state, bankId, ymd) => {
  const dateKey = normalizeYmd(ymd);
  if (!bankId || !dateKey) return { videos: [], images: [], note: '' };
  return state?.banks?.[bankId]?.[dateKey] || { videos: [], images: [], note: '' };
};

