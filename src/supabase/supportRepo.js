import { getSupabaseClient } from './client.js';

const normThread = (row) => ({
  id: row?.id,
  profileId: row?.profile_id,
  channel: row?.channel,
  status: row?.status,
  createdAt: row?.created_at,
  updatedAt: row?.updated_at,
  profile: row?.profiles || row?.profile || null,
});

const normMessage = (row) => ({
  id: row?.id,
  threadId: row?.thread_id,
  from: row?.from_role === 'admin' ? 'admin' : 'user',
  text: row?.body || '',
  at: row?.created_at,
  readByUser: Boolean(row?.read_by_user),
  readByAdmin: Boolean(row?.read_by_admin),
});

export const ensureMySupportThread = async ({ profileId, channel } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', thread: null };

  const pid = String(profileId || '').trim();
  const ch = String(channel || '').trim();
  if (!pid || !ch) return { ok: false, error: 'profileId/canal ausente.', thread: null };

  const existing = await client
    .from('support_threads')
    .select('id, profile_id, channel, status, created_at, updated_at')
    .eq('profile_id', pid)
    .eq('channel', ch)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing.error) return { ok: false, error: existing.error.message, thread: null };
  if (existing.data) return { ok: true, error: null, thread: normThread(existing.data) };

  const created = await client
    .from('support_threads')
    .insert({ profile_id: pid, channel: ch, status: 'open' })
    .select('id, profile_id, channel, status, created_at, updated_at')
    .single();

  if (created.error) return { ok: false, error: created.error.message, thread: null };
  return { ok: true, error: null, thread: normThread(created.data) };
};

export const fetchThreadMessages = async ({ threadId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', messages: [] };

  const tid = String(threadId || '').trim();
  if (!tid) return { ok: false, error: 'threadId ausente.', messages: [] };

  const { data, error } = await client
    .from('support_messages')
    .select('id, thread_id, from_role, body, read_by_user, read_by_admin, created_at')
    .eq('thread_id', tid)
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message, messages: [] };
  return { ok: true, error: null, messages: Array.isArray(data) ? data.map(normMessage) : [] };
};

export const sendSupportMessage = async ({ threadId, from, text } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', message: null };

  const tid = String(threadId || '').trim();
  const body = String(text || '').trim();
  const role = from === 'admin' ? 'admin' : 'user';
  if (!tid || !body) return { ok: false, error: 'threadId/texto ausente.', message: null };

  const insert = {
    thread_id: tid,
    from_role: role,
    body,
    read_by_user: role === 'user',
    read_by_admin: role === 'admin',
  };

  const { data, error } = await client
    .from('support_messages')
    .insert(insert)
    .select('id, thread_id, from_role, body, read_by_user, read_by_admin, created_at')
    .single();

  if (error) return { ok: false, error: error.message, message: null };
  return { ok: true, error: null, message: normMessage(data) };
};

export const markThreadReadForUser = async ({ threadId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const tid = String(threadId || '').trim();
  if (!tid) return { ok: false, error: 'threadId ausente.' };

  const { error } = await client
    .from('support_messages')
    .update({ read_by_user: true })
    .eq('thread_id', tid)
    .eq('from_role', 'admin')
    .eq('read_by_user', false);

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
};

export const markThreadReadForAdmin = async ({ threadId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const tid = String(threadId || '').trim();
  if (!tid) return { ok: false, error: 'threadId ausente.' };

  const { error } = await client
    .from('support_messages')
    .update({ read_by_admin: true })
    .eq('thread_id', tid)
    .eq('from_role', 'user')
    .eq('read_by_admin', false);

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
};

export const fetchMySupportUnreadCount = async ({ profileId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', unread: 0 };

  const pid = String(profileId || '').trim();
  if (!pid) return { ok: false, error: 'profileId ausente.', unread: 0 };

  const threadsRes = await client
    .from('support_threads')
    .select('id')
    .eq('profile_id', pid);

  if (threadsRes.error) return { ok: false, error: threadsRes.error.message, unread: 0 };
  const ids = Array.isArray(threadsRes.data) ? threadsRes.data.map((r) => r.id).filter(Boolean) : [];
  if (ids.length === 0) return { ok: true, error: null, unread: 0 };

  const { count, error } = await client
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .in('thread_id', ids)
    .eq('from_role', 'admin')
    .eq('read_by_user', false);

  if (error) return { ok: false, error: error.message, unread: 0 };
  return { ok: true, error: null, unread: Number(count || 0) };
};

export const adminListSupportThreads = async ({ limit = 200 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', threads: [] };

  const { data, error } = await client
    .from('support_threads')
    .select('id, profile_id, channel, status, created_at, updated_at, profiles (id, email, name, username)')
    .order('updated_at', { ascending: false })
    .limit(Math.max(1, Math.min(500, Number(limit) || 200)));

  if (error) return { ok: false, error: error.message, threads: [] };
  return { ok: true, error: null, threads: Array.isArray(data) ? data.map(normThread) : [] };
};

export const adminSetSupportThreadStatus = async ({ threadId, status } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const tid = String(threadId || '').trim();
  if (!tid) return { ok: false, error: 'threadId ausente.' };
  const st = status === 'resolved' ? 'resolved' : 'open';

  const { error } = await client
    .from('support_threads')
    .update({ status: st })
    .eq('id', tid);

  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
};

export const adminFetchSupportUnreadCount = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', unread: 0 };

  const { count, error } = await client
    .from('support_messages')
    .select('id', { count: 'exact', head: true })
    .eq('from_role', 'user')
    .eq('read_by_admin', false);

  if (error) return { ok: false, error: error.message, unread: 0 };
  return { ok: true, error: null, unread: Number(count || 0) };
};
