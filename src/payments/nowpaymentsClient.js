const getEnv = (key, fallback = '') => {
  try {
    const v = import.meta?.env?.[key];
    return String(v ?? fallback);
  } catch {
    return String(fallback);
  }
};

export const NOWPAYMENTS_DEFAULT_BASE = 'https://api.nowpayments.io/v1';

export const fetchNowpaymentStatus = async ({ paymentId }) => {
  const id = String(paymentId || '').trim();
  if (!id) return { ok: false, reason: 'paymentId ausente' };

  const apiKey = getEnv('VITE_NOWPAYMENTS_API_KEY');
  if (!apiKey) return { ok: false, reason: 'VITE_NOWPAYMENTS_API_KEY não configurada' };

  const base = getEnv('VITE_NOWPAYMENTS_API_BASE', NOWPAYMENTS_DEFAULT_BASE).replace(/\/+$/, '');

  try {
    const res = await fetch(`${base}/payment/${encodeURIComponent(id)}`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
      },
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return { ok: false, reason: `HTTP ${res.status}`, data };
    }
    const status = String(data?.payment_status || data?.paymentStatus || data?.status || '').trim();
    return { ok: true, status, data };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
};

