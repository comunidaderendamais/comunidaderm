const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const mapCurrency = (assetRaw: string, networkRaw: string) => {
  const asset = String(assetRaw || '').trim().toUpperCase();
  const network = String(networkRaw || '').trim().toUpperCase();

  if (asset === 'USDT' && network === 'TRC20') return 'USDTTRC20';
  if (asset === 'USDT' && network === 'BEP20') return 'USDTBSC';
  if (asset === 'USDC' && network === 'ARBITRUM') return 'USDCARB';
  return '';
};

const getReturnBaseUrl = (req: Request) => {
  const origin = String(req.headers.get('origin') || '').trim();
  if (origin) return origin.replace(/\/+$/, '');
  const referer = String(req.headers.get('referer') || '').trim();
  if (!referer) return '';
  try {
    const url = new URL(referer);
    return `${url.protocol}//${url.host}`;
  } catch {
    return '';
  }
};

const getInvoiceUrl = (data: Record<string, unknown> | null) =>
  String(
    data?.invoice_url ||
    data?.invoiceUrl ||
    data?.checkout_url ||
    data?.checkoutUrl ||
    data?.payment_url ||
    data?.paymentUrl ||
    data?.url ||
    ''
  ).trim();

const getQrCodeUrl = (data: Record<string, unknown> | null) =>
  String(
    data?.qr_code_url ||
    data?.qrCodeUrl ||
    data?.qrcode_url ||
    data?.qrcodeUrl ||
    ''
  ).trim();

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ ok: false, reason: 'Method Not Allowed' }, 405);

  const apiKey = Deno.env.get('NOWPAYMENTS_API_KEY') || '';
  const base = (Deno.env.get('NOWPAYMENTS_API_BASE') || 'https://api.nowpayments.io/v1').replace(/\/+$/, '');
  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/+$/, '');
  const explicitWebhookUrl = (Deno.env.get('NOWPAYMENTS_IPN_CALLBACK_URL') || '').trim();
  if (!apiKey) return json({ ok: false, reason: 'NOWPAYMENTS_API_KEY ausente' }, 500);

  const body = await req.json().catch(() => ({} as Record<string, unknown>));
  const amountUsd = Number((body as any)?.amountUsd || 0);
  const asset = String((body as any)?.asset || '').trim();
  const network = String((body as any)?.network || '').trim();
  const orderId = String((body as any)?.orderId || '').trim();
  const orderDescription = String((body as any)?.orderDescription || '').trim();

  if (!Number.isFinite(amountUsd) || amountUsd <= 0) return json({ ok: false, reason: 'amountUsd inválido' }, 400);
  if (!orderId) return json({ ok: false, reason: 'orderId ausente' }, 400);

  const payCurrency = mapCurrency(asset, network);
  if (!payCurrency) return json({ ok: false, reason: 'Moeda/rede não suportada pela integração atual' }, 400);

  const ipnCallbackUrl = explicitWebhookUrl || (supabaseUrl ? `${supabaseUrl}/functions/v1/nowpayments-webhook` : '');
  const returnBaseUrl = getReturnBaseUrl(req);
  const successUrl = returnBaseUrl ? `${returnBaseUrl}/?np=success&orderId=${encodeURIComponent(orderId)}` : '';
  const cancelUrl = returnBaseUrl ? `${returnBaseUrl}/?np=cancel&orderId=${encodeURIComponent(orderId)}` : '';

  let invoiceData: Record<string, unknown> | null = null;
  let invoiceError: unknown = null;
  try {
    const invoicePayload = {
      price_amount: Number(amountUsd.toFixed(2)),
      price_currency: 'usd',
      pay_currency: payCurrency.toLowerCase(),
      order_id: orderId,
      order_description: orderDescription || orderId,
      ipn_callback_url: ipnCallbackUrl || undefined,
      success_url: successUrl || undefined,
      cancel_url: cancelUrl || undefined,
      is_fixed_rate: true,
    };

    const invoiceRes = await fetch(`${base}/invoice`, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(invoicePayload),
    });

    invoiceData = await invoiceRes.json().catch(() => null);
    if (!invoiceRes.ok) {
      invoiceError = { reason: `HTTP ${invoiceRes.status}`, data: invoiceData };
      invoiceData = null;
    }
  } catch (err) {
    invoiceError = { reason: String((err as Error)?.message || err) };
    invoiceData = null;
  }

  const payload = {
    price_amount: Number(amountUsd.toFixed(2)),
    price_currency: 'usd',
    pay_currency: payCurrency.toLowerCase(),
    order_id: orderId,
    order_description: orderDescription || orderId,
    ipn_callback_url: ipnCallbackUrl || undefined,
  };

  const res = await fetch(`${base}/payment`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok && !invoiceData) return json({ ok: false, reason: `HTTP ${res.status}`, data }, 502);

  const paymentId = String((data as any)?.payment_id || (data as any)?.paymentId || '').trim();
  const flowMode = invoiceData ? (paymentId ? 'INVOICE_PLUS_PAYMENT' : 'INVOICE_ONLY') : 'DIRECT_PAYMENT';
  const warnings = [
    ...(invoiceError ? [{ stage: 'invoice', ...((invoiceError as Record<string, unknown>) || {}) }] : []),
    ...(!res.ok && invoiceData ? [{ stage: 'payment', reason: `HTTP ${res.status}`, data }] : []),
  ];

  return json({
    ok: true,
    data: {
      paymentId,
      paymentStatus: String((data as any)?.payment_status || (data as any)?.paymentStatus || (data as any)?.status || ''),
      payAddress: (data as any)?.pay_address || (data as any)?.payAddress || '',
      payAmount: (data as any)?.pay_amount || (data as any)?.payAmount || null,
      payCurrency: (data as any)?.pay_currency || (data as any)?.payCurrency || payCurrency,
      priceAmount: (data as any)?.price_amount || (data as any)?.priceAmount || Number(amountUsd.toFixed(2)),
      priceCurrency: (data as any)?.price_currency || (data as any)?.priceCurrency || 'usd',
      orderId,
      invoiceId: String((invoiceData as any)?.id || (invoiceData as any)?.invoice_id || (invoiceData as any)?.invoiceId || ''),
      checkoutUrl: getInvoiceUrl(invoiceData) || getInvoiceUrl(data as Record<string, unknown> | null),
      qrCodeUrl: getQrCodeUrl(invoiceData) || getQrCodeUrl(data as Record<string, unknown> | null),
      invoiceStatus: String((invoiceData as any)?.payment_status || (invoiceData as any)?.status || ''),
      flowMode,
      returnUrls: {
        successUrl,
        cancelUrl,
      },
      warnings,
      raw: data,
      invoiceRaw: invoiceData,
    },
  });
});
