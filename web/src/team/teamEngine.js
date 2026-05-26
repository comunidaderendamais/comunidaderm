const round2 = (n) => Number(Number(n || 0).toFixed(2));

const seedToInt = (seed) => {
  let h = 2166136261;
  const s = String(seed || '');
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};

const mulberry32 = (a) => () => {
  let t = (a += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export const RANKS = [
  { key: 'FERRO', title: 'Ferro', target: 10, bonus: 0, residual: { 1: 0.06, other: 0.03 } },
  { key: 'BRONZE', title: 'Bronze', target: 200, bonus: 10, residual: { 1: 0.08, other: 0.04 } },
  { key: 'SILVER', title: 'Silver', target: 2000, bonus: 100, residual: { 1: 0.1, other: 0.05 } },
  { key: 'OURO', title: 'Ouro', target: 5000, bonus: 300, residual: { 1: 0.15, other: 0.075 } },
  { key: 'DIAMOND', title: 'Diamond', target: 15000, bonus: 1200, residual: { 1: 0.2, other: 0.1 } },
  { key: 'RM', title: 'Diamond RM', target: 50000, bonus: 3000, residual: { 1: 0.25, other: 0.125 } },
];

export const MAX_LEG_PCT = 0.5;

export const generateDemoTeam = ({ seed, legs = 3, maxLevel = 5 }) => {
  const r = mulberry32(seedToInt(seed));
  const directLegs = [];

  for (let i = 0; i < legs; i += 1) {
    const legId = `leg${i + 1}`;
    const membersByLevel = {};
    for (let level = 1; level <= maxLevel; level += 1) {
      const count = level === 1 ? 1 : Math.max(1, Math.floor(r() * 4));
      const members = [];
      for (let m = 0; m < count; m += 1) {
        const invested = round2(10 + r() * (level === 1 ? 800 : 500));
        members.push({
          id: `${legId}-l${level}-m${m + 1}`,
          level,
          username: `user_${i + 1}_${level}_${m + 1}`,
          invested,
        });
      }
      membersByLevel[level] = members;
    }
    directLegs.push({ id: legId, membersByLevel });
  }

  return { directLegs };
};

export const sumLevel = (team, level) =>
  (team?.directLegs || []).reduce((acc, leg) => {
    const arr = leg?.membersByLevel?.[level];
    return acc + (Array.isArray(arr) ? arr.reduce((a, u) => a + Number(u.invested || 0), 0) : 0);
  }, 0);

export const sumAllLevels = (team) =>
  (team?.directLegs || []).reduce((acc, leg) => {
    const levels = Object.keys(leg?.membersByLevel || {});
    const total = levels.reduce((a, k) => {
      const arr = leg?.membersByLevel?.[k];
      return a + (Array.isArray(arr) ? arr.reduce((x, u) => x + Number(u.invested || 0), 0) : 0);
    }, 0);
    return acc + total;
  }, 0);

export const calcLegWeightedVolume = (leg) => {
  const membersByLevel = leg?.membersByLevel || {};
  const l1 = (membersByLevel[1] || []).reduce((a, u) => a + Number(u.invested || 0), 0);
  let other = 0;
  for (let level = 2; level <= 5; level += 1) {
    other += (membersByLevel[level] || []).reduce((a, u) => a + Number(u.invested || 0), 0);
  }
  return round2(l1 + other * 0.5);
};

export const calcRankVolume = (team, rankTarget) => {
  const legs = team?.directLegs || [];
  const cap = Number(rankTarget || 0) * MAX_LEG_PCT;
  const applyCap = Number(rankTarget || 0) >= 200;
  const legsDetail = legs.map((leg) => {
    const weighted = calcLegWeightedVolume(leg);
    const used = applyCap ? Math.min(weighted, cap) : weighted;
    return { id: leg.id, weighted: round2(weighted), used: round2(used) };
  });
  const total = round2(legsDetail.reduce((a, l) => a + l.used, 0));
  return { total, legs: legsDetail };
};

export const getCurrentRank = (team) => {
  let current = RANKS[0];
  for (const r of RANKS) {
    const vol = calcRankVolume(team, r.target).total;
    if (vol >= r.target) current = r;
  }
  const idx = RANKS.findIndex((r) => r.key === current.key);
  const next = idx >= 0 && idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
  const details = calcRankVolume(team, current.target);
  return { current, next, volume: details.total, legs: details.legs };
};

export const calcResidual = (team, rankKey) => {
  const rank = RANKS.find((r) => r.key === rankKey) || RANKS[0];
  const rateL1 = rank.residual[1];
  const rateOther = rank.residual.other;
  const l1 = sumLevel(team, 1);
  const l2 = sumLevel(team, 2);
  const l3 = sumLevel(team, 3);
  const l4 = sumLevel(team, 4);
  const l5 = sumLevel(team, 5);
  const byLevel = {
    1: round2(l1 * rateL1),
    2: round2(l2 * rateOther),
    3: round2(l3 * rateOther),
    4: round2(l4 * rateOther),
    5: round2(l5 * rateOther),
  };
  const total = round2(Object.values(byLevel).reduce((a, v) => a + v, 0));
  return { total, byLevel, rates: { 1: rateL1, other: rateOther } };
};

export const calcEntryFeeEarnings = (team) => {
  const l1 = sumLevel(team, 1);
  const l2 = sumLevel(team, 2);
  const l3 = sumLevel(team, 3);
  const te = 0.1;
  return {
    level1: round2(l1 * te * 0.4),
    level2: round2(l2 * te * 0.2),
    level3: round2(l3 * te * 0.1),
  };
};
