import { getSupabaseClient } from './client.js';

export const sendTelegramAlert = async ({ eventType, username, amountUsd, occurredAt } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, reason: 'Supabase não configurado.' };

  const { data, error } = await client.functions.invoke('telegram-alert', {
    body: {
      eventType: String(eventType || '').trim(),
      username: String(username || '').trim(),
      amountUsd: Number(amountUsd || 0),
      occurredAt: occurredAt ? String(occurredAt).trim() : null,
    },
  });

  if (error || !data?.ok) {
    return { ok: false, reason: error?.message || data?.reason || 'Falha ao enviar alerta ao Telegram.' };
  }

  return { ok: true };
};
