import { getSupabaseClient } from './client.js';

const normalizeCandidate = (row) => ({
  id: row?.id || null,
  email: row?.email || null,
  username: row?.username || null,
  rankKey: row?.rank_key || null,
  elite: row?.elite || {},
  createdAt: row?.created_at || null,
  updatedAt: row?.updated_at || null,
});

export const fetchEliteCandidates = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', users: [] };

  const { data, error } = await client.rpc('get_elite_candidates');
  if (error) return { ok: false, error: error.message, users: [] };

  return {
    ok: true,
    error: null,
    users: Array.isArray(data) ? data.map(normalizeCandidate) : [],
  };
};

