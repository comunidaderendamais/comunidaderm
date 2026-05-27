import { getSupabaseClient } from './client.js';

const safeNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const mapProfileRowToUser = (p) => ({
  id: p?.id || null,
  uuid: p?.id || null,
  userId: p?.user_id || null,
  email: p?.email || null,
  username: p?.username || null,
  name: p?.name || null,
  referrerUsername: p?.referrer_username || null,
  sponsorId: p?.sponsor_id || null,
  sponsorEmail: p?.sponsor_email || null,
  sponsorName: p?.sponsor_name || null,
  hasSponsor: Boolean(p?.has_sponsor),
  isAdmin: Boolean(p?.is_admin),
  blocked: Boolean(p?.blocked),
  createdAt: p?.created_at || null,
  updatedAt: p?.updated_at || null,
  balances: p?.balances || {},
  holdings: p?.holdings || {},
  teamState: p?.team_state || {},
  quotaLots: Array.isArray(p?.quota_lots) ? p.quota_lots : [],
  elite: p?.elite || {},
  rankKey: p?.rank_key || null,
});

const mapTxRowToTx = (row) => {
  const meta = row?.meta || {};
  return {
    id: String(row?.external_id || meta?.id || row?.id || ''),
    at: String(meta?.at || row?.at || row?.created_at || new Date().toISOString()),
    kind: String(row?.kind || meta?.kind || ''),
    type: String(row?.type || meta?.type || ''),
    amount: safeNum(meta?.amount ?? row?.amount_usd ?? 0),
    payment: row?.payment || meta?.payment || null,
    status: row?.status || meta?.status || null,
    meta,
  };
};

const mapSponsorRow = (row) => {
  if (!row || typeof row !== 'object') return null;
  return {
    id: row?.id || null,
    userId: row?.user_id || null,
    username: row?.username || null,
    email: row?.email || null,
    name: row?.name || null,
  };
};

const mapSponsorLogRow = (row) => ({
  id: row?.id || null,
  profileId: row?.profile_id || null,
  previousSponsorId: row?.previous_sponsor_id || null,
  previousSponsorUsername: row?.previous_sponsor_username || null,
  previousSponsorEmail: row?.previous_sponsor_email || null,
  nextSponsorId: row?.next_sponsor_id || null,
  nextSponsorUsername: row?.next_sponsor_username || null,
  nextSponsorEmail: row?.next_sponsor_email || null,
  actorId: row?.actor_id || null,
  actorEmail: row?.actor_email || null,
  reason: row?.reason || '',
  source: row?.source || null,
  requestPayload: row?.request_payload || {},
  resultPayload: row?.result_payload || {},
  createdAt: row?.created_at || null,
});

export const adminSearchUsers = async ({
  q = '',
  maxRows = 50,
  withoutSponsorOnly = false,
  onlyWithSponsor = false,
  withInvestmentOnly = false,
} = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', users: [] };

  const newParams = {
    q,
    max_rows: maxRows,
    without_sponsor_only: Boolean(withoutSponsorOnly),
    only_with_sponsor: Boolean(onlyWithSponsor),
    with_investment_only: Boolean(withInvestmentOnly),
  };

  let { data, error } = await client.rpc('admin_search_users', newParams);

  // Backward compatibility: if the remote Supabase still has the old 2-arg RPC,
  // retry with the previous signature so the Admin list keeps loading.
  if (error) {
    const message = String(error?.message || '').toLowerCase();
    const missingNewSignature =
      message.includes('admin_search_users') &&
      (message.includes('does not exist') || message.includes('function') || message.includes('schema cache'));

    if (missingNewSignature) {
      const fallback = await client.rpc('admin_search_users', {
        q,
        max_rows: maxRows,
      });
      data = fallback.data;
      error = fallback.error;
    }
  }

  if (error) return { ok: false, error: error.message, users: [] };

  const rows = Array.isArray(data) ? data : [];
  return { ok: true, error: null, users: rows.map(mapProfileRowToUser) };
};

export const adminGetUserState = async ({ userId, maxTransactions = 500 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', user: null };
  if (!userId) return { ok: false, error: 'Usuário inválido.', user: null };

  const { data, error } = await client.rpc('admin_get_user_state', { target_id: userId, max_transactions: maxTransactions });
  if (error) return { ok: false, error: error.message, user: null };

  const profile = data?.profile || null;
  const wallets = data?.wallets || null;
  const txs = Array.isArray(data?.transactions) ? data.transactions : [];

  const user = {
    ...mapProfileRowToUser(profile),
    wallets: {
      usdtBep20: String(wallets?.usdt_bep20 || ''),
      usdtTrc20: String(wallets?.usdt_trc20 || ''),
      usdcArbitrum: String(wallets?.usdc_arbitrum || ''),
    },
    transactions: txs.map(mapTxRowToTx),
    sponsor: mapSponsorRow(data?.sponsor || null),
    sponsorLogs: Array.isArray(data?.sponsorLogs) ? data.sponsorLogs.map(mapSponsorLogRow) : [],
  };

  return { ok: true, error: null, user };
};

export const adminUpsertUserState = async ({ userId, user }) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };
  if (!userId) return { ok: false, error: 'Usuário inválido.' };

  const payload = {
    user_id: user?.userId || null,
    rank_key: user?.rankKey || null,
    balances: user?.balances || {},
    holdings: user?.holdings || {},
    quota_lots: Array.isArray(user?.quotaLots) ? user.quotaLots : [],
    team_state: user?.teamState || {},
    elite: user?.elite || {},
    blocked: Boolean(user?.blocked),
  };

  const { error } = await client.rpc('admin_upsert_user_state', { target_id: userId, payload });
  if (error) return { ok: false, error: error.message };

  const txs = Array.isArray(user?.transactions) ? user.transactions : [];
  const { error: txError } = await client.rpc('admin_upsert_user_transactions', { target_id: userId, items: txs.slice(-500) });
  if (txError) return { ok: false, error: txError.message };

  return { ok: true, error: null };
};

export const adminSetBlocked = async ({ userId, blocked }) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };
  if (!userId) return { ok: false, error: 'Usuário inválido.' };

  const { error } = await client.rpc('admin_set_blocked', { target_id: userId, blocked_value: Boolean(blocked) });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null };
};

export const adminGrantSponsorship = async ({ userId, planKey, units = 1, note } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };
  if (!userId) return { ok: false, error: 'Usuário inválido.', data: null };

  const { data, error } = await client.rpc('admin_grant_sponsorship', {
    target_id: userId,
    plan_key_value: String(planKey || '').trim(),
    units_value: Math.max(1, Math.floor(safeNum(units || 1))),
    note_value: note ? String(note) : null,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const adminReassignUserSponsor = async ({ userId, sponsorId, reason } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };
  if (!userId) return { ok: false, error: 'Usuário inválido.', data: null };
  if (!sponsorId) return { ok: false, error: 'Novo patrocinador inválido.', data: null };

  const { data, error } = await client.rpc('admin_reassign_user_sponsor', {
    target_id: userId,
    new_referrer_id: sponsorId,
    reason_value: reason ? String(reason) : null,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const adminListTransactions = async ({ kind, q = '', maxRows = 200 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', rows: [] };

  const { data, error } = await client.rpc('admin_list_transactions', { kind_filter: kind || null, q, max_rows: maxRows });
  if (error) return { ok: false, error: error.message, rows: [] };

  const rows = Array.isArray(data) ? data : [];
  return { ok: true, error: null, rows };
};

export const adminGetUserNetwork = async ({ rootId, maxDepth = 5 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', rows: [] };
  if (!rootId) return { ok: false, error: 'Usuário inválido.', rows: [] };

  const { data, error } = await client.rpc('admin_get_user_network', { root_id: rootId, max_depth: maxDepth });
  if (error) return { ok: false, error: error.message, rows: [] };
  const rows = Array.isArray(data) ? data : [];
  return { ok: true, error: null, rows };
};

export const adminFinancialTotals = async () => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', totals: null };

  const { data, error } = await client.rpc('admin_financial_totals');
  if (error) return { ok: false, error: error.message, totals: null };
  return { ok: true, error: null, totals: data || null };
};

export const adminPostAdjustment = async ({ userId, kind, amountUsd, type, meta } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.' };
  if (!userId) return { ok: false, error: 'Usuário inválido.' };

  const { data, error } = await client.rpc('admin_post_adjustment', {
    target_id: userId,
    kind_value: kind || 'AJUSTE',
    amount_value: safeNum(amountUsd || 0),
    type_value: type || null,
    meta_value: meta || {},
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, error: null, data };
};

export const adminSettleNowpaymentsPayment = async ({ paymentId, paymentStatus, rawEvent } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };
  if (!paymentId) return { ok: false, error: 'paymentId ausente.', data: null };

  const { data, error } = await client.rpc('admin_settle_nowpayments_payment', {
    payment_id: String(paymentId || '').trim(),
    payment_status: paymentStatus ? String(paymentStatus).trim() : null,
    raw_event: rawEvent || {},
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const adminProcessElitePayout = async ({ profitUsd, runAt, mode = 'MANUAL' } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };

  const { data, error } = await client.rpc('admin_process_elite_payout', {
    profit_usd: profitUsd == null ? null : safeNum(profitUsd),
    run_at: runAt || new Date().toISOString(),
    mode_value: String(mode || 'MANUAL').trim().toUpperCase(),
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const adminUpsertDailyPayoutOverride = async ({ bankId, targetYmd, overrideDailyPct, note } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };

  const { data, error } = await client.rpc('admin_upsert_daily_payout_override', {
    bank_id_value: String(bankId || '').trim(),
    target_ymd_value: targetYmd || null,
    override_daily_pct_value: safeNum(overrideDailyPct || 0),
    note_value: note ? String(note) : null,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const adminCancelDailyPayoutOverride = async ({ overrideId, reason } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };
  if (!overrideId) return { ok: false, error: 'Override inválido.', data: null };

  const { data, error } = await client.rpc('admin_cancel_daily_payout_override', {
    override_id_value: overrideId,
    reason_value: reason ? String(reason) : null,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const adminListDailyPayoutOverrides = async ({ bankId, status, maxRows = 100 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', rows: [] };

  const { data, error } = await client.rpc('admin_list_daily_payout_overrides', {
    bank_id_filter: bankId ? String(bankId).trim() : null,
    status_filter: status ? String(status).trim().toUpperCase() : null,
    max_rows: Math.max(1, Number.parseInt(maxRows || 100, 10)),
  });
  if (error) return { ok: false, error: error.message, rows: [] };
  return { ok: true, error: null, rows: Array.isArray(data) ? data : [] };
};

export const adminListDailyPayoutOverrideEvents = async ({ overrideId, bankId, maxRows = 200 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', rows: [] };

  const { data, error } = await client.rpc('admin_list_daily_payout_override_events', {
    override_id_filter: overrideId || null,
    bank_id_filter: bankId ? String(bankId).trim() : null,
    max_rows: Math.max(1, Number.parseInt(maxRows || 200, 10)),
  });
  if (error) return { ok: false, error: error.message, rows: [] };
  return { ok: true, error: null, rows: Array.isArray(data) ? data : [] };
};

export const adminDailyPayoutMonitor = async ({ targetDay } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };

  const { data, error } = await client.rpc('admin_daily_payout_monitor', {
    target_day: targetDay || null,
  });
  if (error) return { ok: false, error: error.message, data: null };
  return { ok: true, error: null, data: data || null };
};

export const adminRunDailyPayout = async ({ runAt, targetDay, triggerSource = 'ADMIN_BUTTON' } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', data: null };

  const requestedRunAt = runAt || new Date().toISOString();
  const { data, error } = await client.functions.invoke('daily-payouts-runner', {
    body: {
      runAt: requestedRunAt,
      targetDay: targetDay || null,
      triggerSource: String(triggerSource || 'ADMIN_BUTTON').trim().toUpperCase(),
    },
  });

  if (error || !data?.ok) {
    return { ok: false, error: error?.message || data?.reason || 'Falha ao rodar a rotina diária.', data: null };
  }

  return { ok: true, error: null, data: data || null };
};

export const adminListElitePayoutBatches = async ({ maxRows = 20 } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', rows: [] };

  const { data, error } = await client.rpc('admin_list_elite_payout_batches', { max_rows: maxRows });
  if (error) return { ok: false, error: error.message, rows: [] };
  return { ok: true, error: null, rows: Array.isArray(data) ? data : [] };
};

export const adminListElitePayoutItems = async ({ batchId } = {}) => {
  const client = getSupabaseClient();
  if (!client) return { ok: false, error: 'Supabase não configurado.', rows: [] };
  if (!batchId) return { ok: false, error: 'batchId ausente.', rows: [] };

  const { data, error } = await client.rpc('admin_list_elite_payout_items', { target_batch_id: batchId });
  if (error) return { ok: false, error: error.message, rows: [] };
  return { ok: true, error: null, rows: Array.isArray(data) ? data : [] };
};
