import { getSupabaseClient } from './client.js';

const BANK_HISTORY_BUCKET = 'bank-history';

export const normalizeYmd = (value) => {
  if (!value) return null;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const getTodayYmd = () => normalizeYmd(new Date());

export const getYesterdayYmd = () => {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return normalizeYmd(d);
};

const normalizeUrls = (value) => (Array.isArray(value) ? value.filter(Boolean).map((item) => String(item)) : []);

const normalizeHistoryEntry = (row) => ({
  id: row?.id || null,
  bankId: row?.bank_id || null,
  ymd: normalizeYmd(row?.ymd),
  note: typeof row?.note === 'string' ? row.note : '',
  videos: normalizeUrls(row?.video_urls),
  images: normalizeUrls(row?.image_urls),
});

const toList = (value) =>
  String(value || '')
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);

export const fetchBankDayHistory = async ({ bankId, ymd }) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', entry: null };

  const normalizedBankId = String(bankId || '').trim();
  const normalizedYmd = normalizeYmd(ymd);
  if (!normalizedBankId || !normalizedYmd) {
    return { ok: false, error: 'bankId/data ausente.', entry: null };
  }

  const { data, error } = await client
    .from('bank_history')
    .select('id, bank_id, ymd, note, video_urls, image_urls')
    .eq('bank_id', normalizedBankId)
    .eq('ymd', normalizedYmd)
    .maybeSingle();

  if (error) return { ok: false, error: error.message, entry: null };
  return {
    ok: true,
    error: null,
    entry: data ? normalizeHistoryEntry(data) : { id: null, bankId: normalizedBankId, ymd: normalizedYmd, note: '', videos: [], images: [] },
  };
};

export const fetchBankHistoryDays = async ({ bankId, limit = 20 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', entries: [] };

  const normalizedBankId = String(bankId || '').trim();
  if (!normalizedBankId) {
    return { ok: false, error: 'bankId ausente.', entries: [] };
  }

  const { data, error } = await client
    .from('bank_history')
    .select('id, bank_id, ymd, note, video_urls, image_urls')
    .eq('bank_id', normalizedBankId)
    .order('ymd', { ascending: false })
    .limit(Math.max(1, Math.min(100, Number(limit) || 20)));

  if (error) return { ok: false, error: error.message, entries: [] };
  return { ok: true, error: null, entries: Array.isArray(data) ? data.map(normalizeHistoryEntry) : [] };
};

export const adminUpsertBankDayHistory = async ({ bankId, ymd, note, videos, images } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', entry: null };

  const normalizedBankId = String(bankId || '').trim();
  const normalizedYmd = normalizeYmd(ymd);
  if (!normalizedBankId || !normalizedYmd) {
    return { ok: false, error: 'bankId/data ausente.', entry: null };
  }

  const payload = {
    bank_id: normalizedBankId,
    ymd: normalizedYmd,
    note: String(note || '').trim(),
    video_urls: Array.isArray(videos) ? normalizeUrls(videos) : toList(videos),
    image_urls: Array.isArray(images) ? normalizeUrls(images) : toList(images),
  };

  const { data, error } = await client
    .from('bank_history')
    .upsert(payload, { onConflict: 'bank_id,ymd' })
    .select('id, bank_id, ymd, note, video_urls, image_urls')
    .single();

  if (error) return { ok: false, error: error.message, entry: null };
  return { ok: true, error: null, entry: normalizeHistoryEntry(data) };
};

export const uploadBankHistoryAsset = async ({ bankId, ymd, file, kind } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', url: null, path: null };

  const normalizedBankId = String(bankId || '').trim();
  const normalizedYmd = normalizeYmd(ymd);
  const normalizedKind = kind === 'image' ? 'images' : 'videos';
  const fileName = String(file?.name || '').trim();
  if (!normalizedBankId || !normalizedYmd || !fileName) {
    return { ok: false, error: 'Parâmetros de upload ausentes.', url: null, path: null };
  }

  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${normalizedBankId}/${normalizedYmd}/${normalizedKind}/${Date.now()}-${safeFileName}`;
  const uploadRes = await client.storage.from(BANK_HISTORY_BUCKET).upload(path, file, {
    upsert: true,
    contentType: file?.type || undefined,
  });

  if (uploadRes.error) {
    return { ok: false, error: uploadRes.error.message, url: null, path: null };
  }

  const pub = client.storage.from(BANK_HISTORY_BUCKET).getPublicUrl(path);
  return {
    ok: true,
    error: null,
    url: pub?.data?.publicUrl || null,
    path,
  };
};
