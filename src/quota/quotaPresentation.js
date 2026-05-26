const PLANS = {
  cota10: {
    key: 'cota10',
    title: 'COTA 10',
    price: 10,
    dailyPct: 1,
    monthlyPct: 30,
  },
  cota50: {
    key: 'cota50',
    title: 'COTA 50',
    price: 50,
    dailyPct: 1.1,
    monthlyPct: 33,
  },
  cota100: {
    key: 'cota100',
    title: 'COTA 100',
    price: 100,
    dailyPct: 1.2,
    monthlyPct: 36,
  },
};

const normalizeKey = ({ planKey, planTitle, planPrice }) => {
  const key = String(planKey || '').trim().toLowerCase();
  if (PLANS[key]) return key;

  const title = String(planTitle || '').trim().toUpperCase();
  if (title.includes('100')) return 'cota100';
  if (title.includes('50')) return 'cota50';
  if (title.includes('10')) return 'cota10';

  const price = Number(planPrice || 0);
  if (price >= 100) return 'cota100';
  if (price >= 50) return 'cota50';
  return 'cota10';
};

export const getQuotaPlanPresentation = ({ planKey, planTitle, planPrice } = {}) => {
  const key = normalizeKey({ planKey, planTitle, planPrice });
  return PLANS[key] || PLANS.cota10;
};

export const getQuotaEarningsSummary = ({ planKey, planTitle, planPrice, units = 1 } = {}) => {
  const plan = getQuotaPlanPresentation({ planKey, planTitle, planPrice });
  const unitsFinal = Math.max(1, Number(units || 1));
  const dailyUsdPerUnit = Number((plan.price * (plan.dailyPct / 100)).toFixed(2));
  const monthlyUsdPerUnit = Number((plan.price * (plan.monthlyPct / 100)).toFixed(2));
  const cycleUsdPerUnit = Number((monthlyUsdPerUnit * 6).toFixed(2));

  return {
    ...plan,
    units: unitsFinal,
    cycleMonths: 6,
    cyclePct: Number((plan.monthlyPct * 6).toFixed(2)),
    perUnit: {
      dailyUsd: dailyUsdPerUnit,
      monthlyUsd: monthlyUsdPerUnit,
      cycleUsd: cycleUsdPerUnit,
    },
    lot: {
      dailyUsd: Number((dailyUsdPerUnit * unitsFinal).toFixed(2)),
      monthlyUsd: Number((monthlyUsdPerUnit * unitsFinal).toFixed(2)),
      cycleUsd: Number((cycleUsdPerUnit * unitsFinal).toFixed(2)),
    },
  };
};

export const getLotProgress = ({ startAt, endAt, nowTs = Date.now() } = {}) => {
  const startTs = Date.parse(startAt || '');
  const endTs = Date.parse(endAt || '');
  const durationMs = Number.isFinite(startTs) && Number.isFinite(endTs) ? Math.max(1, endTs - startTs) : 1;
  const elapsedMs = Number.isFinite(startTs) ? Math.max(0, nowTs - startTs) : 0;
  const endsInMs = Number.isFinite(endTs) ? Math.max(0, endTs - nowTs) : 0;
  const progressPct = Math.min(100, Math.max(0, (elapsedMs / durationMs) * 100));
  const elapsedDays = Math.max(0, Math.floor(elapsedMs / (1000 * 60 * 60 * 24)));
  const remainingDays = Math.max(0, Math.ceil(endsInMs / (1000 * 60 * 60 * 24)));

  return {
    durationMs,
    elapsedMs,
    endsInMs,
    progressPct,
    elapsedDays,
    remainingDays,
  };
};
