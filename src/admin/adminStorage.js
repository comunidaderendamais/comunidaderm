const ADMIN_CONFIG_KEY = 'rm_admin_config';

export const BANK_STATUS = {
  active: 'ACTIVE',
  upcoming: 'UPCOMING',
  closed: 'CLOSED',
};

export const defaultAdminConfig = {
  version: 6,
  globalSold: 45230,
  cycle: {
    months: 6,
    renewWindowHours: 72,
    entryFeePct: 0.1,
  },
  elite: {
    fortnightProfitUsd: 0,
    lastPaidAt: null,
  },
  banks: {
    rm1: {
      id: 'rm1',
      name: 'Banca RM 1',
      quotaKey: 'cota10',
      status: BANK_STATUS.active,
      limit: 10000,
      filledPct: 100,
      profitAccumulatedPct: 34,
      profitMonthPct: 4,
    },
    rm2: {
      id: 'rm2',
      name: 'Banca RM 2',
      quotaKey: 'cota50',
      status: BANK_STATUS.active,
      limit: 30000,
      filledPct: 65,
      profitAccumulatedPct: 38.5,
      profitMonthPct: 5.5,
    },
    rm3: {
      id: 'rm3',
      name: 'Banca RM 3',
      quotaKey: 'cota100',
      status: BANK_STATUS.upcoming,
      limit: 60000,
      filledPct: 0,
      profitAccumulatedPct: 0,
      profitMonthPct: 0,
    },
  },
  support: {
    finance: { id: 'finance', name: 'Suporte 1 (Financeiro)', online: true, queue: 0 },
    tech: { id: 'tech', name: 'Suporte 2 (Técnico)', online: true, queue: 2 },
  },
};

export const normalizeAdminConfig = (cfg) => {
  const banks = cfg?.banks ?? {};
  const support = cfg?.support ?? {};
  const cycle = cfg?.cycle ?? {};
  const elite = cfg?.elite ?? {};
  const next = {
    ...defaultAdminConfig,
    ...cfg,
    globalSold: typeof cfg?.globalSold === 'number' ? cfg.globalSold : defaultAdminConfig.globalSold,
    cycle: { ...defaultAdminConfig.cycle },
    elite: { ...defaultAdminConfig.elite },
    banks: { ...defaultAdminConfig.banks },
    support: { ...defaultAdminConfig.support },
  };
  next.cycle = { ...defaultAdminConfig.cycle, ...(cycle || {}) };
  next.elite = { ...defaultAdminConfig.elite, ...(elite || {}) };
  Object.keys(defaultAdminConfig.banks).forEach((id) => {
    next.banks[id] = { ...defaultAdminConfig.banks[id], ...(banks[id] || {}) };
  });
  Object.keys(defaultAdminConfig.support).forEach((id) => {
    next.support[id] = { ...defaultAdminConfig.support[id], ...(support[id] || {}) };
  });
  return next;
};

export const loadAdminConfig = () => {
  try {
    const raw = localStorage.getItem(ADMIN_CONFIG_KEY);
    if (!raw) {
      const seeded = normalizeAdminConfig(defaultAdminConfig);
      localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed = JSON.parse(raw);
    const needsMigration = parsed?.version !== defaultAdminConfig.version;
    if (!needsMigration) return normalizeAdminConfig(parsed);

    const migrated = {
      ...parsed,
      version: defaultAdminConfig.version,
      cycle: { ...(parsed?.cycle || {}) },
      elite: { ...(parsed?.elite || {}) },
      banks: { ...(parsed?.banks || {}) },
      support: { ...(parsed?.support || {}) },
    };

    Object.keys(defaultAdminConfig.banks).forEach((id) => {
      migrated.banks[id] = {
        ...(parsed?.banks?.[id] || {}),
        profitAccumulatedPct: defaultAdminConfig.banks[id].profitAccumulatedPct,
        profitMonthPct: defaultAdminConfig.banks[id].profitMonthPct,
      };
    });

    Object.keys(defaultAdminConfig.support).forEach((id) => {
      migrated.support[id] = {
        ...defaultAdminConfig.support[id],
        ...(parsed?.support?.[id] || {}),
      };
    });

    const normalized = normalizeAdminConfig(migrated);
    localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(normalized));
    return normalized;
  } catch {
    return normalizeAdminConfig(defaultAdminConfig);
  }
};

export const saveAdminConfig = (cfg) => {
  const normalized = normalizeAdminConfig(cfg);
  localStorage.setItem(ADMIN_CONFIG_KEY, JSON.stringify(normalized));
  return normalized;
};

export const getBankByQuotaKey = (cfg, quotaKey) => {
  const banks = cfg?.banks ? Object.values(cfg.banks) : [];
  return banks.find((b) => b.quotaKey === quotaKey) || null;
};
