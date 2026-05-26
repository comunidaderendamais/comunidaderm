create or replace function public.admin_daily_payout_monitor(target_day date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  day_sp date := coalesce(target_day, (now() at time zone 'America/Sao_Paulo')::date);
  previous_day date := day_sp - 1;
  result jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  with active_lots as (
    select
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
      ) as bank_name,
      lower(coalesce(lot->>'planKey', '')) as quota_key,
      coalesce(nullif(lot->>'units', '')::numeric, 0) as units
    from public.profiles p
    cross join lateral jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) as lot
    where lot->>'status' = 'ACTIVE'
      and now() >= nullif(lot->>'startAt', '')::timestamptz
      and now() < nullif(lot->>'endAt', '')::timestamptz
  ),
  active_items as (
    select
      bank_id,
      coalesce(nullif(bank_name, ''), bank_id, 'sem-banca') as bank_name,
      quota_key,
      count(*)::int as lots_count,
      sum(units) as units_count
    from active_lots
    group by 1, 2, 3
    order by quota_key asc, bank_id asc
  ),
  daily_rows as (
    select
      t.meta #>> '{meta,bankId}' as bank_id,
      t.meta #>> '{meta,bankName}' as bank_name,
      lower(coalesce(t.meta #>> '{meta,quotaKey}', '')) as quota_key,
      count(*)::int as tx_count,
      coalesce(sum(t.amount_usd), 0) as total_usd,
      bool_or(coalesce(t.meta #>> '{meta,overrideApplied}', 'false') = 'true') as has_override
    from public.transactions t
    where t.kind = 'DAILY'
      and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date = day_sp)
    group by 1, 2, 3
    order by quota_key asc, bank_id asc
  ),
  residual_rows as (
    select
      count(*)::int as tx_count,
      coalesce(sum(t.amount_usd), 0) as total_usd,
      max(coalesce(t.at, t.created_at)) as last_at
    from public.transactions t
    where t.kind = 'RESIDUAL'
      and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date = day_sp)
  ),
  daily_totals as (
    select
      count(*)::int as tx_count,
      coalesce(sum(t.amount_usd), 0) as total_usd,
      max(coalesce(t.at, t.created_at)) as last_at
    from public.transactions t
    where t.kind = 'DAILY'
      and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date = day_sp)
  ),
  overrides_scope as (
    select
      o.id,
      o.bank_id,
      b.name as bank_name,
      o.quota_key,
      o.target_ymd,
      o.status,
      o.base_daily_pct,
      o.override_daily_pct,
      o.applied_at,
      o.applied_run_at,
      o.applied_lots_count,
      o.applied_override_amount_usd,
      o.note
    from public.daily_payout_overrides o
    join public.banks b on b.id = o.bank_id
    where o.target_ymd in (day_sp, previous_day)
    order by o.target_ymd desc, o.updated_at desc
  ),
  latest_event as (
    select
      e.created_at,
      e.event_kind,
      e.bank_id,
      b.name as bank_name,
      e.quota_key,
      e.payload
    from public.daily_payout_override_events e
    join public.banks b on b.id = e.bank_id
    where e.created_at >= (now() - interval '3 day')
    order by e.created_at desc
    limit 1
  ),
  run_scope as (
    select
      r.id,
      r.run_day,
      r.requested_run_at,
      r.executed_at,
      r.trigger_source,
      r.actor_email,
      r.status,
      r.request_payload,
      r.result_payload,
      r.error_message,
      r.created_at
    from public.daily_payout_run_audits r
    where r.run_day in (day_sp, previous_day)
    order by r.created_at desc
    limit 10
  )
  select jsonb_build_object(
    'day', day_sp,
    'previousDay', previous_day,
    'generatedAt', now(),
    'activeLots', jsonb_build_object(
      'totalLots', coalesce((select sum(lots_count) from active_items), 0),
      'totalUnits', coalesce((select sum(units_count) from active_items), 0),
      'items', coalesce((select jsonb_agg(to_jsonb(active_items)) from active_items), '[]'::jsonb)
    ),
    'daily', jsonb_build_object(
      'count', coalesce((select tx_count from daily_totals), 0),
      'totalUsd', coalesce((select total_usd from daily_totals), 0),
      'lastAt', (select last_at from daily_totals),
      'items', coalesce((select jsonb_agg(to_jsonb(daily_rows)) from daily_rows), '[]'::jsonb)
    ),
    'residual', jsonb_build_object(
      'count', coalesce((select tx_count from residual_rows), 0),
      'totalUsd', coalesce((select total_usd from residual_rows), 0),
      'lastAt', (select last_at from residual_rows)
    ),
    'overrides', jsonb_build_object(
      'todayScheduled', coalesce((select count(*) from overrides_scope where target_ymd = day_sp and status = 'SCHEDULED'), 0),
      'todayApplied', coalesce((select count(*) from overrides_scope where target_ymd = day_sp and status = 'APPLIED'), 0),
      'todayCancelled', coalesce((select count(*) from overrides_scope where target_ymd = day_sp and status = 'CANCELLED'), 0),
      'previousExpired', coalesce((select count(*) from overrides_scope where target_ymd = previous_day and status = 'EXPIRED'), 0),
      'items', coalesce((select jsonb_agg(to_jsonb(overrides_scope)) from overrides_scope), '[]'::jsonb)
    ),
    'latestEvent', coalesce((select to_jsonb(latest_event) from latest_event), '{}'::jsonb),
    'latestRun', coalesce((select to_jsonb(run_scope) from run_scope limit 1), '{}'::jsonb),
    'runAudits', coalesce((select jsonb_agg(to_jsonb(run_scope)) from run_scope), '[]'::jsonb)
  ) into result;

  return coalesce(result, '{}'::jsonb);
end;
$$;

