import { getSupabaseClient } from './client.js';
import { getSupabaseMissingEnv } from './env.js';
import { getAuthActionPageUrl } from './authRedirect.js';

const getClientOrError = () => {
  const client = getSupabaseClient();
  if (client) return { client, error: null };

  const missing = getSupabaseMissingEnv();
  return {
    client: null,
    error: `Supabase não configurado: ${missing.join(', ')}`,
  };
};

export const signUpWithSupabase = async ({ email, password, metadata = {}, emailRedirectTo = '' }) => {
  const { client, error } = getClientOrError();
  if (!client) return { ok: false, error };

  const { data, error: authError } = await client.auth.signUp({
    email,
    password,
    options: {
      data: metadata,
      emailRedirectTo: String(emailRedirectTo || '').trim() || getAuthActionPageUrl({ lang: metadata?.lang || 'pt', flow: 'signup' }),
    },
  });

  return {
    ok: !authError,
    data,
    error: authError?.message || null,
  };
};

export const signInWithSupabase = async ({ email, password }) => {
  const { client, error } = getClientOrError();
  if (!client) return { ok: false, error };

  const { data, error: authError } = await client.auth.signInWithPassword({
    email,
    password,
  });

  return {
    ok: !authError,
    data,
    error: authError?.message || null,
  };
};

export const signOutFromSupabase = async () => {
  const { client, error } = getClientOrError();
  if (!client) return { ok: false, error };

  const { error: authError } = await client.auth.signOut();

  return {
    ok: !authError,
    error: authError?.message || null,
  };
};

export const sendPasswordResetEmail = async ({ email, redirectTo = '' } = {}) => {
  const { client, error } = getClientOrError();
  if (!client) return { ok: false, error };

  const { data, error: authError } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: String(redirectTo || '').trim() || getAuthActionPageUrl({ flow: 'recovery' }),
  });

  return {
    ok: !authError,
    data,
    error: authError?.message || null,
  };
};

export const updateSupabasePassword = async ({ password } = {}) => {
  const { client, error } = getClientOrError();
  if (!client) return { ok: false, error };

  const { data, error: authError } = await client.auth.updateUser({ password });

  return {
    ok: !authError,
    data,
    error: authError?.message || null,
  };
};

export const exchangeCodeForSupabaseSession = async ({ code } = {}) => {
  const { client, error } = getClientOrError();
  if (!client) return { ok: false, error, session: null };

  const currentCode = String(code || '').trim();
  if (!currentCode) return { ok: false, error: 'Código de autenticação ausente.', session: null };

  const { data, error: authError } = await client.auth.exchangeCodeForSession(currentCode);

  return {
    ok: !authError,
    session: data?.session || null,
    error: authError?.message || null,
  };
};

export const getSupabaseSession = async () => {
  const { client, error } = getClientOrError();
  if (!client) return { ok: false, error, session: null };

  const { data, error: authError } = await client.auth.getSession();

  return {
    ok: !authError,
    session: data?.session || null,
    error: authError?.message || null,
  };
};
