import { normalizeLang } from '../shared/lang.js';

const normalizeFlow = (value) => {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  if (raw === 'recovery' || raw === 'reset' || raw === 'reset_password') return 'recovery';
  if (raw === 'signup' || raw === 'confirm' || raw === 'confirm_signup' || raw === 'email') return 'signup';
  return raw;
};

const getHashParams = (hash = '') => new URLSearchParams(String(hash || '').replace(/^#/, ''));

export const getAuthActionPageUrl = ({ lang = 'pt', flow = '' } = {}) => {
  const origin = String(window.location.origin || '').replace(/\/+$/, '');
  const url = new URL(`${origin}/auth/`);
  const normalizedFlow = normalizeFlow(flow);
  const normalizedLang = normalizeLang(lang);

  if (normalizedFlow) url.searchParams.set('flow', normalizedFlow);
  if (normalizedLang) url.searchParams.set('lang', normalizedLang);
  return url.toString();
};

export const readAuthCallbackContext = (href = '') => {
  const current = String(href || window.location.href || '');
  const url = new URL(current);
  const hashParams = getHashParams(url.hash);

  const flow = normalizeFlow(url.searchParams.get('flow') || hashParams.get('flow'));
  const type = normalizeFlow(url.searchParams.get('type') || hashParams.get('type'));
  const code = String(url.searchParams.get('code') || hashParams.get('code') || '').trim();
  const tokenHash = String(url.searchParams.get('token_hash') || hashParams.get('token_hash') || '').trim();
  const accessToken = String(hashParams.get('access_token') || url.searchParams.get('access_token') || '').trim();
  const refreshToken = String(hashParams.get('refresh_token') || url.searchParams.get('refresh_token') || '').trim();
  const lang = String(url.searchParams.get('lang') || hashParams.get('lang') || '').trim();

  return {
    flow: flow || type || '',
    type,
    code,
    tokenHash,
    lang,
    hasTokens: Boolean(code || tokenHash || accessToken || refreshToken),
  };
};

export const cleanupAuthCallbackUrl = (href = '') => {
  const current = String(href || window.location.href || '');
  const url = new URL(current);
  const ctx = readAuthCallbackContext(current);
  const clean = new URL(`${url.origin}/auth/`);

  if (ctx.flow) clean.searchParams.set('flow', ctx.flow);
  if (ctx.lang) clean.searchParams.set('lang', normalizeLang(ctx.lang));

  window.history.replaceState({}, document.title, `${clean.pathname}${clean.search}`);
  return ctx;
};
