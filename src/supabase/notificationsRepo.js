import { getSupabaseClient } from './client.js';

const normalizeNotification = (row) => {
  const payload = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const createdAt = row?.created_at || row?.createdAt || new Date().toISOString();
  return {
    id: row?.id,
    kind: row?.kind || payload?.kind || 'SYSTEM',
    ref: row?.ref ?? payload?.ref ?? null,
    at: createdAt,
    read: Boolean(row?.read_at),
    title: payload?.title || 'Notificação',
    message: payload?.message || '',
    i18n: payload?.i18n || null,
  };
};

export const fetchMyNotifications = async ({ profileId, limit = 50 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', notifications: [] };

  const pid = String(profileId || '').trim();
  if (!pid) return { ok: false, error: 'profileId ausente.', notifications: [] };

  const { data, error } = await client
    .from('notifications')
    .select('id, kind, ref, payload, created_at, read_at')
    .eq('profile_id', pid)
    .order('created_at', { ascending: false })
    .limit(Math.max(1, Math.min(200, Number(limit) || 50)));

  if (error) return { ok: false, error: error.message, notifications: [] };
  const list = Array.isArray(data) ? data.map(normalizeNotification) : [];
  return { ok: true, error: null, notifications: list };
};

export const markAllMyNotificationsRead = async ({ profileId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const pid = String(profileId || '').trim();
  if (!pid) return { ok: false, error: 'profileId ausente.' };

  const nowIso = new Date().toISOString();
  const { error } = await client
    .from('notifications')
    .update({ read_at: nowIso })
    .eq('profile_id', pid)
    .is('read_at', null);

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
};

