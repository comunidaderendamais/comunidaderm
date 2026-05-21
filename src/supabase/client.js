import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfig } from './env.js';
import { cookieStorage } from './cookieStorage.js';

let cachedClient;
let cachedKey;

export const getSupabaseClient = () => {
  const { url, anonKey, isConfigured } = getSupabaseConfig();
  const nextKey = `${url}::${anonKey}`;

  if (!isConfigured) return null;
  if (cachedClient && cachedKey === nextKey) return cachedClient;

  cachedKey = nextKey;
  cachedClient = createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
      storage: cookieStorage,
    },
  });

  return cachedClient;
};

export const hasSupabaseClient = () => Boolean(getSupabaseClient());
