import { getSupabaseClient } from './client.js';

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

