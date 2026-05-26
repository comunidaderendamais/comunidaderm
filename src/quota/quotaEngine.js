const addMonthsUtc = (iso, months) => {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  const next = new Date(Date.UTC(y, m + months, 1, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next.toISOString();
};

const addHoursUtc = (iso, hours) => {
  const d = new Date(iso);
  d.setUTCHours(d.getUTCHours() + hours);
  return d.toISOString();
};

export const QUOTA_GLOBAL_LIMIT = 100000;
export const USER_PLAN_LIMIT = 100;
export const CYCLE_MONTHS = 6;
export const RENEW_WINDOW_HOURS = 72;
export const ENTRY_FEE_PCT = 0.1;
export const DESIST_START_PCT = 0.2;
export const DESIST_STEP_PCT = 0.04;
export const DESIST_ANALYSIS_HOURS = 72;

export const getCycleParams = (adminConfig) => {
  const cycle = adminConfig?.cycle || {};
  const months = Number.isFinite(Number(cycle.months)) ? Number(cycle.months) : CYCLE_MONTHS;
  const renewWindowHours = Number.isFinite(Number(cycle.renewWindowHours)) ? Number(cycle.renewWindowHours) : RENEW_WINDOW_HOURS;
  const entryFeePct = Number.isFinite(Number(cycle.entryFeePct)) ? Number(cycle.entryFeePct) : ENTRY_FEE_PCT;
  const globalLimit = QUOTA_GLOBAL_LIMIT;
  const userPlanLimit = USER_PLAN_LIMIT;
  return { months, renewWindowHours, entryFeePct, globalLimit, userPlanLimit };
};

export const createLot = ({ planKey, planTitle, units, planPrice, quotasPerUnit, nowIso, cycleMonths, renewWindowHours }) => {
  const monthsFinal = Number.isFinite(Number(cycleMonths)) ? Number(cycleMonths) : CYCLE_MONTHS;
  const renewHoursFinal = Number.isFinite(Number(renewWindowHours)) ? Number(renewWindowHours) : RENEW_WINDOW_HOURS;
  const startAt = nowIso;
  const endAt = addMonthsUtc(startAt, monthsFinal);
  const renewUntil = addHoursUtc(endAt, renewHoursFinal);
  return {
    id: `${Date.now()}-${planKey}-${Math.random().toString(16).slice(2)}`,
    planKey,
    planTitle,
    units,
    planPrice,
    quotasPerUnit,
    startAt,
    endAt,
    renewUntil,
    status: 'ACTIVE',
    settledAt: null,
    cancelRequestedAt: null,
    cancelPayAt: null,
    cancelPenaltyPct: null,
    cancelAmount: null,
  };
};

export const normalizeUserCycles = (user) => {
  const quotaLots = Array.isArray(user?.quotaLots) ? user.quotaLots : [];
  return { ...user, quotaLots };
};

export const calcDesistPenaltyPct = ({ startAt, now = new Date(), cycleMonths }) => {
  const monthsFinal = Number.isFinite(Number(cycleMonths)) ? Number(cycleMonths) : CYCLE_MONTHS;
  const startTs = Date.parse(startAt);
  const nowTs = now.getTime();
  if (!Number.isFinite(startTs) || nowTs <= startTs) return DESIST_START_PCT;
  const days = Math.floor((nowTs - startTs) / (1000 * 60 * 60 * 24));
  const monthIndex = Math.min(monthsFinal, Math.floor(days / 30) + 1);
  const pct = DESIST_START_PCT - DESIST_STEP_PCT * (monthIndex - 1);
  return Math.max(0, Number(pct.toFixed(4)));
};

export const requestDesistance = ({ user, adminConfig, lotId, now = new Date() }) => {
  const nowIso = now.toISOString();
  const nowTs = now.getTime();
  const nextUser = normalizeUserCycles(user);
  const lots = Array.isArray(nextUser.quotaLots) ? nextUser.quotaLots : [];
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) return { ok: false, reason: 'Lote não encontrado.' };
  if (lot.status !== 'ACTIVE') return { ok: false, reason: 'Somente cotas ativas podem solicitar desistência.' };

  const cycleParams = getCycleParams(adminConfig);
  const total = Number(lot.planPrice || 0) * Number(lot.units || 0);
  const principalReturn = Number((total * (1 - cycleParams.entryFeePct)).toFixed(2));
  const penaltyPct = calcDesistPenaltyPct({ startAt: lot.startAt, now, cycleMonths: cycleParams.months });
  const amount = Number((principalReturn * (1 - penaltyPct)).toFixed(2));

  const payAt = addHoursUtc(nowIso, DESIST_ANALYSIS_HOURS);

  const nextLots = lots.map((l) =>
    l.id === lotId
      ? { ...l, status: 'CANCEL_PENDING', cancelRequestedAt: nowIso, cancelPayAt: payAt, cancelPenaltyPct: penaltyPct, cancelAmount: amount }
      : l
  );

  return {
    ok: true,
    user: { ...nextUser, quotaLots: nextLots },
    notification: {
      kind: 'DESIST_REQ',
      title: 'Desistência solicitada',
      message: `${lot.planTitle}: análise de ${DESIST_ANALYSIS_HOURS}h. Valor estimado: ${amount.toFixed(2)} (penalidade ${Math.round(penaltyPct * 1000) / 10}%).`,
      at: nowIso,
      ref: lot.id,
      i18n: {
        titleKey: 'desistanceNotificationTitle',
        messageKey: 'desistanceNotificationMessage',
        values: { plan: lot.planTitle, hours: DESIST_ANALYSIS_HOURS, amount, penalty: Math.round(penaltyPct * 1000) / 10 },
      },
    },
  };
};

export const settleCyclesIfNeeded = ({ user, adminConfig, now = new Date() }) => {
  const nowIso = now.toISOString();
  const nowTs = now.getTime();
  const cycleParams = getCycleParams(adminConfig);

  const nextUser = normalizeUserCycles(user);
  const nextAdmin = { ...adminConfig };
  const nextLots = [];
  const notifications = [];
  const transactions = [];

  const balances = { ...(nextUser.balances || {}) };
  const holdings = { ...(nextUser.holdings || {}) };

  const existingLots = Array.isArray(nextUser.quotaLots) ? nextUser.quotaLots : [];

  for (const lot of existingLots) {
    const endTs = Date.parse(lot.endAt);
    const renewUntilTs = Date.parse(lot.renewUntil);
    const cancelPayAtTs = Date.parse(lot.cancelPayAt);
    const total = Number(lot.planPrice || 0) * Number(lot.units || 0);
    const principalReturn = Number((total * (1 - cycleParams.entryFeePct)).toFixed(2));

    if (lot.status === 'CANCEL_PENDING' && Number.isFinite(cancelPayAtTs) && nowTs >= cancelPayAtTs) {
      const amount = Number(lot.cancelAmount || 0);
      const penaltyPct = Number(lot.cancelPenaltyPct || 0);

      balances.available = Number((Number(balances.available || 0) + amount).toFixed(2));
      balances.invested = Math.max(0, Number((Number(balances.invested || 0) - total).toFixed(2)));

      const currentUnits = Number(holdings[lot.planKey] || 0);
      holdings[lot.planKey] = Math.max(0, currentUnits - Number(lot.units || 0));

      const sold = Number(nextAdmin?.globalSold || 0);
      const dec = Number(lot.quotasPerUnit || 0) * Number(lot.units || 0);
      nextAdmin.globalSold = Math.max(0, sold - dec);

      transactions.push({
        id: `${Date.now()}-desist-${lot.id}`,
        at: nowIso,
        kind: 'DESISTENCIA',
        type: `Desistência (${lot.planTitle})`,
        amount,
        meta: { penaltyPct },
        payment: 'SISTEMA',
        status: 'Creditado',
      });

      notifications.push({
        kind: 'DESIST_DONE',
        title: 'Desistência concluída',
        message: `${lot.planTitle}: ressarcimento ${amount.toFixed(2)} (penalidade ${Math.round(penaltyPct * 1000) / 10}%).`,
        at: nowIso,
        ref: lot.id,
        i18n: {
          titleKey: 'desistanceDoneTitle',
          messageKey: 'desistanceDoneMessageTemplate',
          values: { plan: lot.planTitle, amount, penalty: Math.round(penaltyPct * 1000) / 10 },
        },
      });

      continue;
    }

    if (lot.status === 'ACTIVE' && Number.isFinite(endTs) && nowTs >= endTs) {
      balances.available = Number((Number(balances.available || 0) + principalReturn).toFixed(2));
      balances.invested = Math.max(0, Number((Number(balances.invested || 0) - total).toFixed(2)));

      transactions.push({
        id: `${Date.now()}-cycle-${lot.id}`,
        at: nowIso,
        kind: 'CYCLE',
        type: `Ciclo concluído (${lot.planTitle})`,
        amount: principalReturn,
        payment: 'SISTEMA',
        status: 'Creditado',
      });

      notifications.push({
        kind: 'CYCLE_DONE',
        title: 'Ciclo concluído',
        message: `${lot.planTitle}: liberado ${principalReturn.toFixed(2)} (${Math.round(cycleParams.entryFeePct * 100)}% taxa de entrada). Renovação disponível por ${cycleParams.renewWindowHours}h.`,
        at: nowIso,
        ref: lot.id,
        i18n: {
          titleKey: 'cycleDoneTitle',
          messageKey: 'cycleDoneMessageTemplate',
          values: {
            plan: lot.planTitle,
            amount: principalReturn,
            entryFeePct: Math.round(cycleParams.entryFeePct * 100),
            hours: cycleParams.renewWindowHours,
          },
        },
      });

      nextLots.push({ ...lot, status: 'MATURED', settledAt: nowIso });
      continue;
    }

    if (lot.status === 'MATURED' && Number.isFinite(renewUntilTs) && nowTs > renewUntilTs) {
      const currentUnits = Number(holdings[lot.planKey] || 0);
      holdings[lot.planKey] = Math.max(0, currentUnits - Number(lot.units || 0));

      const sold = Number(nextAdmin?.globalSold || 0);
      const dec = Number(lot.quotasPerUnit || 0) * Number(lot.units || 0);
      nextAdmin.globalSold = Math.max(0, sold - dec);

      notifications.push({
        kind: 'QUOTAS_RELEASED',
        title: 'Cotas liberadas',
        message: `${lot.planTitle}: prazo de renovação expirou. Cotas voltaram para o limite global.`,
        at: nowIso,
        ref: lot.id,
        i18n: {
          titleKey: 'quotasReleasedTitle',
          messageKey: 'quotasReleasedMessageTemplate',
          values: { plan: lot.planTitle },
        },
      });

      continue;
    }

    nextLots.push(lot);
  }

  const updatedUser = {
    ...nextUser,
    balances,
    holdings,
    quotaLots: nextLots,
    transactions: transactions.length ? [...transactions, ...(Array.isArray(nextUser.transactions) ? nextUser.transactions : [])] : nextUser.transactions,
  };

  return { user: updatedUser, adminConfig: nextAdmin, notifications };
};

export const canBuyPlan = ({ user, adminConfig, planKey, unitsToBuy, quotasPerUnit }) => {
  const cycleParams = getCycleParams(adminConfig);
  const holdings = user?.holdings || {};
  const currentUnits = Number(holdings?.[planKey] || 0);
  if (currentUnits + unitsToBuy > cycleParams.userPlanLimit) {
    return { ok: false, reason: `Limite de ${cycleParams.userPlanLimit} unidades por usuário atingido.` };
  }

  const sold = Number(adminConfig?.globalSold || 0);
  const inc = Number(quotasPerUnit || 0) * Number(unitsToBuy || 0);
  if (sold + inc > cycleParams.globalLimit) {
    return { ok: false, reason: 'Limite global de 100.000 cotas atingido.' };
  }

  return { ok: true, reason: null };
};

export const renewLot = ({ user, adminConfig, cycle, lotId, payment, network, now = new Date() }) => {
  const nowIso = now.toISOString();
  const nowTs = now.getTime();
  const cycleParams = getCycleParams({ cycle: cycle || adminConfig?.cycle });

  const nextUser = normalizeUserCycles(user);
  const lots = Array.isArray(nextUser.quotaLots) ? nextUser.quotaLots : [];
  const lot = lots.find((l) => l.id === lotId);
  if (!lot) return { ok: false, reason: 'Lote não encontrado.' };
  if (lot.status !== 'MATURED') return { ok: false, reason: 'Este lote não está disponível para renovação.' };

  const renewUntilTs = Date.parse(lot.renewUntil);
  if (!Number.isFinite(renewUntilTs) || nowTs > renewUntilTs) return { ok: false, reason: 'Prazo de renovação expirou.' };

  const total = Number(lot.planPrice || 0) * Number(lot.units || 0);
  const balances = { ...(nextUser.balances || {}) };
  if (payment === 'SALDO') {
    const available = Number(balances.available || 0);
    if (available < total) return { ok: false, reason: 'Saldo disponível insuficiente para renovar.' };
    balances.available = Number((available - total).toFixed(2));
  }
  balances.invested = Number((Number(balances.invested || 0) + total).toFixed(2));

  const planTitle = lot.planTitle;
  const newLot = createLot({
    planKey: lot.planKey,
    planTitle,
    units: lot.units,
    planPrice: lot.planPrice,
    quotasPerUnit: lot.quotasPerUnit,
    nowIso,
    cycleMonths: cycleParams.months,
    renewWindowHours: cycleParams.renewWindowHours,
  });

  const tx = {
    id: `${Date.now()}-renew-${lot.id}`,
    at: nowIso,
    type: `Renovação (${planTitle})`,
    amount: -total,
    payment: payment === 'SALDO' ? 'SALDO' : `${payment} ${network || ''}`.trim(),
    status: payment === 'SALDO' ? 'Concluído' : 'Pendente',
  };

  const nextLots = lots.filter((l) => l.id !== lotId);
  nextLots.push(newLot);

  const updatedUser = {
    ...nextUser,
    balances,
    quotaLots: nextLots,
    transactions: [tx, ...(Array.isArray(nextUser.transactions) ? nextUser.transactions : [])],
  };

  return {
    ok: true,
    user: updatedUser,
    notification: {
      kind: 'RENEW',
      title: 'Renovação registrada',
      message: `${planTitle}: renovação iniciada (${payment}).`,
      at: nowIso,
      ref: newLot.id,
      i18n: {
        titleKey: 'renewNotificationTitle',
        messageKey: 'renewNotificationMessage',
        values: { plan: planTitle, payment },
      },
    },
  };
};
