import { getSupabaseClient } from './client.js';

const normalizeWallets = (wallets) => ({
  usdtBep20: String(wallets?.usdtBep20 || ''),
  usdtTrc20: String(wallets?.usdtTrc20 || ''),
  usdcArbitrum: String(wallets?.usdcArbitrum || ''),
});

export const saveMyWallets = async (wallets) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user?.id) return { ok: false, error: authError?.message || 'Sessão inválida.' };

  const profileId = authData.user.id;
  const w = normalizeWallets(wallets);

  const { error } = await client
    .from('wallets')
    .upsert(
      {
        profile_id: profileId,
        usdt_bep20: w.usdtBep20 || null,
        usdt_trc20: w.usdtTrc20 || null,
        usdc_arbitrum: w.usdcArbitrum || null,
      },
      { onConflict: 'profile_id' }
    );

  if (error) return { ok: false, error: error.message };
  return { ok: true };
};

export const loadMyProfileAndWallets = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', profile: null, wallets: null };

  const { data: authData, error: authError } = await client.auth.getUser();
  if (authError || !authData?.user?.id) {
    return { ok: false, error: authError?.message || 'Sessão inválida.', profile: null, wallets: null };
  }

  const profileId = authData.user.id;

  const { data: profile, error: profileError } = await client
    .from('profiles')
    .select('id,email,username,name,country,whatsapp,referrer_username,balances,holdings,team_state,rank_key,is_admin')
    .eq('id', profileId)
    .maybeSingle();

  if (profileError) return { ok: false, error: profileError.message, profile: null, wallets: null };

  const { data: wallets, error: walletError } = await client
    .from('wallets')
    .select('profile_id,usdt_bep20,usdt_trc20,usdc_arbitrum')
    .eq('profile_id', profileId)
    .maybeSingle();

  if (walletError) return { ok: false, error: walletError.message, profile, wallets: null };

  return { ok: true, error: null, profile, wallets };
};

