import { getSupabaseClient } from './client.js';

const safeNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const mapNetworkRowsToLevels = (rows) =>
  [1, 2, 3, 4, 5].map((level) => ({
    level,
    users: rows
      .filter((row) => Number(row?.level) === level)
      .map((row, index) => ({
        key: String(row?.id || `${level}-${index}`),
        username: row?.username || '—',
        email: row?.email || '—',
        userId: row?.user_id || '—',
        createdAt: row?.created_at || null,
        invested: safeNum(row?.balances?.invested || 0),
        holdings: row?.holdings || {},
        totalCotas:
          safeNum(row?.holdings?.cota10 || 0) +
          safeNum(row?.holdings?.cota50 || 0) +
          safeNum(row?.holdings?.cota100 || 0),
        planStats: {
          cota10: { units: safeNum(row?.holdings?.cota10 || 0), lastAt: null, totalUsd: safeNum(row?.holdings?.cota10 || 0) * 10 },
          cota50: { units: safeNum(row?.holdings?.cota50 || 0), lastAt: null, totalUsd: safeNum(row?.holdings?.cota50 || 0) * 50 },
          cota100: { units: safeNum(row?.holdings?.cota100 || 0), lastAt: null, totalUsd: safeNum(row?.holdings?.cota100 || 0) * 100 },
        },
        rankTitle: String(row?.rank_key || '—').toUpperCase(),
      })),
  }));

export const fetchMyDashboard = async ({ maxTransactions = 50 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', dashboard: null };
  const { data, error } = await client.rpc('get_my_dashboard', { max_transactions: maxTransactions });
  if (error) return { ok: false, error: error.message, dashboard: null };
  return { ok: Boolean(data?.ok), error: null, dashboard: data || null };
};

export const fetchMyTeamSummary = async ({ maxDepth = 5 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', summary: null };
  const { data, error } = await client.rpc('get_my_team_summary', { max_depth: maxDepth });
  if (error) return { ok: false, error: error.message, summary: null };
  return { ok: Boolean(data?.ok), error: null, summary: data || null };
};

export const fetchMyNetwork = async ({ maxDepth = 5 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', levels: [] };

  const { data, error } = await client.rpc('get_my_network', { max_depth: maxDepth, only_active: true });
  if (error) return { ok: false, error: error.message, levels: [] };

  const rows = Array.isArray(data) ? data : [];
  return { ok: true, error: null, levels: mapNetworkRowsToLevels(rows) };
};
