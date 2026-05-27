const cleanString = (value, fallback = '') => {
  const normalized = String(value ?? '').trim();
  return normalized || fallback;
};

export const buildSupabaseMetadata = (user, referrerUsername = null) => ({
  name: cleanString(user?.name),
  username: cleanString(user?.username).toLowerCase(),
  country: cleanString(user?.country, 'Brasil'),
  whatsapp: cleanString(user?.whatsapp),
  referrerUsername: cleanString(referrerUsername ?? user?.referrerUsername),
  source: 'supabase',
});

export const hydrateUserFromSupabaseAuth = ({ authUser, candidateUser = {}, password } = {}) => {
  const meta = authUser?.user_metadata || {};
  const email = cleanString(authUser?.email || candidateUser?.email).toLowerCase();

  return {
    ...candidateUser,
    email,
    password: password ?? candidateUser?.password,
    name: cleanString(meta?.name || candidateUser?.name),
    username: cleanString(meta?.username || candidateUser?.username).toLowerCase(),
    country: cleanString(meta?.country || candidateUser?.country, 'Brasil'),
    whatsapp: cleanString(meta?.whatsapp || candidateUser?.whatsapp),
    referrerUsername: cleanString(meta?.referrerUsername || candidateUser?.referrerUsername) || null,
    supabaseUserId: cleanString(authUser?.id || candidateUser?.supabaseUserId),
    authSource: 'supabase',
    createdAt: cleanString(candidateUser?.createdAt || authUser?.created_at, new Date().toISOString()),
  };
};

export const getSupabaseAuthErrorMessage = (error) => {
  const message = String(error || '').trim().toLowerCase();

  if (!message) return 'Falha ao comunicar com o Supabase.';
  if (message.includes('email not confirmed')) return 'Confirme seu e-mail antes de entrar.';
  if (message.includes('invalid login credentials')) return 'Credenciais inválidas.';
  if (message.includes('user already registered')) return 'Este e-mail já está cadastrado. Faça login.';
  if (message.includes('password should be at least')) return 'A senha não atende aos requisitos mínimos.';
  if (message.includes('supabase não configurado')) return String(error);

  return String(error);
};
