import { sumAllLevels, sumLevel } from './teamEngine.js';

export const formatTeamMoney = (value) =>
  `$${Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

export const formatTeamPct = (rate) => {
  const pct = Number(rate || 0) * 100;
  const hasDecimal = Math.abs(pct - Math.round(pct)) > 1e-9;
  return `${pct.toLocaleString('pt-BR', {
    minimumFractionDigits: hasDecimal ? 1 : 0,
    maximumFractionDigits: 1,
  })}%`;
};

export const getStructureLevels = ({ team, residual }) =>
  [1, 2, 3, 4, 5].map((lvl) => ({
    lvl,
    base: sumLevel(team, lvl),
    rate: lvl === 1 ? residual?.rates?.[1] : residual?.rates?.other,
  }));

export const getStructureTotalBase = (team) => sumAllLevels(team);

export const getRankProgressPct = (rankInfo) => {
  const target = Number(rankInfo?.next?.target || 0);
  if (target <= 0) return 100;
  return Math.min(100, (Number(rankInfo?.volume || 0) / target) * 100);
};

export const getLegTarget = (nextRankTarget) => {
  const target = Number(nextRankTarget || 0);
  return target > 0 ? target * 0.5 : 0;
};

export const getLegProgressPct = ({ used, targetPerLeg }) => {
  const target = Number(targetPerLeg || 0);
  if (target <= 0) return 0;
  return Math.min(100, (Number(used || 0) / target) * 100);
};
