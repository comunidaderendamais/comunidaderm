const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'Method Not Allowed' }, 405);

  const apiKey = Deno.env.get('NOWPAYMENTS_API_KEY') || '';
  const base = (Deno.env.get('NOWPAYMENTS_API_BASE') || 'https://api.nowpayments.io/v1').replace(/\/+$/, '');
  if (!apiKey) return json({ ok: false, reason: 'NOWPAYMENTS_API_KEY ausente' }, 500);

  const body = await req.json().catch(() => ({}));
  const paymentId = String((body as any)?.paymentId || '').trim();
  if (!paymentId) return json({ ok: false, reason: 'paymentId ausente' }, 400);

  const res = await fetch(`${base}/payment/${encodeURIComponent(paymentId)}`, {
    method: 'GET',
    headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' },
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) return json({ ok: false, reason: `HTTP ${res.status}`, data }, 502);
  return json({ ok: true, data });
});
