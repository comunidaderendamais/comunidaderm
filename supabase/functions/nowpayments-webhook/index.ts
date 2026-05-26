import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { sendTelegramAlertMessage } from '../_shared/telegram.ts';

const textEncoder = new TextEncoder();

const sortObject = (obj: unknown): unknown => {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  const rec = obj as Record<string, unknown>;
  return Object.keys(rec)
    .sort()
    .reduce((acc, key) => {
      acc[key] = sortObject(rec[key]);
      return acc;
    }, {} as Record<string, unknown>);
};

const toHex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const hmacSha512Hex = async (secret: string, payload: string) => {
  const key = await crypto.subtle.importKey(
    'raw',
    textEncoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, textEncoder.encode(payload));
  return toHex(sig);
};

const normalizeRef = (value: unknown) => String(value ?? '').trim();

const isMetaNotNullConstraintError = (reason: unknown) =>
  /null value in column "meta".*violates not-null constraint/i.test(String(reason || ''));

const buildFallbackRefs = (paymentId: string, invoiceId: string, orderId: string) => {
  const anchor = paymentId || invoiceId || orderId || 'unknown';
  return {
    paymentId: paymentId || `missing-payment:${anchor}`,
    invoiceId: invoiceId || `missing-invoice:${anchor}`,
    orderId: orderId || `missing-order:${anchor}`,
  };
};

const escapeFilterValue = (value: string) =>
  String(value || '')
    .replaceAll('\\', '\\\\')
    .replaceAll(',', '\\,')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');

const normalizeAmount = (value: unknown) => {
  const amount = Number(value || 0);
  return Number.isFinite(amount) ? Math.abs(Number(amount.toFixed(2))) : 0;
};

const lotMatchesRefs = (
  lot: Record<string, unknown>,
  refs: { paymentId: string; invoiceId: string; orderId: string; depositTxId: string }
) => {
  const source = (lot?.source || {}) as Record<string, unknown>;
  const sourcePaymentId = normalizeRef(source?.paymentId);
  const sourceInvoiceId = normalizeRef(source?.invoiceId);
  const sourceOrderId = normalizeRef(source?.orderId);
  const sourceDepositTxId = normalizeRef(source?.depositTxId);

  return (
    (refs.depositTxId && sourceDepositTxId === refs.depositTxId) ||
    (refs.paymentId && sourcePaymentId === refs.paymentId) ||
    (refs.invoiceId && sourceInvoiceId === refs.invoiceId) ||
    (refs.orderId && sourceOrderId === refs.orderId)
  );
};

const findExistingSettlement = async ({
  client,
  paymentId,
  invoiceId,
  orderId,
}: {
  client: ReturnType<typeof createClient>;
  paymentId: string;
  invoiceId: string;
  orderId: string;
}) => {
  const filters: string[] = [];
  if (paymentId) filters.push(`meta->meta->>paymentId.eq.${escapeFilterValue(paymentId)}`);
  if (invoiceId) filters.push(`meta->meta->>invoiceId.eq.${escapeFilterValue(invoiceId)}`);
  if (orderId) filters.push(`meta->meta->>orderId.eq.${escapeFilterValue(orderId)}`);
  if (filters.length === 0) return null;

  const { data: deposits, error: depositsError } = await client
    .from('transactions')
    .select('profile_id, external_id, meta')
    .eq('kind', 'DEPOSITO')
    .or(filters.join(','))
    .limit(5);

  if (depositsError || !Array.isArray(deposits) || deposits.length === 0) return null;

  for (const deposit of deposits) {
    const profileId = normalizeRef(deposit?.profile_id);
    const depositTxId = normalizeRef(deposit?.external_id);
    if (!profileId) continue;

    const { data: profile, error: profileError } = await client
      .from('profiles')
      .select('quota_lots')
      .eq('id', profileId)
      .maybeSingle();

    if (profileError || !profile) continue;

    const lots = Array.isArray(profile?.quota_lots) ? profile.quota_lots : [];
    const existingLot = lots.find((lot) =>
      lotMatchesRefs((lot || {}) as Record<string, unknown>, { paymentId, invoiceId, orderId, depositTxId })
    );

    if (existingLot) {
      return {
        profileId,
        depositTxId,
        lotId: normalizeRef((existingLot as Record<string, unknown>)?.id),
      };
    }
  }

  return null;
};

const findDepositForAlert = async ({
  client,
  paymentId,
  invoiceId,
  orderId,
}: {
  client: ReturnType<typeof createClient>;
  paymentId: string;
  invoiceId: string;
  orderId: string;
}) => {
  const filters: string[] = [];
  if (paymentId) filters.push(`meta->meta->>paymentId.eq.${escapeFilterValue(paymentId)}`);
  if (invoiceId) filters.push(`meta->meta->>invoiceId.eq.${escapeFilterValue(invoiceId)}`);
  if (orderId) filters.push(`meta->meta->>orderId.eq.${escapeFilterValue(orderId)}`);
  if (filters.length === 0) return null;

  const { data, error } = await client
    .from('transactions')
    .select('profile_id, amount_usd, at')
    .eq('kind', 'DEPOSITO')
    .or(filters.join(','))
    .order('at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return {
    profileId: normalizeRef(data.profile_id),
    amountUsd: normalizeAmount(data.amount_usd),
    occurredAt: normalizeRef(data.at),
  };
};

const getAlertUsername = async ({
  client,
  profileId,
}: {
  client: ReturnType<typeof createClient>;
  profileId: string;
}) => {
  if (!profileId) return 'usuario-sem-login';
  const { data, error } = await client.from('profiles').select('username, email').eq('id', profileId).maybeSingle();
  if (error || !data) return profileId;
  return normalizeRef(data.username || data.email || profileId) || 'usuario-sem-login';
};

const shouldSendDepositAlert = (settlement: unknown) => {
  const payload = (settlement || {}) as Record<string, unknown>;
  return Boolean(payload.ok && payload.matched && payload.confirmed && payload.applied);
};

const settleNowpaymentsReference = async ({
  client,
  paymentId,
  invoiceId,
  orderId,
  paymentStatus,
  rawEvent,
}: {
  client: ReturnType<typeof createClient>;
  paymentId: string;
  invoiceId: string;
  orderId: string;
  paymentStatus: string;
  rawEvent: Record<string, unknown>;
}) => {
  const attempt = async (refs: { paymentId: string; invoiceId: string; orderId: string }) =>
    client.rpc('process_nowpayments_reference', {
      payment_id: refs.paymentId,
      invoice_id: refs.invoiceId,
      order_id: refs.orderId,
      payment_status: paymentStatus,
      raw_event: rawEvent,
    });

  const firstTry = await attempt({ paymentId, invoiceId, orderId });
  if (!firstTry.error || !isMetaNotNullConstraintError(firstTry.error.message)) {
    return firstTry.error ? { ok: false, reason: firstTry.error.message } : firstTry.data;
  }

  const fallbackRefs = buildFallbackRefs(paymentId, invoiceId, orderId);
  const secondTry = await attempt(fallbackRefs);
  if (secondTry.error) {
    return { ok: false, reason: secondTry.error.message, recoveredBy: 'reference-fallback' };
  }

  return {
    ...(typeof secondTry.data === 'object' && secondTry.data ? secondTry.data : { ok: true }),
    recoveredBy: 'reference-fallback',
    fallbackRefs,
  };
};

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405 });

  const sig = req.headers.get('x-nowpayments-sig') || '';
  const secret = Deno.env.get('NOWPAYMENTS_IPN_SECRET') || '';
  if (!secret) return new Response(JSON.stringify({ ok: false, reason: 'NOWPAYMENTS_IPN_SECRET ausente' }), { status: 500 });

  const raw = await req.text();
  const parsed = JSON.parse(raw);
  const sorted = sortObject(parsed);
  const payload = JSON.stringify(sorted);
  const localSig = await hmacSha512Hex(secret, payload);

  if (String(sig).toLowerCase() !== String(localSig).toLowerCase()) {
    return new Response(JSON.stringify({ ok: false, reason: 'Assinatura inválida' }), { status: 401 });
  }

  const event = parsed as Record<string, unknown>;
  const paymentId = normalizeRef(event?.payment_id || event?.paymentId);
  const invoiceId = normalizeRef(event?.invoice_id || event?.invoiceId || event?.id);
  const orderId = normalizeRef(event?.order_id || event?.orderId);
  const paymentStatus = normalizeRef(event?.payment_status || event?.paymentStatus || event?.status);

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

  let settlement: unknown = null;
  let telegramAlert: unknown = null;
  if ((paymentId || invoiceId || orderId) && paymentStatus && supabaseUrl && serviceRoleKey) {
    const client = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
    const depositForAlert = await findDepositForAlert({
      client,
      paymentId,
      invoiceId,
      orderId,
    });
    const existingSettlement = await findExistingSettlement({
      client,
      paymentId,
      invoiceId,
      orderId,
    });

    if (existingSettlement) {
      settlement = {
        ok: true,
        matched: true,
        confirmed: true,
        applied: false,
        reason: 'already_applied_edge_guard',
        ...existingSettlement,
      };
    } else {
    settlement = await settleNowpaymentsReference({
      client,
      paymentId,
      invoiceId,
      orderId,
      paymentStatus,
      rawEvent: event,
    });
    }

    if (depositForAlert && shouldSendDepositAlert(settlement)) {
      const username = await getAlertUsername({ client, profileId: depositForAlert.profileId });
      telegramAlert = await sendTelegramAlertMessage({
        eventType: 'deposit_confirmed',
        username,
        amountUsd: depositForAlert.amountUsd,
        occurredAt: depositForAlert.occurredAt || new Date().toISOString(),
      });
    }
  }

  return new Response(JSON.stringify({ ok: true, event: parsed, settlement, telegramAlert }), { headers: { 'Content-Type': 'application/json' } });
});
