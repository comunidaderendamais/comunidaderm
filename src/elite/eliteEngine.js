const toIso = (d) => {
  try {
    return new Date(d || Date.now()).toISOString();
  } catch {
    return new Date().toISOString();
  }
};

export const ELITE_CATEGORIES = [
  { key: 'SILVER', title: 'SILVER', slots: 4, pctPerSlot: 0.05 },
  { key: 'OURO', title: 'OURO', slots: 2, pctPerSlot: 0.1 },
  { key: 'DIAMOND', title: 'DIAMOND', slots: 2, pctPerSlot: 0.15 },
  { key: 'RM', title: 'DIAMOND RM', slots: 2, pctPerSlot: 0.15 },
];

const ELITE_ORDER = ['SILVER', 'OURO', 'DIAMOND', 'RM'];
const catIndex = (cat) => ELITE_ORDER.indexOf(String(cat || '').toUpperCase());

export const getEliteCategoryForRank = (rankKey) => {
  const k = String(rankKey || '').toUpperCase();
  if (k === 'RM') return 'RM';
  if (k === 'DIAMOND') return 'DIAMOND';
  if (k === 'OURO') return 'OURO';
  if (k === 'SILVER') return 'SILVER';
  return null;
};

export const getEliteThresholds = () => ['SILVER', 'OURO', 'DIAMOND', 'RM'];

export const ensureEliteAchievedAt = (user, rankKey, nowIso) => {
  const now = String(nowIso || toIso());
  const cat = getEliteCategoryForRank(rankKey);
  const elite = { ...(user?.elite || {}) };
  const achievedAt = { ...(elite.achievedAt || {}) };
  if (!cat) return user;
  let changed = false;

  getEliteThresholds().forEach((threshold) => {
    if (!achievedAt[threshold]) {
      const shouldSet =
        (threshold === 'SILVER' && ['SILVER', 'OURO', 'DIAMOND', 'RM'].includes(cat)) ||
        (threshold === 'OURO' && ['OURO', 'DIAMOND', 'RM'].includes(cat)) ||
        (threshold === 'DIAMOND' && ['DIAMOND', 'RM'].includes(cat)) ||
        (threshold === 'RM' && ['RM'].includes(cat));
      if (shouldSet) {
        achievedAt[threshold] = now;
        changed = true;
      }
    }
  });

  if (!changed) return user;
  return { ...user, elite: { ...elite, achievedAt } };
};

const sortByAchievedAt = (cat, items) =>
  (items || [])
    .slice()
    .sort((a, b) => {
      const aa = a?.elite?.achievedAt?.[cat] || a?.createdAt || a?.updatedAt || '';
      const bb = b?.elite?.achievedAt?.[cat] || b?.createdAt || b?.updatedAt || '';
      if (aa && bb && aa !== bb) return aa < bb ? -1 : 1;
      if (aa && !bb) return -1;
      if (!aa && bb) return 1;
      const ea = String(a?.email || '');
      const eb = String(b?.email || '');
      return ea.localeCompare(eb);
    });

export const computeEliteBoard = (usersWithRank) => {
  const normalized = Array.isArray(usersWithRank) ? usersWithRank : [];
  const users = normalized
    .map((u) => ({ ...u, maxEliteCat: getEliteCategoryForRank(u?.rankKey) }))
    .filter((u) => Boolean(u.maxEliteCat));

  const assigned = {};

  ELITE_ORDER.slice()
    .reverse()
    .forEach((cat) => {
      const meta = ELITE_CATEGORIES.find((c) => c.key === cat);
      const slots = Number(meta?.slots || 0);
      if (!slots) return;
      const eligible = users.filter((u) => catIndex(u.maxEliteCat) >= catIndex(cat));
      const sorted = sortByAchievedAt(cat, eligible);
      let filled = 0;
      sorted.forEach((u) => {
        if (filled >= slots) return;
        const email = String(u?.email || '').toLowerCase();
        if (!email) return;
        if (assigned[email]) return;
        assigned[email] = cat;
        filled += 1;
      });
    });

  const result = {};
  ELITE_CATEGORIES.forEach((c) => {
    const eligible = users.filter((u) => catIndex(u.maxEliteCat) >= catIndex(c.key));
    const occupants = sortByAchievedAt(
      c.key,
      eligible.filter((u) => String(assigned[String(u?.email || '').toLowerCase()] || '') === c.key)
    ).map((u) => ({
      email: u.email,
      username: u.username,
      rankKey: u.rankKey,
      achievedAt: u?.elite?.achievedAt?.[c.key] || u?.createdAt || u?.updatedAt || null,
    }));

    const waiting = sortByAchievedAt(
      c.key,
      eligible.filter((u) => {
        const email = String(u?.email || '').toLowerCase();
        const ac = assigned[email] || null;
        if (!ac) return true;
        return catIndex(ac) < catIndex(c.key);
      })
    ).map((u) => ({
      email: u.email,
      username: u.username,
      rankKey: u.rankKey,
      achievedAt: u?.elite?.achievedAt?.[c.key] || u?.createdAt || u?.updatedAt || null,
    }));

    result[c.key] = {
      ...c,
      occupants,
      waiting,
    };
  });

  return result;
};

export const calcElitePool = (fortnightProfitUsd) => {
  const profit = Number(fortnightProfitUsd || 0);
  if (!Number.isFinite(profit) || profit <= 0) return { profit: 0, elitePool: 0 };
  const elitePool = Number((profit * 0.1).toFixed(2));
  return { profit, elitePool };
};

export const calcElitePayoutPerSlot = (elitePool, categoryKey) => {
  const cat = ELITE_CATEGORIES.find((c) => c.key === categoryKey);
  if (!cat) return 0;
  return Number((Number(elitePool || 0) * Number(cat.pctPerSlot || 0)).toFixed(2));
};
