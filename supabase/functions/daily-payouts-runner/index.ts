import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const getBearerToken = (value: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.toLowerCase().startsWith('bearer ')) return raw.slice(7).trim();
  return raw;
};

const normalizeTriggerSource = (value: unknown) => {
  const raw = String(value || '').trim().toUpperCase();
  if (raw === 'ADMIN_BUTTON' || raw === 'MANUAL_REPLAY' || raw === 'CRON') return raw;
  return 'TOKEN';
};

const isAdminEmail = (email: string) => String(email || '').trim().toLowerCase() === 'comunidaderendamais@gmail.com';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ ok: false, reason: 'Method Not Allowed' }, 405);

  const supabaseUrl = String(Deno.env.get('SUPABASE_URL') || '').trim();
  const serviceRoleKey = String(Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '').trim();
  if (!supabaseUrl || !serviceRoleKey) return json({ ok: false, reason: 'SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes' }, 500);

  const expectedToken = String(Deno.env.get('DAILY_PAYOUT_RUNNER_TOKEN') || '').trim();
  if (!expectedToken) return json({ ok: false, reason: 'DAILY_PAYOUT_RUNNER_TOKEN ausente' }, 500);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const runAt = body?.runAt ? String(body.runAt).trim() : new Date().toISOString();
  const requestedSource = normalizeTriggerSource(body?.triggerSource);

  const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
  const authHeader = req.headers.get('authorization');
  const providedToken = getBearerToken(authHeader) || String(req.headers.get('x-runner-token') || '').trim();

  let triggerSource = requestedSource;
  let actorId: string | null = null;
  let actorEmail: string | null = null;

  if (providedToken === expectedToken) {
    triggerSource = requestedSource === 'TOKEN' ? 'CRON' : requestedSource;
  } else {
    const jwt = getBearerToken(authHeader);
    if (!jwt) return json({ ok: false, reason: 'unauthorized' }, 401);

    const { data: userData, error: userError } = await client.auth.getUser(jwt);
    if (userError || !userData?.user) return json({ ok: false, reason: 'unauthorized' }, 401);

    actorId = String(userData.user.id || '').trim() || null;
    actorEmail = String(userData.user.email || '').trim() || null;

    const { data: profile, error: profileError } = actorId
      ? await client.from('profiles').select('is_admin, email').eq('id', actorId).maybeSingle()
      : { data: null, error: null };

    const canRun = Boolean(profile?.is_admin) || isAdminEmail(actorEmail || '') || isAdminEmail(String(profile?.email || ''));
    if (profileError || !canRun) return json({ ok: false, reason: 'not_admin' }, 403);

    triggerSource = requestedSource === 'TOKEN' ? 'ADMIN_BUTTON' : requestedSource;
  }

  const { data, error } = await client.rpc('run_daily_payouts_with_audit', {
    run_at: runAt,
    trigger_source_value: triggerSource,
    actor_id_value: actorId,
    actor_email_value: actorEmail,
    request_payload_value: {
      source: triggerSource,
      requestedAt: new Date().toISOString(),
      targetDay: body?.targetDay ? String(body.targetDay).trim() : null,
    },
  });
  if (error) return json({ ok: false, reason: error.message }, 500);

  return json({ ok: true, runAt, triggerSource, audit: data, result: data?.result || null });
});
