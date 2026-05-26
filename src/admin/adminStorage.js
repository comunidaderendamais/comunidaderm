export const BANK_STATUS = {
  active: 'ACTIVE',
  upcoming: 'UPCOMING',
  closed: 'CLOSED',
};

export const getBankByQuotaKey = (cfg, quotaKey) => {
  const banks = cfg?.banks ? Object.values(cfg.banks) : Array.isArray(cfg?.banksList) ? cfg.banksList : [];
  return banks.find((b) => String(b?.quotaKey || b?.quota_key || '').toLowerCase() === String(quotaKey || '').toLowerCase()) || null;
};
