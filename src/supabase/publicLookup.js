import { getSupabaseClient } from './client.js';

export const isUsernameAvailable = async (username) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', available: false };

  const u = String(username || '').trim().toLowerCase();
  if (!u) return { ok: false, error: 'Username inválido.', available: false };

  const { data, error } = await client.rpc('is_username_available', { desired_username: u });
  if (error) return { ok: false, error: error.message, available: false };
  return { ok: true, error: null, available: Boolean(data) };
};

export const isEmailAvailable = async (email) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', available: false };

  const e = String(email || '').trim().toLowerCase();
  if (!e) return { ok: false, error: 'E-mail inválido.', available: false };

  const { data, error } = await client.rpc('is_email_available', { desired_email: e });
  if (error) return { ok: false, error: error.message, available: false };
  return { ok: true, error: null, available: Boolean(data) };
};

export const getReferrerProfile = async (username) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', profile: null };

  const u = String(username || '').trim().toLowerCase();
  if (!u) return { ok: true, error: null, profile: null };

  const { data, error } = await client.rpc('get_referrer_profile', { desired_username: u });
  if (error) return { ok: false, error: error.message, profile: null };

  const profile = Array.isArray(data) ? data[0] : data;
  return profile?.id ? { ok: true, error: null, profile } : { ok: true, error: null, profile: null };
};

