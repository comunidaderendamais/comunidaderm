import { getSupabaseClient } from './client.js';

const normalizeI18nText = (value) => {
  const v = value && typeof value === 'object' ? value : {};
  return {
    pt: typeof v.pt === 'string' ? v.pt : '',
    en: typeof v.en === 'string' ? v.en : '',
    es: typeof v.es === 'string' ? v.es : '',
  };
};

const normalizeFaqItem = (item, index = 0) => ({
  id: item?.id || null,
  sort: Number(item?.sort ?? index),
  q: normalizeI18nText(item?.q),
  a: normalizeI18nText(item?.a),
});

export const fetchFaqItems = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', items: [] };

  const { data, error } = await client
    .from('faq_items')
    .select('id, sort, q, a')
    .order('sort', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return { ok: false, error: error.message, items: [] };
  return { ok: true, error: null, items: Array.isArray(data) ? data.map(normalizeFaqItem) : [] };
};

export const adminReplaceFaqItems = async (items) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const normalized = (Array.isArray(items) ? items : []).map((item, index) => normalizeFaqItem(item, index));
  const payload = normalized.map((item, index) => ({
    q: item.q,
    a: item.a,
    sort: index,
  }));

  const { data, error } = await client.rpc('admin_replace_faq', { items: payload });
  if (error) return { ok: false, error: error.message };
  return { ok: Boolean(data?.ok), error: null, count: Number(data?.count || 0) };
};

