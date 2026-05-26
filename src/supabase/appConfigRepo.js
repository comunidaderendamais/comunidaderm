import { getSupabaseClient } from './client.js';

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const fetchAppConfig = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', config: null };
  const { data, error } = await client.rpc('get_app_config');
  if (error) return { ok: false, error: error.message, config: null };
  return { ok: true, error: null, config: data || {} };
};

export const adminPatchAppConfig = async (patch) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', config: null };
  const { data, error } = await client.rpc('admin_patch_app_config', { patch: patch || {} });
  if (error) return { ok: false, error: error.message, config: null };
  return { ok: true, error: null, config: data?.config || null };
};

export const fetchBanks = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', banks: [] };
  const { data, error } = await client.rpc('list_banks');
  if (error) return { ok: false, error: error.message, banks: [] };
  return { ok: true, error: null, banks: Array.isArray(data) ? data : [] };
};

export const adminUpsertBank = async (bank) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };
  const b = bank || {};
  const { data, error } = await client.rpc('admin_upsert_bank', {
    bank_id: String(b.id || '').trim(),
    bank_name: String(b.name || '').trim(),
    bank_quota_key: String(b.quotaKey || b.quota_key || '').trim(),
    bank_status: String(b.status || '').trim(),
    bank_limit_usd: safeNum(b.limitUsd ?? b.limit_usd ?? b.limit ?? 0),
    bank_filled_pct: safeNum(b.filledPct ?? b.filled_pct ?? 0),
    bank_profit_month_pct: b.profitMonthPct == null ? null : safeNum(b.profitMonthPct),
    bank_profit_accumulated_pct: b.profitAccumulatedPct == null ? null : safeNum(b.profitAccumulatedPct),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: Boolean(data?.ok), error: null };
};

export const fetchPublicStats = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', stats: null };
  const { data, error } = await client.rpc('get_public_stats');
  if (error) return { ok: false, error: error.message, stats: null };
  return { ok: true, error: null, stats: data || {} };
};
