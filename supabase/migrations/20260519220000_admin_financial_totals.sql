create or replace function public.admin_financial_totals()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  users_count int;
  total_invested numeric;
  cota10_units numeric;
  cota50_units numeric;
  cota100_units numeric;
  total_paid_residual numeric;
  total_paid_te numeric;
  total_paid_bonus numeric;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select
    count(*)::int,
    coalesce(sum(nullif(p.balances->>'invested', '')::numeric), 0),
    coalesce(sum(nullif(p.holdings->>'cota10', '')::numeric), 0),
    coalesce(sum(nullif(p.holdings->>'cota50', '')::numeric), 0),
    coalesce(sum(nullif(p.holdings->>'cota100', '')::numeric), 0)
  into
    users_count,
    total_invested,
    cota10_units,
    cota50_units,
    cota100_units
  from public.profiles p;

  select
    coalesce(sum(case when t.kind = 'RESIDUAL' then t.amount_usd else 0 end), 0),
    coalesce(sum(case when t.kind = 'TE' then t.amount_usd else 0 end), 0),
    coalesce(sum(case when t.kind = 'ELITE' then t.amount_usd else 0 end), 0)
  into
    total_paid_residual,
    total_paid_te,
    total_paid_bonus
  from public.transactions t
  where t.amount_usd > 0;

  return jsonb_build_object(
    'usersCount', users_count,
    'totalInvested', total_invested,
    'totalRm10', cota10_units * 10,
    'totalRm50', cota50_units * 50,
    'totalRm100', cota100_units * 100,
    'totalPaidResidual', total_paid_residual,
    'totalPaidBonus', total_paid_bonus,
    'totalPaidTe', total_paid_te
  );
end;
$$;

revoke all on function public.admin_financial_totals() from public;
grant execute on function public.admin_financial_totals() to authenticated;
