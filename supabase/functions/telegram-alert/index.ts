import { sendTelegramAlertMessage } from '../_shared/telegram.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const normalizeAmount = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Number(amount.toFixed(2)) : 0;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'Method Not Allowed' }, 405);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const eventType = String(body?.eventType || '').trim();
  const username = String(body?.username || '').trim();
  const amountUsd = normalizeAmount(body?.amountUsd);
  const occurredAt = body?.occurredAt ? String(body.occurredAt).trim() : null;

  if (eventType !== 'deposit_confirmed' && eventType !== 'withdraw_requested') {
    return json({ ok: false, reason: 'eventType inválido' }, 400);
  }

  if (!username) return json({ ok: false, reason: 'username ausente' }, 400);
  if (amountUsd <= 0) return json({ ok: false, reason: 'amountUsd inválido' }, 400);

  const result = await sendTelegramAlertMessage({
    eventType,
    username,
    amountUsd,
    occurredAt,
  });

  if (!result.ok) return json(result, 502);
  return json({ ok: true });
});
