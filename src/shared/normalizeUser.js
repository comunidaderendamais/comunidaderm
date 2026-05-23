import { normalizeUserCycles } from '../quota/quotaEngine.js';

export const normalizeUser = (u) => {
  const userId =
    String(u?.userId || '').trim() ||
    (() => {
      try {
        if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
      } catch {}
      return `rm_${Date.now()}_${Math.random().toString(16).slice(2, 10)}`;
    })();
  const wallets = u?.wallets ?? { usdtBep20: '', usdtTrc20: '', usdcArbitrum: '' };
  const balances = u?.balances ?? { available: 0, invested: 0, teamEarnings: 0, eliteEarnings: 0, teEarnings: 0 };
  if (!Object.prototype.hasOwnProperty.call(balances, 'eliteEarnings')) balances.eliteEarnings = 0;
  if (!Object.prototype.hasOwnProperty.call(balances, 'teEarnings')) balances.teEarnings = 0;
  const holdings = u?.holdings ?? { cota10: 0, cota50: 0, cota100: 0 };
  const transactions = Array.isArray(u?.transactions) ? u.transactions : [];
  return normalizeUserCycles({ ...u, userId, wallets, balances, holdings, transactions });
};

