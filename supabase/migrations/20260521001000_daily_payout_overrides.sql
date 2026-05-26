create table if not exists public.daily_payout_overrides (
  id uuid primary key default gen_random_uuid(),
  bank_id text not null references public.banks(id) on delete cascade,
  quota_key text not null,
  target_ymd date not null,
  payout_hour smallint not null default 18,
  base_daily_pct numeric(10,4) not null,
  override_daily_pct numeric(10,4) not null,
  status text not null default 'SCHEDULED',
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  applied_at timestamptz,
  applied_run_at timestamptz,
  applied_override_amount_usd numeric(18,2),
  applied_lots_count int,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_payout_overrides_status_chk check (status in ('SCHEDULED', 'APPLIED', 'CANCELLED', 'EXPIRED')),
  constraint daily_payout_overrides_pct_chk check (override_daily_pct > 0 and override_daily_pct < 100),
  constraint daily_payout_overrides_unique unique (bank_id, quota_key, target_ymd, payout_hour)
);

create table if not exists public.daily_payout_override_events (
  id uuid primary key default gen_random_uuid(),
  override_id uuid not null references public.daily_payout_overrides(id) on delete cascade,
  bank_id text not null references public.banks(id) on delete cascade,
  quota_key text not null,
  event_kind text not null,
  actor_id uuid references public.profiles(id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint daily_payout_override_events_kind_chk check (event_kind in ('UPSERT', 'CANCELLED', 'APPLIED', 'EXPIRED'))
);

create index if not exists daily_payout_overrides_bank_day_idx
on public.daily_payout_overrides (bank_id, target_ymd desc, payout_hour asc);

create index if not exists daily_payout_overrides_status_idx
on public.daily_payout_overrides (status, target_ymd desc);

create index if not exists daily_payout_override_events_override_idx
on public.daily_payout_override_events (override_id, created_at desc);

create trigger daily_payout_overrides_set_updated_at
before update on public.daily_payout_overrides
for each row execute function public.set_updated_at();

alter table public.daily_payout_overrides enable row level security;
alter table public.daily_payout_override_events enable row level security;

drop policy if exists daily_payout_overrides_admin_select on public.daily_payout_overrides;
create policy daily_payout_overrides_admin_select
on public.daily_payout_overrides
for select
to authenticated
using (public.is_admin());

drop policy if exists daily_payout_override_events_admin_select on public.daily_payout_override_events;
create policy daily_payout_override_events_admin_select
on public.daily_payout_override_events
for select
to authenticated
using (public.is_admin());

create or replace function public.get_base_daily_pct(plan_key text)
returns numeric
language sql
stable
as $$
  select case lower(coalesce(plan_key, ''))
    when 'cota10' then 1.0::numeric
    when 'cota50' then 1.1::numeric
    when 'cota100' then 1.2::numeric
    else 0::numeric
  end;
$$;

create or replace function public._expire_stale_daily_payout_overrides(run_day date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  expired_count int := 0;
begin
  with expired_rows as (
    update public.daily_payout_overrides o
    set status = 'EXPIRED',
        updated_at = now()
    where o.status = 'SCHEDULED'
      and o.target_ymd < run_day
    returning o.*
  ), ins_events as (
    insert into public.daily_payout_override_events (override_id, bank_id, quota_key, event_kind, actor_id, payload)
    select
      e.id,
      e.bank_id,
      e.quota_key,
      'EXPIRED',
      null,
      jsonb_build_object(
        'targetYmd', e.target_ymd,
        'overrideDailyPct', e.override_daily_pct,
        'baseDailyPct', e.base_daily_pct,
        'status', e.status
      )
    from expired_rows e
    returning 1
  )
  select count(*) into expired_count from expired_rows;

  return coalesce(expired_count, 0);
end;
$$;

create or replace function public.admin_upsert_daily_payout_override(
  bank_id_value text,
  target_ymd_value date,
  override_daily_pct_value numeric,
  note_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  bank_row public.banks%rowtype;
  actor_id uuid := auth.uid();
  base_pct numeric(10,4);
  next_row public.daily_payout_overrides%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select * into bank_row
  from public.banks
  where id = nullif(btrim(bank_id_value), '');

  if bank_row.id is null then
    raise exception 'bank_not_found';
  end if;

  if target_ymd_value is null then
    raise exception 'target_day_required';
  end if;

  if coalesce(override_daily_pct_value, 0) <= 0 or coalesce(override_daily_pct_value, 0) >= 100 then
    raise exception 'invalid_override_pct';
  end if;

  base_pct := public.get_base_daily_pct(bank_row.quota_key);
  if base_pct <= 0 then
    raise exception 'invalid_quota_key';
  end if;

  if exists (
    select 1
    from public.daily_payout_overrides o
    where o.bank_id = bank_row.id
      and o.quota_key = bank_row.quota_key
      and o.target_ymd = target_ymd_value
      and o.payout_hour = 18
      and o.status = 'APPLIED'
  ) then
    raise exception 'override_already_applied';
  end if;

  insert into public.daily_payout_overrides (
    bank_id,
    quota_key,
    target_ymd,
    payout_hour,
    base_daily_pct,
    override_daily_pct,
    status,
    note,
    created_by,
    updated_by
  )
  values (
    bank_row.id,
    bank_row.quota_key,
    target_ymd_value,
    18,
    base_pct,
    override_daily_pct_value,
    'SCHEDULED',
    nullif(btrim(note_value), ''),
    actor_id,
    actor_id
  )
  on conflict (bank_id, quota_key, target_ymd, payout_hour)
  do update set
    base_daily_pct = excluded.base_daily_pct,
    override_daily_pct = excluded.override_daily_pct,
    status = 'SCHEDULED',
    note = excluded.note,
    updated_by = actor_id,
    updated_at = now()
  returning * into next_row;

  insert into public.daily_payout_override_events (override_id, bank_id, quota_key, event_kind, actor_id, payload)
  values (
    next_row.id,
    next_row.bank_id,
    next_row.quota_key,
    'UPSERT',
    actor_id,
    jsonb_build_object(
      'targetYmd', next_row.target_ymd,
      'payoutHour', next_row.payout_hour,
      'baseDailyPct', next_row.base_daily_pct,
      'overrideDailyPct', next_row.override_daily_pct,
      'note', next_row.note,
      'status', next_row.status
    )
  );

  return jsonb_build_object(
    'ok', true,
    'row', to_jsonb(next_row),
    'bankName', bank_row.name
  );
end;
$$;

create or replace function public.admin_cancel_daily_payout_override(
  override_id_value uuid,
  reason_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_id uuid := auth.uid();
  next_row public.daily_payout_overrides%rowtype;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.daily_payout_overrides o
  set status = 'CANCELLED',
      updated_by = actor_id,
      note = coalesce(nullif(btrim(reason_value), ''), o.note),
      updated_at = now()
  where o.id = override_id_value
    and o.status = 'SCHEDULED'
  returning * into next_row;

  if next_row.id is null then
    raise exception 'override_not_cancellable';
  end if;

  insert into public.daily_payout_override_events (override_id, bank_id, quota_key, event_kind, actor_id, payload)
  values (
    next_row.id,
    next_row.bank_id,
    next_row.quota_key,
    'CANCELLED',
    actor_id,
    jsonb_build_object(
      'targetYmd', next_row.target_ymd,
      'overrideDailyPct', next_row.override_daily_pct,
      'baseDailyPct', next_row.base_daily_pct,
      'reason', reason_value
    )
  );

  return jsonb_build_object('ok', true, 'row', to_jsonb(next_row));
end;
$$;

create or replace function public.admin_list_daily_payout_overrides(
  bank_id_filter text default null,
  status_filter text default null,
  max_rows int default 100
)
returns table(
  id uuid,
  bank_id text,
  bank_name text,
  quota_key text,
  target_ymd date,
  payout_hour int,
  base_daily_pct numeric,
  override_daily_pct numeric,
  status text,
  note text,
  created_at timestamptz,
  updated_at timestamptz,
  applied_at timestamptz,
  applied_run_at timestamptz,
  applied_override_amount_usd numeric,
  applied_lots_count int,
  created_by uuid,
  created_by_email text,
  created_by_username text,
  updated_by uuid,
  updated_by_email text,
  updated_by_username text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id,
    o.bank_id,
    b.name as bank_name,
    o.quota_key,
    o.target_ymd,
    o.payout_hour::int,
    o.base_daily_pct,
    o.override_daily_pct,
    o.status,
    o.note,
    o.created_at,
    o.updated_at,
    o.applied_at,
    o.applied_run_at,
    o.applied_override_amount_usd,
    o.applied_lots_count,
    o.created_by,
    pcb.email as created_by_email,
    pcb.username as created_by_username,
    o.updated_by,
    pub.email as updated_by_email,
    pub.username as updated_by_username
  from public.daily_payout_overrides o
  join public.banks b on b.id = o.bank_id
  left join public.profiles pcb on pcb.id = o.created_by
  left join public.profiles pub on pub.id = o.updated_by
  where public.is_admin()
    and (bank_id_filter is null or bank_id_filter = '' or o.bank_id = bank_id_filter)
    and (status_filter is null or status_filter = '' or upper(o.status) = upper(status_filter))
  order by o.target_ymd desc, o.updated_at desc
  limit greatest(1, least(max_rows, 300));
$$;

create or replace function public.admin_list_daily_payout_override_events(
  override_id_filter uuid default null,
  bank_id_filter text default null,
  max_rows int default 200
)
returns table(
  id uuid,
  override_id uuid,
  bank_id text,
  bank_name text,
  quota_key text,
  event_kind text,
  payload jsonb,
  created_at timestamptz,
  actor_id uuid,
  actor_email text,
  actor_username text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    e.id,
    e.override_id,
    e.bank_id,
    b.name as bank_name,
    e.quota_key,
    e.event_kind,
    e.payload,
    e.created_at,
    e.actor_id,
    p.email as actor_email,
    p.username as actor_username
  from public.daily_payout_override_events e
  join public.banks b on b.id = e.bank_id
  left join public.profiles p on p.id = e.actor_id
  where public.is_admin()
    and (override_id_filter is null or e.override_id = override_id_filter)
    and (bank_id_filter is null or bank_id_filter = '' or e.bank_id = bank_id_filter)
  order by e.created_at desc
  limit greatest(1, least(max_rows, 500));
$$;

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

  with active_lots as (
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
    on conflict (profile_id, external_id) do nothing
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
    on conflict (profile_id, external_id) do nothing
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

drop function if exists public.create_purchase(text, int, text, text, text, text, text);
create or replace function public.create_purchase(
  plan_key text,
  units int,
  payment_currency text,
  payment_network text default null,
  payment_id text default null,
  invoice_id text default null,
  order_id text default null,
  bank_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pk text;
  u int;
  price numeric;
  quotas_per_unit int;
  title text;
  total numeric;
  currency text;
  network text;
  now_ts timestamptz;
  now_iso text;
  available numeric;
  purchase_ext_id text;
  deposit_ext_id text;
  pay_label text;
  payment_id_norm text;
  invoice_id_norm text;
  order_id_norm text;
  lot_id text;
  lot jsonb;
  start_at timestamptz;
  end_at timestamptz;
  renew_until timestamptz;
  te_base numeric;
  ref1 uuid;
  ref2 uuid;
  ref3 uuid;
  rec_level int;
  rec_id uuid;
  rec_pct numeric;
  rec_amount numeric;
  rec_ext_id text;
  rec_type text;
  rec_meta jsonb;
  bank_row public.banks%rowtype;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  pk := lower(coalesce(plan_key, ''));
  if pk not in ('cota10', 'cota50', 'cota100') then
    raise exception 'invalid_plan';
  end if;

  u := greatest(1, least(coalesce(units, 1), 100));
  currency := upper(coalesce(payment_currency, ''));
  network := nullif(upper(coalesce(payment_network, '')), '');
  payment_id_norm := nullif(btrim(payment_id), '');
  invoice_id_norm := nullif(btrim(invoice_id), '');
  order_id_norm := nullif(btrim(order_id), '');

  if pk = 'cota10' then
    price := 10;
    quotas_per_unit := 1;
    title := 'COTA 10';
  elsif pk = 'cota50' then
    price := 50;
    quotas_per_unit := 5;
    title := 'COTA 50';
  else
    price := 100;
    quotas_per_unit := 10;
    title := 'COTA 100';
  end if;

  select * into bank_row
  from public.banks b
  where (
      nullif(btrim(bank_id), '') is not null
      and b.id = nullif(btrim(bank_id), '')
    )
    or (
      nullif(btrim(bank_id), '') is null
      and lower(coalesce(b.quota_key, '')) = pk
    )
  order by
    case when nullif(btrim(bank_id), '') is not null and b.id = nullif(btrim(bank_id), '') then 0 else 1 end,
    case when upper(coalesce(b.status, '')) = 'ACTIVE' then 0 else 1 end,
    b.id asc
  limit 1;

  if bank_row.id is not null and lower(coalesce(bank_row.quota_key, '')) <> pk then
    raise exception 'bank_quota_mismatch';
  end if;

  total := round(price * u, 2);
  now_ts := now();
  now_iso := now_ts::text;

  if currency = 'SALDO' then
    if exists(select 1 from public.profiles p where p.id = uid and p.blocked) then
      raise exception 'user_blocked';
    end if;

    available := coalesce(nullif((select p.balances->>'available' from public.profiles p where p.id = uid), '')::numeric, 0);
    if available < total then
      raise exception 'insufficient_balance';
    end if;

    purchase_ext_id := gen_random_uuid()::text;
    pay_label := 'SALDO';

    start_at := now_ts;
    end_at := start_at + make_interval(months => 6);
    renew_until := end_at + make_interval(hours => 72);
    lot_id := gen_random_uuid()::text;

    lot := jsonb_build_object(
      'id', lot_id,
      'planKey', pk,
      'planTitle', title,
      'units', u,
      'planPrice', price,
      'quotasPerUnit', quotas_per_unit,
      'startAt', start_at,
      'endAt', end_at,
      'renewUntil', renew_until,
      'status', 'ACTIVE',
      'settledAt', null,
      'cancelRequestedAt', null,
      'cancelPayAt', null,
      'cancelPenaltyPct', null,
      'cancelAmount', null,
      'bankId', bank_row.id,
      'bankName', bank_row.name,
      'source', jsonb_build_object('provider', 'BALANCE')
    );

    update public.profiles p
    set holdings = jsonb_set(
          coalesce(p.holdings, '{}'::jsonb),
          array[pk],
          to_jsonb(coalesce(nullif(p.holdings->>pk, '')::numeric, 0) + u),
          true
        ),
        balances =
          jsonb_set(
            jsonb_set(coalesce(p.balances, '{}'::jsonb), '{available}', to_jsonb(available - total), true),
            '{invested}', to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + total), true
          ),
        quota_lots = coalesce(p.quota_lots, '[]'::jsonb) || jsonb_build_array(lot),
        updated_at = now_ts
    where p.id = uid;

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      uid,
      purchase_ext_id,
      'COMPRA',
      'Compra ' || title,
      -total,
      pay_label,
      'Concluído',
      jsonb_build_object(
        'id', purchase_ext_id,
        'at', now_iso,
        'kind', 'COMPRA',
        'type', 'Compra ' || title,
        'amount', -total,
        'payment', pay_label,
        'status', 'Concluído',
        'meta', jsonb_build_object(
          'planKey', pk,
          'planTitle', title,
          'planPrice', price,
          'units', u,
          'quotasPerUnit', quotas_per_unit,
          'bankId', bank_row.id,
          'bankName', bank_row.name
        )
      ),
      now_ts
    );

    te_base := round(total * 0.1, 2);
    select tn.referrer_profile_id into ref1 from public.team_nodes tn where tn.profile_id = uid;
    if ref1 is not null then
      select tn.referrer_profile_id into ref2 from public.team_nodes tn where tn.profile_id = ref1;
    end if;
    if ref2 is not null then
      select tn.referrer_profile_id into ref3 from public.team_nodes tn where tn.profile_id = ref2;
    end if;

    for rec_level, rec_id, rec_pct in
      select * from (values
        (1, ref1, 0.4::numeric),
        (2, ref2, 0.2::numeric),
        (3, ref3, 0.1::numeric)
      ) as x(level, id, pct)
    loop
      if rec_id is null then
        continue;
      end if;

      rec_amount := round(te_base * rec_pct, 2);
      if rec_amount <= 0 then
        continue;
      end if;

      rec_ext_id := purchase_ext_id || '-te-L' || rec_level::text || '-' || rec_id::text;
      rec_type := 'Ganho de Rede (TE) - Nível ' || rec_level::text;
      rec_meta := jsonb_build_object('buyerId', uid, 'purchaseId', purchase_ext_id, 'level', rec_level, 'pct', rec_pct);

      insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
      values (
        rec_id,
        rec_ext_id,
        'TE',
        rec_type,
        rec_amount,
        'SISTEMA',
        'Creditado',
        jsonb_build_object(
          'id', rec_ext_id,
          'at', now_iso,
          'kind', 'TE',
          'type', rec_type,
          'amount', rec_amount,
          'payment', 'SISTEMA',
          'status', 'Creditado',
          'meta', rec_meta
        ),
        now_ts
      )
      on conflict (profile_id, external_id)
      do update set
        amount_usd = excluded.amount_usd,
        status = excluded.status,
        meta = excluded.meta,
        at = excluded.at;

      update public.profiles p
      set balances =
            jsonb_set(
              jsonb_set(
                jsonb_set(coalesce(p.balances, '{}'::jsonb), '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + rec_amount), true),
                '{teamEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teamEarnings', '')::numeric, 0) + rec_amount), true
              ),
              '{teEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teEarnings', '')::numeric, 0) + rec_amount), true
            ),
          updated_at = now_ts
      where p.id = rec_id;
    end loop;

    return jsonb_build_object('ok', true, 'mode', 'SALDO', 'purchaseId', purchase_ext_id);
  end if;

  if currency not in ('USDT', 'USDC') then
    raise exception 'invalid_currency';
  end if;
  if currency = 'USDT' and network not in ('BEP20', 'TRC20') then
    raise exception 'invalid_network';
  end if;
  if currency = 'USDC' then
    network := 'ARBITRUM';
  end if;

  if payment_id_norm is null and invoice_id_norm is null and order_id_norm is null then
    raise exception 'payment_reference_required';
  end if;

  if exists(
    select 1
    from public.transactions t
    where t.kind = 'DEPOSITO'
      and (
        (payment_id_norm is not null and (t.meta #>> '{meta,paymentId}') = payment_id_norm)
        or (invoice_id_norm is not null and (t.meta #>> '{meta,invoiceId}') = invoice_id_norm)
        or (order_id_norm is not null and (t.meta #>> '{meta,orderId}') = order_id_norm)
      )
  ) then
    raise exception 'payment_reference_already_used';
  end if;

  purchase_ext_id := gen_random_uuid()::text;
  deposit_ext_id := gen_random_uuid()::text;
  pay_label := currency || ' ' || coalesce(network, '');

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    purchase_ext_id,
    'COMPRA',
    'Compra ' || title,
    -total,
    pay_label,
    'Aguardando depósito',
    jsonb_build_object(
      'id', purchase_ext_id,
      'at', now_iso,
      'kind', 'COMPRA',
      'type', 'Compra ' || title,
      'amount', -total,
      'payment', pay_label,
      'status', 'Aguardando depósito',
      'meta', jsonb_build_object(
        'depositTxId', deposit_ext_id,
        'paymentId', payment_id_norm,
        'invoiceId', invoice_id_norm,
        'orderId', order_id_norm,
        'bankId', bank_row.id,
        'bankName', bank_row.name
      )
    ),
    now_ts
  );

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    deposit_ext_id,
    'DEPOSITO',
    'Depósito em processamento • ' || title,
    total,
    pay_label,
    'Pendente',
    jsonb_build_object(
      'id', deposit_ext_id,
      'at', now_iso,
      'kind', 'DEPOSITO',
      'type', 'Depósito em processamento • ' || title,
      'amount', total,
      'payment', pay_label,
      'status', 'Pendente',
      'meta', jsonb_build_object(
        'provider', 'NOWPAYMENTS',
        'paymentId', payment_id_norm,
        'invoiceId', invoice_id_norm,
        'orderId', order_id_norm,
        'currency', currency,
        'network', network,
        'purpose', 'PURCHASE',
        'purchaseTxId', purchase_ext_id,
        'planKey', pk,
        'planTitle', title,
        'planPrice', price,
        'quotasPerUnit', quotas_per_unit,
        'units', u,
        'bankId', bank_row.id,
        'bankName', bank_row.name
      )
    ),
    now_ts
  );

  return jsonb_build_object(
    'ok', true,
    'mode', 'NOWPAYMENTS',
    'purchaseId', purchase_ext_id,
    'depositId', deposit_ext_id,
    'paymentId', payment_id_norm,
    'invoiceId', invoice_id_norm,
    'orderId', order_id_norm
  );
end;
$$;

create or replace function public.renew_lot(
  lot_id text,
  payment_currency text,
  payment_network text default null,
  payment_id text default null,
  invoice_id text default null,
  order_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  p public.profiles%rowtype;
  lots jsonb;
  lot jsonb;
  next_lots jsonb;
  now_ts timestamptz;
  now_iso text;
  currency text;
  network text;
  payment_id_norm text;
  invoice_id_norm text;
  order_id_norm text;
  total numeric;
  available numeric;
  renew_until timestamptz;
  renew_until_new timestamptz;
  renew_ext_id text;
  deposit_ext_id text;
  pay_label text;
  start_at timestamptz;
  end_at timestamptz;
  new_lot_id text;
  new_lot jsonb;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists(select 1 from public.profiles p2 where p2.id = uid and p2.blocked) then
    raise exception 'user_blocked';
  end if;

  now_ts := now();
  now_iso := now_ts::text;
  currency := upper(coalesce(payment_currency, ''));
  network := nullif(upper(coalesce(payment_network, '')), '');
  payment_id_norm := nullif(btrim(payment_id), '');
  invoice_id_norm := nullif(btrim(invoice_id), '');
  order_id_norm := nullif(btrim(order_id), '');

  select * into p from public.profiles where id = uid;
  lots := coalesce(p.quota_lots, '[]'::jsonb);

  select elem into lot
  from jsonb_array_elements(lots) elem
  where elem->>'id' = lot_id
  limit 1;
  if lot is null then
    raise exception 'lot_not_found';
  end if;
  if coalesce(lot->>'status', '') <> 'MATURED' then
    raise exception 'only_matured';
  end if;

  renew_until := nullif(lot->>'renewUntil', '')::timestamptz;
  if renew_until is null or now_ts > renew_until then
    raise exception 'renew_expired';
  end if;

  total := coalesce(nullif(lot->>'planPrice', '')::numeric, 0) * coalesce(nullif(lot->>'units', '')::numeric, 0);
  renew_ext_id := gen_random_uuid()::text;

  start_at := now_ts;
  end_at := start_at + make_interval(months => 6);
  renew_until_new := end_at + make_interval(hours => 72);
  new_lot_id := gen_random_uuid()::text;
  new_lot := jsonb_build_object(
    'id', new_lot_id,
    'planKey', coalesce(lot->>'planKey', ''),
    'planTitle', coalesce(lot->>'planTitle', ''),
    'units', coalesce(nullif(lot->>'units', '')::numeric, 0),
    'planPrice', coalesce(nullif(lot->>'planPrice', '')::numeric, 0),
    'quotasPerUnit', coalesce(nullif(lot->>'quotasPerUnit', '')::numeric, 0),
    'startAt', start_at,
    'endAt', end_at,
    'renewUntil', renew_until_new,
    'status', 'ACTIVE',
    'settledAt', null,
    'cancelRequestedAt', null,
    'cancelPayAt', null,
    'cancelPenaltyPct', null,
    'cancelAmount', null,
    'bankId', coalesce(lot->>'bankId', ''),
    'bankName', coalesce(lot->>'bankName', ''),
    'source', jsonb_build_object('provider', currency, 'paymentId', payment_id_norm, 'invoiceId', invoice_id_norm, 'orderId', order_id_norm)
  );

  select coalesce(jsonb_agg(elem) filter (where elem->>'id' <> lot_id), '[]'::jsonb) into next_lots
  from jsonb_array_elements(lots) elem;
  next_lots := next_lots || jsonb_build_array(new_lot);

  if currency = 'SALDO' then
    available := coalesce(nullif(p.balances->>'available', '')::numeric, 0);
    if available < total then
      raise exception 'insufficient_balance';
    end if;

    update public.profiles pr
    set balances =
          jsonb_set(
            jsonb_set(coalesce(pr.balances, '{}'::jsonb), '{available}', to_jsonb(available - total), true),
            '{invested}', to_jsonb(coalesce(nullif(pr.balances->>'invested', '')::numeric, 0) + total), true
          ),
        quota_lots = next_lots,
        updated_at = now_ts
    where pr.id = uid;

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      uid,
      renew_ext_id,
      'RENEW',
      'Renovação (' || coalesce(lot->>'planTitle', '') || ')',
      -total,
      'SALDO',
      'Concluído',
      jsonb_build_object(
        'id', renew_ext_id,
        'at', now_iso,
        'kind', 'RENEW',
        'type', 'Renovação (' || coalesce(lot->>'planTitle', '') || ')',
        'amount', -total,
        'payment', 'SALDO',
        'status', 'Concluído',
        'meta', jsonb_build_object(
          'oldLotId', lot_id,
          'newLotId', new_lot_id,
          'bankId', coalesce(lot->>'bankId', ''),
          'bankName', coalesce(lot->>'bankName', '')
        )
      ),
      now_ts
    );

    return jsonb_build_object('ok', true, 'mode', 'SALDO', 'renewId', renew_ext_id, 'newLotId', new_lot_id);
  end if;

  if currency not in ('USDT', 'USDC') then
    raise exception 'invalid_currency';
  end if;
  if currency = 'USDT' and network not in ('BEP20', 'TRC20') then
    raise exception 'invalid_network';
  end if;
  if currency = 'USDC' then
    network := 'ARBITRUM';
  end if;

  if payment_id_norm is null and invoice_id_norm is null and order_id_norm is null then
    raise exception 'payment_reference_required';
  end if;

  if exists(
    select 1
    from public.transactions t
    where t.kind = 'DEPOSITO'
      and (
        (payment_id_norm is not null and (t.meta #>> '{meta,paymentId}') = payment_id_norm)
        or (invoice_id_norm is not null and (t.meta #>> '{meta,invoiceId}') = invoice_id_norm)
        or (order_id_norm is not null and (t.meta #>> '{meta,orderId}') = order_id_norm)
      )
  ) then
    raise exception 'payment_reference_already_used';
  end if;

  deposit_ext_id := gen_random_uuid()::text;
  pay_label := currency || ' ' || coalesce(network, '');

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    renew_ext_id,
    'RENEW',
    'Renovação (' || coalesce(lot->>'planTitle', '') || ')',
    -total,
    pay_label,
    'Pendente',
    jsonb_build_object(
      'id', renew_ext_id,
      'at', now_iso,
      'kind', 'RENEW',
      'type', 'Renovação (' || coalesce(lot->>'planTitle', '') || ')',
      'amount', -total,
      'payment', pay_label,
      'status', 'Pendente',
      'meta', jsonb_build_object(
        'depositTxId', deposit_ext_id,
        'oldLotId', lot_id,
        'newLotId', new_lot_id,
        'paymentId', payment_id_norm,
        'invoiceId', invoice_id_norm,
        'orderId', order_id_norm,
        'bankId', coalesce(lot->>'bankId', ''),
        'bankName', coalesce(lot->>'bankName', '')
      )
    ),
    now_ts
  );

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    deposit_ext_id,
    'DEPOSITO',
    'Depósito em processamento • Renovação (' || coalesce(lot->>'planTitle', '') || ')',
    total,
    pay_label,
    'Pendente',
    jsonb_build_object(
      'id', deposit_ext_id,
      'at', now_iso,
      'kind', 'DEPOSITO',
      'type', 'Depósito em processamento • Renovação (' || coalesce(lot->>'planTitle', '') || ')',
      'amount', total,
      'payment', pay_label,
      'status', 'Pendente',
      'meta', jsonb_build_object(
        'provider', 'NOWPAYMENTS',
        'paymentId', payment_id_norm,
        'invoiceId', invoice_id_norm,
        'orderId', order_id_norm,
        'currency', currency,
        'network', network,
        'purpose', 'RENEW',
        'renewTxId', renew_ext_id,
        'oldLotId', lot_id,
        'newLot', new_lot
      )
    ),
    now_ts
  );

  return jsonb_build_object(
    'ok', true,
    'mode', 'NOWPAYMENTS',
    'renewId', renew_ext_id,
    'depositId', deposit_ext_id,
    'newLotId', new_lot_id,
    'paymentId', payment_id_norm,
    'invoiceId', invoice_id_norm,
    'orderId', order_id_norm
  );
end;
$$;

create or replace function public.process_nowpayments_reference(
  payment_id text default null,
  invoice_id text default null,
  order_id text default null,
  payment_status text default null,
  raw_event jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dep public.transactions%rowtype;
  now_ts timestamptz;
  now_iso text;
  status_lc text;
  confirmed boolean;
  purpose text;
  buyer_id uuid;
  plan_key text;
  plan_title text;
  plan_price numeric;
  units int;
  total numeric;
  lot_id text;
  lot jsonb;
  start_at timestamptz;
  end_at timestamptz;
  renew_until timestamptz;
  renew_tx_id text;
  old_lot_id text;
  new_lot jsonb;
  te_base numeric;
  ref1 uuid;
  ref2 uuid;
  ref3 uuid;
  rec_level int;
  rec_id uuid;
  rec_pct numeric;
  rec_amount numeric;
  rec_ext_id text;
  rec_type text;
  rec_meta jsonb;
begin
  select * into dep
  from public.find_nowpayments_deposit(payment_id, invoice_id, order_id);

  if dep.id is null then
    return jsonb_build_object('ok', true, 'matched', false, 'reason', 'deposit_not_found');
  end if;

  status_lc := lower(coalesce(payment_status, raw_event->>'payment_status', ''));
  confirmed := status_lc in ('finished', 'confirmed', 'sending', 'partially_paid');

  update public.transactions t
  set payment = coalesce(t.payment, 'NOWPayments'),
      status = case when confirmed then 'Concluído' else coalesce(t.status, 'Pendente') end,
      meta =
        jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(t.meta, '{}'::jsonb), '{meta,paymentId}', to_jsonb(nullif(btrim(coalesce(payment_id, raw_event->>'payment_id', '')), '')), true),
            '{meta,invoiceId}', to_jsonb(nullif(btrim(coalesce(invoice_id, raw_event->>'invoice_id', '')), '')), true
          ),
          '{meta,orderId}', to_jsonb(nullif(btrim(coalesce(order_id, raw_event->>'order_id', '')), '')), true
        ),
      at = coalesce(t.at, now())
  where t.id = dep.id;

  if not confirmed then
    return jsonb_build_object('ok', true, 'matched', true, 'confirmed', false);
  end if;

  now_ts := now();
  now_iso := now_ts::text;
  purpose := upper(coalesce(dep.meta #>> '{meta,purpose}', ''));
  buyer_id := dep.profile_id;

  if purpose = 'RENEW' then
    renew_tx_id := dep.meta #>> '{meta,renewTxId}';
    old_lot_id := dep.meta #>> '{meta,oldLotId}';
    new_lot := dep.meta #> '{meta,newLot}';

    if buyer_id is null or old_lot_id is null or new_lot is null then
      return jsonb_build_object('ok', true, 'applied', false, 'reason', 'renew_payload_invalid');
    end if;

    update public.transactions t
    set status = 'Concluído',
        payment = coalesce(dep.payment, 'NOWPayments'),
        meta = jsonb_set(coalesce(t.meta, '{}'::jsonb), '{meta,settledAt}', to_jsonb(now_iso), true),
        at = coalesce(t.at, now_ts)
    where t.profile_id = buyer_id
      and t.external_id = renew_tx_id;

    update public.profiles p
    set balances =
          jsonb_set(
            jsonb_set(coalesce(p.balances, '{}'::jsonb), '{invested}', to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + coalesce(dep.amount_usd, 0)), true),
            '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0)), true
          ),
        quota_lots = (
          select coalesce(jsonb_agg(elem) filter (where elem->>'id' <> old_lot_id), '[]'::jsonb)
          from jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) elem
        ) || jsonb_build_array(coalesce(new_lot, '{}'::jsonb)),
        updated_at = now_ts
    where p.id = buyer_id;

    return jsonb_build_object('ok', true, 'matched', true, 'confirmed', true, 'applied', true, 'reason', 'renew_applied');
  end if;

  if purpose <> 'PURCHASE' then
    return jsonb_build_object('ok', true, 'applied', true, 'reason', 'deposit_only');
  end if;

  plan_key := coalesce(dep.meta #>> '{meta,planKey}', '');
  plan_title := coalesce(dep.meta #>> '{meta,planTitle}', '');
  plan_price := coalesce(nullif(dep.meta #>> '{meta,planPrice}', '')::numeric, 0);
  units := greatest(1, coalesce(nullif(dep.meta #>> '{meta,units}', '')::int, 1));
  total := round(plan_price * units, 2);

  start_at := now_ts;
  end_at := start_at + make_interval(months => 6);
  renew_until := end_at + make_interval(hours => 72);
  lot_id := gen_random_uuid()::text;
  lot := jsonb_build_object(
    'id', lot_id,
    'planKey', plan_key,
    'planTitle', plan_title,
    'units', units,
    'planPrice', plan_price,
    'quotasPerUnit', coalesce(nullif(dep.meta #>> '{meta,quotasPerUnit}', '')::numeric, 0),
    'startAt', start_at,
    'endAt', end_at,
    'renewUntil', renew_until,
    'status', 'ACTIVE',
    'settledAt', now_iso,
    'cancelRequestedAt', null,
    'cancelPayAt', null,
    'cancelPenaltyPct', null,
    'cancelAmount', null,
    'bankId', dep.meta #>> '{meta,bankId}',
    'bankName', dep.meta #>> '{meta,bankName}',
    'source', jsonb_build_object(
      'provider', 'NOWPAYMENTS',
      'paymentId', dep.meta #>> '{meta,paymentId}',
      'invoiceId', dep.meta #>> '{meta,invoiceId}',
      'orderId', dep.meta #>> '{meta,orderId}',
      'depositTxId', dep.external_id
    )
  );

  update public.profiles p
  set holdings = jsonb_set(
        coalesce(p.holdings, '{}'::jsonb),
        array[plan_key],
        to_jsonb(coalesce(nullif(p.holdings->>plan_key, '')::numeric, 0) + units),
        true
      ),
      balances =
        jsonb_set(
          jsonb_set(coalesce(p.balances, '{}'::jsonb), '{invested}', to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + total), true),
          '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0)), true
        ),
      quota_lots = coalesce(p.quota_lots, '[]'::jsonb) || jsonb_build_array(lot),
      updated_at = now_ts
  where p.id = buyer_id;

  update public.transactions t
  set status = 'Concluído',
      payment = coalesce(dep.payment, 'NOWPayments'),
      meta = jsonb_set(coalesce(t.meta, '{}'::jsonb), '{meta,settledAt}', to_jsonb(now_iso), true),
      at = coalesce(t.at, now_ts)
  where t.profile_id = buyer_id
    and t.external_id = coalesce(dep.meta #>> '{meta,purchaseTxId}', '');

  te_base := round(total * 0.1, 2);
  select tn.referrer_profile_id into ref1 from public.team_nodes tn where tn.profile_id = buyer_id;
  if ref1 is not null then
    select tn.referrer_profile_id into ref2 from public.team_nodes tn where tn.profile_id = ref1;
  end if;
  if ref2 is not null then
    select tn.referrer_profile_id into ref3 from public.team_nodes tn where tn.profile_id = ref2;
  end if;

  for rec_level, rec_id, rec_pct in
    select * from (values
      (1, ref1, 0.4::numeric),
      (2, ref2, 0.2::numeric),
      (3, ref3, 0.1::numeric)
    ) as x(level, id, pct)
  loop
    if rec_id is null then
      continue;
    end if;

    rec_amount := round(te_base * rec_pct, 2);
    if rec_amount <= 0 then
      continue;
    end if;

    rec_ext_id := dep.external_id || '-te-L' || rec_level::text || '-' || rec_id::text;
    rec_type := 'Ganho de Rede (TE) - Nível ' || rec_level::text;
    rec_meta := jsonb_build_object('buyerId', buyer_id, 'purchaseId', dep.external_id, 'level', rec_level, 'pct', rec_pct);

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      rec_id,
      rec_ext_id,
      'TE',
      rec_type,
      rec_amount,
      'SISTEMA',
      'Creditado',
      jsonb_build_object(
        'id', rec_ext_id,
        'at', now_iso,
        'kind', 'TE',
        'type', rec_type,
        'amount', rec_amount,
        'payment', 'SISTEMA',
        'status', 'Creditado',
        'meta', rec_meta
      ),
      now_ts
    )
    on conflict (profile_id, external_id)
    do update set
      amount_usd = excluded.amount_usd,
      status = excluded.status,
      meta = excluded.meta,
      at = excluded.at;

    update public.profiles p
    set balances =
          jsonb_set(
            jsonb_set(
              jsonb_set(coalesce(p.balances, '{}'::jsonb), '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + rec_amount), true),
              '{teamEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teamEarnings', '')::numeric, 0) + rec_amount), true
            ),
            '{teEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teEarnings', '')::numeric, 0) + rec_amount), true
          ),
          updated_at = now_ts
    where p.id = rec_id;
  end loop;

  return jsonb_build_object('ok', true, 'matched', true, 'confirmed', true, 'applied', true);
end;
$$;

create or replace function public.create_purchase(
  plan_key text,
  units int,
  payment_currency text,
  payment_network text default null,
  payment_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.create_purchase(
    plan_key := plan_key,
    units := units,
    payment_currency := payment_currency,
    payment_network := payment_network,
    payment_id := payment_id,
    invoice_id := null,
    order_id := null,
    bank_id := null
  );
end;
$$;

revoke all on table public.daily_payout_overrides from public;
revoke all on table public.daily_payout_override_events from public;
revoke all on function public.get_base_daily_pct(text) from public;
revoke all on function public._expire_stale_daily_payout_overrides(date) from public;
revoke all on function public.admin_upsert_daily_payout_override(text, date, numeric, text) from public;
revoke all on function public.admin_cancel_daily_payout_override(uuid, text) from public;
revoke all on function public.admin_list_daily_payout_overrides(text, text, int) from public;
revoke all on function public.admin_list_daily_payout_override_events(uuid, text, int) from public;
revoke all on function public.create_purchase(text, int, text, text, text, text, text, text) from public;

grant select on public.daily_payout_overrides to authenticated;
grant select on public.daily_payout_override_events to authenticated;
grant execute on function public.get_base_daily_pct(text) to authenticated;
grant execute on function public.admin_upsert_daily_payout_override(text, date, numeric, text) to authenticated;
grant execute on function public.admin_cancel_daily_payout_override(uuid, text) to authenticated;
grant execute on function public.admin_list_daily_payout_overrides(text, text, int) to authenticated;
grant execute on function public.admin_list_daily_payout_override_events(uuid, text, int) to authenticated;
grant execute on function public.create_purchase(text, int, text, text, text, text, text, text) to authenticated;
