export const buildAdminConfigFromSupabase = ({ config, banks }) => {
  const cfg = config || {};
  const cycle = cfg?.cycle || {};
  const elite = cfg?.elite || {};
  const support = cfg?.support || {};

  const banksMap = {};
  (Array.isArray(banks) ? banks : []).forEach((b) => {
    const id = String(b?.id || '').trim();
    if (!id) return;
    banksMap[id] = {
      id,
      name: b?.name || id,
      quotaKey: b?.quota_key || b?.quotaKey,
      status: String(b?.status || 'UPCOMING').toUpperCase(),
      limit: Number(b?.limit_usd ?? 0),
      filledPct: Number(b?.filled_pct ?? 0),
      profitAccumulatedPct: b?.profit_accumulated_pct == null ? 0 : Number(b.profit_accumulated_pct),
      profitMonthPct: b?.profit_month_pct == null ? 0 : Number(b.profit_month_pct),
    };
  });

  return {
    cycle: {
      months: Number(cycle?.months ?? 6),
      renewWindowHours: Number(cycle?.renewWindowHours ?? 72),
      entryFeePct: Number(cycle?.entryFeePct ?? 0.1),
    },
    elite: {
      fortnightProfitUsd: Number(elite?.profitQuinzenal ?? elite?.fortnightProfitUsd ?? 0),
      lastPaidAt: elite?.lastPaidAt ?? null,
    },
    banks: banksMap,
    support: {
      finance: { id: 'finance', name: 'Suporte 1 (Financeiro)', online: Boolean(support?.finance?.online), queue: Number(support?.finance?.queue ?? 0) },
      tech: { id: 'tech', name: 'Suporte 2 (Técnico)', online: Boolean(support?.tech?.online), queue: Number(support?.tech?.queue ?? 0) },
    },
  };
};

