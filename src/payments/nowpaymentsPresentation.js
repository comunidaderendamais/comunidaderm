export const copyText = async (value) => {
  try {
    await navigator.clipboard.writeText(String(value || ''));
    return true;
  } catch {
    return false;
  }
};

const PAYMENT_DETAILS = {
  usdtbsc: { asset: 'USDT', network: 'BEP-20', label: 'USDT (BEP-20)' },
  usdttrc20: { asset: 'USDT', network: 'TRC-20', label: 'USDT (TRC-20)' },
  usdcarb: { asset: 'USDC', network: 'Arbitrum', label: 'USDC (Arbitrum)' },
};

export const getPaymentDetails = (payCurrency) => {
  const key = String(payCurrency || '').trim().toLowerCase();
  if (PAYMENT_DETAILS[key]) return { ...PAYMENT_DETAILS[key], code: key };

  const fallback = String(payCurrency || '').trim();
  return {
    asset: fallback ? fallback.toUpperCase() : '—',
    network: '—',
    label: fallback ? fallback.toUpperCase() : '—',
    code: key,
  };
};

export const buildQrValue = (payment) => {
  const checkoutUrl = String(payment?.checkoutUrl || '').trim();
  if (checkoutUrl) return checkoutUrl;
  return String(payment?.payAddress || '').trim();
};

export const buildCheckoutUrlFromInvoiceId = (invoiceId) => {
  const value = String(invoiceId || '').trim();
  return value ? `https://nowpayments.io/payment/?iid=${encodeURIComponent(value)}` : '';
};

export const normalizeNowpaymentsPayment = (payment) => {
  const current = payment && typeof payment === 'object' ? payment : {};
  const invoiceId = String(current?.invoiceId || current?.invoice_id || '').trim();
  const paymentId = String(current?.paymentId || current?.payment_id || '').trim();
  const orderId = String(current?.orderId || current?.order_id || '').trim();
  const checkoutUrl = String(current?.checkoutUrl || current?.checkout_url || '').trim() || buildCheckoutUrlFromInvoiceId(invoiceId);
  const qrCodeUrl = String(current?.qrCodeUrl || current?.qr_code_url || '').trim();
  const payAddress = String(current?.payAddress || current?.pay_address || '').trim();
  const payCurrency = String(current?.payCurrency || current?.pay_currency || '').trim();
  const paymentStatus = String(current?.paymentStatus || current?.payment_status || '').trim();
  const warnings = Array.isArray(current?.warnings) ? current.warnings : [];

  return {
    ...current,
    paymentId,
    invoiceId,
    orderId,
    checkoutUrl,
    qrCodeUrl,
    payAddress,
    payCurrency,
    paymentStatus,
    warnings,
    payAmount: current?.payAmount ?? current?.pay_amount ?? null,
  };
};

export const getPaymentRows = (payment) => {
  const current = normalizeNowpaymentsPayment(payment);
  const paymentDetails = getPaymentDetails(current?.payCurrency);
  const invoiceId = String(current?.invoiceId || '').trim();
  const orderId = String(current?.orderId || '').trim();

  return [
    {
      label: 'Rede',
      value: paymentDetails.network,
      copy: paymentDetails.network !== '—' ? paymentDetails.network : '',
      section: 'primary',
    },
    {
      label: 'Valor',
      value: current?.payAmount ? `${current.payAmount} ${paymentDetails.asset || ''}`.trim() : '—',
      hint: paymentDetails.network !== '—' ? paymentDetails.label : '',
      copy: current?.payAmount ? String(current.payAmount) : '',
      section: 'primary',
    },
    {
      label: 'Endereço',
      value: current?.payAddress || '—',
      hint: 'Use somente este endereço para enviar o valor exato na rede informada.',
      copy: current?.payAddress || '',
      actionLabel: 'Copiar endereço de pagamento',
      className: 'border-emerald-300 bg-emerald-50',
      valueClassName: 'text-base sm:text-lg font-black text-emerald-900',
      section: 'primary',
    },
    {
      label: 'Ativo',
      value: paymentDetails.asset,
      hint: paymentDetails.code ? `Codigo NOWPayments: ${paymentDetails.code}` : '',
      copy: paymentDetails.asset || '',
      section: 'technical',
    },
    ...(invoiceId ? [{ label: 'Invoice ID', value: invoiceId, copy: invoiceId, section: 'technical' }] : []),
    ...(orderId ? [{ label: 'Order ID', value: orderId, copy: orderId, section: 'technical' }] : []),
    { label: 'Payment ID', value: current?.paymentId || '—', copy: current?.paymentId || '', section: 'technical' },
  ];
};

export const getPaymentSnapshotSummary = (payment) => {
  const current = normalizeNowpaymentsPayment(payment);
  const paymentDetails = getPaymentDetails(current?.payCurrency);

  return {
    asset: paymentDetails.asset || '—',
    network: paymentDetails.network || '—',
    value: current?.payAmount ? `${current.payAmount} ${paymentDetails.asset || ''}`.trim() : '—',
    hasSummary: Boolean(paymentDetails.asset && paymentDetails.asset !== '—') || Boolean(current?.payAmount) || Boolean(paymentDetails.network && paymentDetails.network !== '—'),
  };
};

export const hasHostedCheckoutAvailable = (payment) => {
  const current = normalizeNowpaymentsPayment(payment);
  return Boolean(String(current?.checkoutUrl || '').trim());
};
