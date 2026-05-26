import { getSupabaseClient } from '../supabase/client.js';

const getEnv = (key, fallback = '') => {
  try {
    const v = import.meta.env[key];
    return String(v ?? fallback);
  } catch {
    return String(fallback);
  }
};

export const NOWPAYMENTS_DEFAULT_BASE = 'https://api.nowpayments.io/v1';

const withTimeout = async (promise, ms) => {
  let id = null;
  try {
    const timeout = new Promise((_, reject) => {
      id = setTimeout(() => reject(new Error('Timeout')), ms);
    });
    return await Promise.race([promise, timeout]);
  } finally {
    if (id) clearTimeout(id);
  }
};

export const createNowpaymentPayment = async ({ amountUsd, asset, network, orderId, orderDescription } = {}) => {
  try {
    const client = getSupabaseClient();
    if (!client) return { ok: false, reason: 'Supabase não configurado.' };

    const { data, error } = await withTimeout(
      client.functions.invoke('nowpayments-create-payment', {
        body: {
          amountUsd,
          asset,
          network,
          orderId,
          orderDescription,
        },
      }),
      20000
    );

    if (error || !data?.ok) {
      return { ok: false, reason: error?.message || data?.reason || 'Falha ao criar cobrança.' };
    }

    return { ok: true, data: data.data || null };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
};

export const fetchNowpaymentStatus = async ({ paymentId }) => {
  const id = String(paymentId || '').trim();
  if (!id) return { ok: false, reason: 'paymentId ausente' };

  try {
    const client = getSupabaseClient();
    if (client) {
      const { data, error } = await withTimeout(client.functions.invoke('nowpayments-payment-status', { body: { paymentId: id } }), 15000);
      if (!error && data?.ok) {
        const status = String(data?.data?.payment_status || data?.data?.paymentStatus || data?.data?.status || '').trim();
        return { ok: true, status, data: data?.data || null };
      }
    }

    const apiKey = getEnv('VITE_NOWPAYMENTS_API_KEY');
    if (!apiKey) return { ok: false, reason: 'NOWPayments indisponível (sem função e sem VITE_NOWPAYMENTS_API_KEY)' };

    const base = getEnv('VITE_NOWPAYMENTS_API_BASE', NOWPAYMENTS_DEFAULT_BASE).replace(/\/+$/, '');
    const res = await fetch(`${base}/payment/${encodeURIComponent(id)}`, { method: 'GET', headers: { 'x-api-key': apiKey, 'Content-Type': 'application/json' } });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}`, data };
    const status = String(data?.payment_status || data?.paymentStatus || data?.status || '').trim();
    return { ok: true, status, data };
  } catch (err) {
    return { ok: false, reason: String(err?.message || err) };
  }
};
