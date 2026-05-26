create or replace function public.process_daily_payouts(run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  day_key text;
  run_day date;
  inserted_daily int;
  inserted_residual int;
  sum_daily numeric;
  sum_residual numeric;
begin
  run_day := (run_at at time zone 'America/Sao_Paulo')::date;
  day_key := run_day::text;

  perform public._expire_stale_daily_payout_overrides(run_day);

  with recursive active_lots as (
    select
      p.id as profile_id,
      lot->>'id' as lot_id,
      lower(coalesce(lot->>'planKey', '')) as plan_key,
      coalesce(nullif(lot->>'units', '')::numeric, 0) as units,
      coalesce(nullif(lot->>'planPrice', '')::numeric, 0) as plan_price,
      nullif(lot->>'startAt', '')::timestamptz as start_at,
      nullif(lot->>'endAt', '')::timestamptz as end_at,
      coalesce(
        nullif(lot->>'bankId', ''),
        (
          select b.id
          from public.banks b
          where lower(coalesce(b.quota_key, '')) = lower(coalesce(lot->>'planKey', ''))
          order by case when upper(coalesce(b.status, '')) = 'ACTIVE' then 0 else 1 end, b.id asc
          limit 1
        )
      ) as bank_id,
      coalesce(
        nullif(lot->>'bankName', ''),
        (
          select b.name
          from public.banks b
          where lower(coalesce(b.quota_key, '')) = lower(coalesce(lot->>'planKey', ''))
          order by case when upper(coalesce(b.status, '')) = 'ACTIVE' then 0 else 1 end, b.id asc
          limit 1
        )
      ) as bank_name
    from public.profiles p
    cross join lateral jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) as lot
    where (lot->>'status') = 'ACTIVE'
      and run_at >= nullif(lot->>'startAt', '')::timestamptz
      and run_at < nullif(lot->>'endAt', '')::timestamptz
  ),
  credits as (
    select
      a.profile_id,
      a.lot_id,
      a.plan_key,
      a.bank_id,
      a.bank_name,
      public.get_base_daily_pct(a.plan_key) as base_daily_pct,
      coalesce(o.override_daily_pct, public.get_base_daily_pct(a.plan_key)) as effective_daily_pct,
      o.id as override_id,
      round(a.plan_price * a.units * (coalesce(o.override_daily_pct, public.get_base_daily_pct(a.plan_key)) / 100.0), 2) as amount
    from active_lots a
    left join lateral (
      select ov.*
      from public.daily_payout_overrides ov
      where ov.bank_id = a.bank_id
        and lower(coalesce(ov.quota_key, '')) = a.plan_key
        and ov.target_ymd = run_day
        and ov.payout_hour = 18
        and ov.status = 'SCHEDULED'
      order by ov.updated_at desc, ov.created_at desc
      limit 1
    ) o on true
  ),
  due as (
    select
      profile_id,
      lot_id,
      plan_key,
      bank_id,
      bank_name,
      base_daily_pct,
      effective_daily_pct,
      override_id,
      amount
    from credits
    where amount > 0 and lot_id is not null and lot_id <> ''
  ),
  ins_daily as (
    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    select
      d.profile_id,
      d.lot_id || '-daily-' || day_key,
      'DAILY',
      'Ganho diário',
      d.amount,
      'SISTEMA',
      'Creditado',
      jsonb_build_object(
        'id', d.lot_id || '-daily-' || day_key,
        'at', run_at::text,
        'kind', 'DAILY',
        'type', 'Ganho diário',
        'amount', d.amount,
        'payment', 'SISTEMA',
        'status', 'Creditado',
        'meta', jsonb_build_object(
          'lotId', d.lot_id,
          'day', day_key,
          'quotaKey', d.plan_key,
          'bankId', d.bank_id,
          'bankName', d.bank_name,
          'baseDailyPct', d.base_daily_pct,
          'effectiveDailyPct', d.effective_daily_pct,
          'overrideId', d.override_id,
          'overrideApplied', d.override_id is not null
        )
      ),
      run_at
    from due d
    where not exists (
      select 1
      from public.transactions existing_tx
      where existing_tx.profile_id = d.profile_id
        and existing_tx.external_id = d.lot_id || '-daily-' || day_key
    )
    returning profile_id, amount_usd, external_id, meta
  ),
  applied_overrides as (
    select
      nullif(ins.meta #>> '{meta,overrideId}', '')::uuid as override_id,
      sum(ins.amount_usd) as total_amount,
      count(*)::int as lots_count
    from ins_daily ins
    where coalesce(ins.meta #>> '{meta,overrideApplied}', 'false') = 'true'
      and nullif(ins.meta #>> '{meta,overrideId}', '') is not null
    group by nullif(ins.meta #>> '{meta,overrideId}', '')::uuid
  ),
  upd_overrides as (
    update public.daily_payout_overrides o
    set status = 'APPLIED',
        applied_at = now(),
        applied_run_at = run_at,
        applied_override_amount_usd = ao.total_amount,
        applied_lots_count = ao.lots_count,
        updated_at = now()
    from applied_overrides ao
    where o.id = ao.override_id
      and o.status = 'SCHEDULED'
    returning o.*, ao.total_amount, ao.lots_count
  ),
  ins_override_events as (
    insert into public.daily_payout_override_events (override_id, bank_id, quota_key, event_kind, actor_id, payload)
    select
      uo.id,
      uo.bank_id,
      uo.quota_key,
      'APPLIED',
      null,
      jsonb_build_object(
        'targetYmd', uo.target_ymd,
        'payoutHour', uo.payout_hour,
        'baseDailyPct', uo.base_daily_pct,
        'overrideDailyPct', uo.override_daily_pct,
        'appliedAmountUsd', uo.total_amount,
        'appliedLotsCount', uo.lots_count,
        'runAt', run_at
      )
    from upd_overrides uo
    returning 1
  ),
  daily_by_user as (
    select profile_id, sum(amount_usd) as total
    from ins_daily
    group by profile_id
  ),
  upd_daily as (
    update public.profiles p
    set balances =
          jsonb_set(
            coalesce(p.balances, '{}'::jsonb),
            '{available}',
            to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + d.total),
            true
          ),
        updated_at = now()
    from daily_by_user d
    where p.id = d.profile_id
    returning p.id
  ),
  base as (
    select
      profile_id as earner_id,
      amount_usd as base_amount,
      external_id as daily_ext_id
    from ins_daily
  ),
  uplines as (
    select
      b.earner_id,
      tn.referrer_profile_id as upline_id,
      1 as level,
      b.base_amount,
      b.daily_ext_id
    from base b
    join public.team_nodes tn on tn.profile_id = b.earner_id
    where tn.referrer_profile_id is not null
    union all
    select
      u.earner_id,
      tn2.referrer_profile_id,
      u.level + 1,
      u.base_amount,
      u.daily_ext_id
    from uplines u
    join public.team_nodes tn2 on tn2.profile_id = u.upline_id
    where u.level < 5 and tn2.referrer_profile_id is not null
  ),
  uplines_with_rate as (
    select
      u.*,
      upper(coalesce(p.rank_key, 'FERRO')) as rank_key,
      case upper(coalesce(p.rank_key, 'FERRO'))
        when 'FERRO' then case when u.level = 1 then 0.06::numeric else 0.03::numeric end
        when 'BRONZE' then case when u.level = 1 then 0.08::numeric else 0.04::numeric end
        when 'SILVER' then case when u.level = 1 then 0.10::numeric else 0.05::numeric end
        when 'OURO' then case when u.level = 1 then 0.15::numeric else 0.075::numeric end
        when 'DIAMOND' then case when u.level = 1 then 0.20::numeric else 0.10::numeric end
        when 'RM' then case when u.level = 1 then 0.25::numeric else 0.125::numeric end
        else case when u.level = 1 then 0.06::numeric else 0.03::numeric end
      end as pct
    from uplines u
    join public.profiles p on p.id = u.upline_id
  ),
  residuals as (
    select
      earner_id,
      upline_id,
      level,
      daily_ext_id,
      round(base_amount * pct, 2) as amount,
      pct
    from uplines_with_rate
    where pct > 0 and base_amount > 0
  ),
  ins_residual as (
    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    select
      r.upline_id,
      r.daily_ext_id || '-res-L' || r.level::text || '-' || r.upline_id::text,
      'RESIDUAL',
      'Residual diário - Nível ' || r.level::text,
      r.amount,
      'SISTEMA',
      'Creditado',
      jsonb_build_object(
        'id', r.daily_ext_id || '-res-L' || r.level::text || '-' || r.upline_id::text,
        'at', run_at::text,
        'kind', 'RESIDUAL',
        'type', 'Residual diário - Nível ' || r.level::text,
        'amount', r.amount,
        'payment', 'SISTEMA',
        'status', 'Creditado',
        'meta', jsonb_build_object('earnerId', r.earner_id, 'day', day_key, 'level', r.level, 'pct', r.pct)
      ),
      run_at
    from residuals r
    where r.amount > 0
      and not exists (
        select 1
        from public.transactions existing_tx
        where existing_tx.profile_id = r.upline_id
          and existing_tx.external_id = r.daily_ext_id || '-res-L' || r.level::text || '-' || r.upline_id::text
      )
    returning profile_id, amount_usd
  ),
  residual_by_user as (
    select profile_id, sum(amount_usd) as total
    from ins_residual
    group by profile_id
  ),
  upd_residual as (
    update public.profiles p
    set balances =
          jsonb_set(
            jsonb_set(
              coalesce(p.balances, '{}'::jsonb),
              '{available}',
              to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + r.total),
              true
            ),
            '{teamEarnings}',
            to_jsonb(coalesce(nullif(p.balances->>'teamEarnings', '')::numeric, 0) + r.total),
            true
          ),
        updated_at = now()
    from residual_by_user r
    where p.id = r.profile_id
    returning p.id
  )
  select
    (select count(*) from ins_daily),
    (select count(*) from ins_residual),
    coalesce((select sum(amount_usd) from ins_daily), 0),
    coalesce((select sum(amount_usd) from ins_residual), 0)
  into inserted_daily, inserted_residual, sum_daily, sum_residual;

  return jsonb_build_object(
    'ok', true,
    'day', day_key,
    'dailyCount', inserted_daily,
    'dailyTotal', sum_daily,
    'residualCount', inserted_residual,
    'residualTotal', sum_residual
  );
end;
$$;
