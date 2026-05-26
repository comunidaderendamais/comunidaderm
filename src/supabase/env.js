const getEnv = (key, fallback = '') => {
  try {
    const value = import.meta.env[key];
    return String(value ?? fallback).trim();
  } catch {
    return String(fallback).trim();
  }
};

export const getSupabaseConfig = () => {
  const url = getEnv('VITE_SUPABASE_URL').replace(/\/+$/, '');
  const anonKey = getEnv('VITE_SUPABASE_ANON_KEY');

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
};

export const getSupabaseMissingEnv = () => {
  const missing = [];
  const { url, anonKey } = getSupabaseConfig();

  if (!url) missing.push('VITE_SUPABASE_URL');
  if (!anonKey) missing.push('VITE_SUPABASE_ANON_KEY');

  return missing;
};
