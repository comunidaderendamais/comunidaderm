export const copyText = async (value) => {
  try {
    await navigator.clipboard.writeText(String(value || ''));
    return true;
  } catch {
    return false;
  }
};

const PAYMENT_DETAILS = {
  usdtbsc: { asset: 'USDT', network: 'BEP-20' },
  usdttrc20: { asset: 'USDT', network: 'TRC-20' },
  usdcarb: { asset: 'USDC', network: 'Arbitrum' },
};

const getLocalizedAssetLabel = (asset, t) => {
  const value = String(asset || '').trim().toUpperCase();
  if (!value) return '—';
  if (value === 'USDT') return t.nowpaymentsAssetUsdtLabel || 'USDT';
  if (value === 'USDC') return t.nowpaymentsAssetUsdcLabel || 'USDC';
  return value;
};

const getLocalizedNetworkLabel = (network, t) => {
  const value = String(network || '').trim();
  const normalized = value.toUpperCase();
  if (!value) return '—';
  if (normalized === 'BEP-20') return t.nowpaymentsNetworkBep20Label || 'BEP-20';
  if (normalized === 'TRC-20') return t.nowpaymentsNetworkTrc20Label || 'TRC-20';
  if (normalized === 'ARBITRUM') return t.nowpaymentsNetworkArbitrumLabel || 'Arbitrum';
  return value;
};

export const translateNowpaymentsReason = (reason, t) => {
  const text = String(reason || '').trim();
  const normalized = text.toLowerCase();
  if (!text) return '';
  if (/^http\s+\d+$/i.test(text)) return `${t.nowpaymentsHttpErrorLabel}: ${text.replace(/^http\s+/i, '')}`;
  if (normalized === 'timeout') return t.nowpaymentsReasonTimeout;
  if (normalized === 'supabase não configurado.' || normalized === 'supabase nao configurado.') return t.nowpaymentsReasonSupabaseUnavailable;
  if (normalized === 'falha ao criar cobrança.' || normalized === 'falha ao criar cobranca.') return t.nowpaymentsReasonCreateChargeFailed;
  if (normalized === 'paymentid ausente') return t.nowpaymentsReasonPaymentIdMissing;
  if (normalized.includes('nowpayments indisponível') || normalized.includes('nowpayments indisponivel')) return t.nowpaymentsReasonNowpaymentsUnavailable;
  if (normalized === 'nowpayments_api_key ausente') return t.nowpaymentsReasonApiKeyMissing;
  if (normalized === 'amountusd inválido' || normalized === 'amountusd invalido') return t.nowpaymentsReasonInvalidAmount;
  if (normalized === 'orderid ausente') return t.nowpaymentsReasonOrderIdMissing;
  if (normalized === 'moeda/rede não suportada pela integração atual' || normalized === 'moeda/rede nao suportada pela integracao atual') {
    return t.nowpaymentsReasonUnsupportedCurrencyNetwork;
  }
  return text;
};

export const translateNowpaymentsStatus = (status, t) => {
  const text = String(status || '').trim();
  const normalized = text.toLowerCase();
  if (!text) return '—';
  if (normalized === 'waiting' || normalized === 'waiting_payment') return t.nowpaymentsStatusWaiting;
  if (normalized === 'confirming') return t.nowpaymentsStatusConfirming;
  if (normalized === 'confirmed') return t.nowpaymentsStatusConfirmed;
  if (normalized === 'finished') return t.nowpaymentsStatusFinished;
  if (normalized === 'sending') return t.nowpaymentsStatusSending;
  if (normalized === 'partially_paid') return t.nowpaymentsStatusPartiallyPaid;
  if (normalized === 'failed') return t.nowpaymentsStatusFailed;
  if (normalized === 'expired') return t.nowpaymentsStatusExpired;
  if (normalized === 'refunded') return t.nowpaymentsStatusRefunded;
  return text;
};

const getNestedObject = (value) => (value && typeof value === 'object' && !Array.isArray(value) ? value : {});

export const getPersistedNowpaymentsStatus = (transaction) => {
  const tx = getNestedObject(transaction);
  const meta = getNestedObject(tx.meta);
  const nestedMeta = getNestedObject(meta.meta);
  const snapshot = getNestedObject(meta.snapshot);
  const nestedSnapshot = getNestedObject(nestedMeta.snapshot);

  const candidates = [
    tx.paymentStatus,
    tx.payment_status,
    meta.paymentStatus,
    meta.payment_status,
    nestedMeta.paymentStatus,
    nestedMeta.payment_status,
    snapshot.paymentStatus,
    snapshot.payment_status,
    nestedSnapshot.paymentStatus,
    nestedSnapshot.payment_status,
  ];

  const match = candidates.find((value) => String(value || '').trim());
  return String(match || '').trim();
};

export const getTransactionStatusLabel = (transaction, t, fallbackStatusLabel) => {
  const persistedNowpaymentsStatus = getPersistedNowpaymentsStatus(transaction);
  if (persistedNowpaymentsStatus) return translateNowpaymentsStatus(persistedNowpaymentsStatus, t);
  return fallbackStatusLabel(String(transaction?.status || ''), t);
};

export const translateNowpaymentsOperationalMessage = (message, t) => {
  const text = String(message || '').trim();
  const normalized = text.toLowerCase();
  if (!text) return t.nowpaymentsUnknownError;
  if (normalized === 'referência de cobrança ausente.' || normalized === 'referencia de cobranca ausente.') {
    return t.nowpaymentsReferenceMissing;
  }
  if (normalized === 'erro') return t.nowpaymentsUnknownError;
  return translateNowpaymentsReason(text, t);
};

export const getPaymentWarningMessages = (warnings, t) => {
  const list = Array.isArray(warnings) ? warnings : [];
  return list
    .map((warning) => {
      const stage = String(warning?.stage || '').trim().toLowerCase();
      const stageLabel =
        stage === 'invoice'
          ? t.nowpaymentsWarningStageInvoice
          : stage === 'payment'
            ? t.nowpaymentsWarningStagePayment
            : t.nowpaymentsWarningStageGeneral;
      const reasonLabel = translateNowpaymentsReason(warning?.reason, t);
      return reasonLabel ? `${stageLabel}: ${reasonLabel}` : stageLabel;
    })
    .filter(Boolean);
};

export const getPaymentDetails = (payCurrency, t) => {
  const key = String(payCurrency || '').trim().toLowerCase();
  if (PAYMENT_DETAILS[key]) {
    const details = PAYMENT_DETAILS[key];
    const assetLabel = getLocalizedAssetLabel(details.asset, t);
    const networkLabel = getLocalizedNetworkLabel(details.network, t);
    return {
      ...details,
      assetLabel,
      networkLabel,
      label: `${assetLabel} (${networkLabel})`,
      code: key,
    };
  }

  const fallback = String(payCurrency || '').trim();
  const assetLabel = getLocalizedAssetLabel(fallback, t);
  return {
    asset: fallback ? fallback.toUpperCase() : '—',
    assetLabel,
    network: '—',
    networkLabel: '—',
    label: assetLabel,
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

export const getPaymentRows = (payment, t) => {
  const current = normalizeNowpaymentsPayment(payment);
  const paymentDetails = getPaymentDetails(current?.payCurrency, t);
  const invoiceId = String(current?.invoiceId || '').trim();
  const orderId = String(current?.orderId || '').trim();

  return [
    {
      key: 'network',
      label: t.walletPaymentNetworkLabel,
      value: paymentDetails.networkLabel,
      copy: paymentDetails.network !== '—' ? paymentDetails.network : '',
      copyKind: 'default',
      section: 'primary',
    },
    {
      key: 'amount',
      label: t.walletPaymentValueShortLabel,
      value: current?.payAmount ? `${current.payAmount} ${paymentDetails.assetLabel || paymentDetails.asset || ''}`.trim() : '—',
      hint: paymentDetails.network !== '—' ? paymentDetails.label : '',
      copy: current?.payAmount ? String(current.payAmount) : '',
      copyKind: 'default',
      section: 'primary',
    },
    {
      key: 'address',
      label: t.nowpaymentsAddressLabel,
      value: current?.payAddress || '—',
      hint: t.nowpaymentsAddressHint,
      copy: current?.payAddress || '',
      copyKind: 'paymentAddress',
      className: 'border-emerald-300 bg-emerald-50',
      valueClassName: 'text-base sm:text-lg font-black text-emerald-900',
      section: 'primary',
    },
    {
      key: 'asset',
      label: t.walletPaymentAssetLabel,
      value: paymentDetails.assetLabel,
      hint: paymentDetails.code ? `${t.nowpaymentsCodeHintLabel}: ${paymentDetails.code}` : '',
      copy: paymentDetails.asset || '',
      copyKind: 'default',
      section: 'technical',
    },
    ...(invoiceId ? [{ key: 'invoiceId', label: t.nowpaymentsInvoiceIdLabel, value: invoiceId, copy: invoiceId, copyKind: 'default', section: 'technical' }] : []),
    ...(orderId ? [{ key: 'orderId', label: t.nowpaymentsOrderIdLabel, value: orderId, copy: orderId, copyKind: 'default', section: 'technical' }] : []),
    {
      key: 'paymentId',
      label: t.nowpaymentsPaymentIdLabel,
      value: current?.paymentId || '—',
      copy: current?.paymentId || '',
      copyKind: 'default',
      section: 'technical',
    },
  ];
};

export const getPaymentSnapshotSummary = (payment) => {
  const current = normalizeNowpaymentsPayment(payment);
  const paymentDetails = getPaymentDetails(current?.payCurrency, {
    nowpaymentsAssetUsdtLabel: 'USDT',
    nowpaymentsAssetUsdcLabel: 'USDC',
    nowpaymentsNetworkBep20Label: 'BEP-20',
    nowpaymentsNetworkTrc20Label: 'TRC-20',
    nowpaymentsNetworkArbitrumLabel: 'Arbitrum',
  });

  return {
    asset: paymentDetails.assetLabel || paymentDetails.asset || '—',
    network: paymentDetails.networkLabel || paymentDetails.network || '—',
    value: current?.payAmount ? `${current.payAmount} ${paymentDetails.assetLabel || paymentDetails.asset || ''}`.trim() : '—',
    hasSummary: Boolean(paymentDetails.asset && paymentDetails.asset !== '—') || Boolean(current?.payAmount) || Boolean(paymentDetails.network && paymentDetails.network !== '—'),
  };
};

export const hasHostedCheckoutAvailable = (payment) => {
  const current = normalizeNowpaymentsPayment(payment);
  return Boolean(String(current?.checkoutUrl || '').trim());
};
