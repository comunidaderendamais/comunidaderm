create table if not exists public.elite_payout_batches (
  id uuid primary key default gen_random_uuid(),
  run_at timestamptz not null,
  mode text not null default 'MANUAL',
  profit_usd numeric(12,2) not null default 0,
  pool_usd numeric(12,2) not null default 0,
  total_paid_usd numeric(12,2) not null default 0,
  triggered_by uuid references public.profiles(id) on delete set null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.elite_payout_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.elite_payout_batches(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  category text not null,
  slot_no int not null,
  amount_usd numeric(12,2) not null default 0,
  achieved_at timestamptz null,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (batch_id, profile_id),
  unique (batch_id, category, slot_no)
);

alter table public.elite_payout_batches enable row level security;
alter table public.elite_payout_items enable row level security;

drop policy if exists elite_payout_batches_admin_select on public.elite_payout_batches;
create policy elite_payout_batches_admin_select
on public.elite_payout_batches
for select
to authenticated
using (public.is_admin());

drop policy if exists elite_payout_items_admin_select on public.elite_payout_items;
create policy elite_payout_items_admin_select
on public.elite_payout_items
for select
to authenticated
using (public.is_admin() or profile_id = auth.uid());

create or replace function public._elite_cat_index(cat text)
returns int
language sql
immutable
as $$
  select case upper(coalesce(cat, ''))
    when 'SILVER' then 1
    when 'OURO' then 2
    when 'DIAMOND' then 3
    when 'RM' then 4
    else 0
  end
$$;

create or replace function public._process_elite_payout(
  run_at timestamptz default now(),
  profit_usd numeric default null,
  mode_value text default 'MANUAL',
  triggered_by_value uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  elite_cfg jsonb;
  effective_profit numeric(12,2);
  pool_usd_value numeric(12,2);
  batch_id uuid;
  total_paid_value numeric(12,2) := 0;
  payout_cat text;
  payout_slots int;
  payout_pct numeric(12,4);
  slot_idx int;
  cand record;
  item record;
  tx_ext_id text;
  tx_type text;
  run_iso text := coalesce(run_at, now())::text;
  existing_batch_id uuid;
begin
  select config into cfg
  from public.app_config
  where id = 1;

  elite_cfg := coalesce(cfg->'elite', '{}'::jsonb);
  effective_profit := round(
    coalesce(
      profit_usd,
      nullif(elite_cfg->>'profitQuinzenal', '')::numeric,
      nullif(elite_cfg->>'fortnightProfitUsd', '')::numeric,
      0
    ),
    2
  );
  pool_usd_value := round(effective_profit * 0.1, 2);

  if effective_profit <= 0 or pool_usd_value <= 0 then
    return jsonb_build_object('ok', true, 'processed', false, 'reason', 'elite_pool_empty');
  end if;

  select b.id
  into existing_batch_id
  from public.elite_payout_batches b
  where date_trunc('day', b.run_at) = date_trunc('day', run_at)
  order by b.run_at desc
  limit 1;

  if existing_batch_id is not null then
    return jsonb_build_object('ok', true, 'processed', false, 'reason', 'already_processed_for_day', 'batchId', existing_batch_id);
  end if;

  create temporary table _elite_candidates (
    profile_id uuid primary key,
    email text,
    username text,
    rank_key text,
    max_cat text,
    silver_at timestamptz,
    ouro_at timestamptz,
    diamond_at timestamptz,
    rm_at timestamptz
  ) on commit drop;

  insert into _elite_candidates (profile_id, email, username, rank_key, max_cat, silver_at, ouro_at, diamond_at, rm_at)
  select
    p.id,
    p.email,
    p.username,
    upper(coalesce(p.rank_key, '')) as rank_key,
    case upper(coalesce(p.rank_key, ''))
      when 'RM' then 'RM'
      when 'DIAMOND' then 'DIAMOND'
      when 'OURO' then 'OURO'
      when 'SILVER' then 'SILVER'
      else null
    end as max_cat,
    coalesce(nullif(p.elite #>> '{achievedAt,SILVER}', '')::timestamptz, p.created_at, p.updated_at),
    coalesce(nullif(p.elite #>> '{achievedAt,OURO}', '')::timestamptz, p.created_at, p.updated_at),
    coalesce(nullif(p.elite #>> '{achievedAt,DIAMOND}', '')::timestamptz, p.created_at, p.updated_at),
    coalesce(nullif(p.elite #>> '{achievedAt,RM}', '')::timestamptz, p.created_at, p.updated_at)
  from public.profiles p
  where upper(coalesce(p.rank_key, '')) in ('SILVER', 'OURO', 'DIAMOND', 'RM');

  create temporary table _elite_assignments (
    profile_id uuid primary key,
    email text,
    username text,
    rank_key text,
    category text,
    slot_no int,
    achieved_at timestamptz,
    amount_usd numeric(12,2)
  ) on commit drop;

  foreach payout_cat in array array['RM', 'DIAMOND', 'OURO', 'SILVER']
  loop
    payout_slots := case payout_cat
      when 'RM' then 2
      when 'DIAMOND' then 2
      when 'OURO' then 2
      else 4
    end;

    payout_pct := case payout_cat
      when 'RM' then 0.15
      when 'DIAMOND' then 0.15
      when 'OURO' then 0.10
      else 0.05
    end;

    for slot_idx in 1..payout_slots loop
      select
        c.profile_id,
        c.email,
        c.username,
        c.rank_key,
        case payout_cat
          when 'RM' then c.rm_at
          when 'DIAMOND' then c.diamond_at
          when 'OURO' then c.ouro_at
          else c.silver_at
        end as achieved_at
      into cand
      from _elite_candidates c
      where public._elite_cat_index(c.max_cat) >= public._elite_cat_index(payout_cat)
        and not exists (
          select 1
          from _elite_assignments a
          where a.profile_id = c.profile_id
        )
      order by
        case payout_cat
          when 'RM' then c.rm_at
          when 'DIAMOND' then c.diamond_at
          when 'OURO' then c.ouro_at
          else c.silver_at
        end asc,
        lower(coalesce(c.email, '')) asc
      limit 1;

      if cand.profile_id is null then
        continue;
      end if;

      insert into _elite_assignments (profile_id, email, username, rank_key, category, slot_no, achieved_at, amount_usd)
      values (
        cand.profile_id,
        cand.email,
        cand.username,
        cand.rank_key,
        payout_cat,
        slot_idx,
        cand.achieved_at,
        round(pool_usd_value * payout_pct, 2)
      );
    end loop;
  end loop;

  select round(coalesce(sum(amount_usd), 0), 2)
  into total_paid_value
  from _elite_assignments;

  insert into public.elite_payout_batches (run_at, mode, profit_usd, pool_usd, total_paid_usd, triggered_by, meta)
  values (
    run_at,
    upper(coalesce(mode_value, 'MANUAL')),
    effective_profit,
    pool_usd_value,
    total_paid_value,
    triggered_by_value,
    jsonb_build_object(
      'assignments', coalesce((select count(*) from _elite_assignments), 0),
      'unassignedPoolUsd', round(pool_usd_value - total_paid_value, 2)
    )
  )
  returning id into batch_id;

  for item in
    select *
    from _elite_assignments
    order by public._elite_cat_index(category) desc, slot_no asc, achieved_at asc
  loop
    insert into public.elite_payout_items (batch_id, profile_id, category, slot_no, amount_usd, achieved_at, meta)
    values (
      batch_id,
      item.profile_id,
      item.category,
      item.slot_no,
      item.amount_usd,
      item.achieved_at,
      jsonb_build_object(
        'username', item.username,
        'email', item.email,
        'rankKey', item.rank_key
      )
    );

    tx_ext_id := batch_id::text || '-elite-' || item.category || '-' || item.slot_no::text || '-' || item.profile_id::text;
    tx_type := 'Bolsão Elite (' || item.category || ')';

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      item.profile_id,
      tx_ext_id,
      'ELITE',
      tx_type,
      item.amount_usd,
      'SISTEMA',
      'Creditado',
      jsonb_build_object(
        'id', tx_ext_id,
        'at', run_iso,
        'kind', 'ELITE',
        'type', tx_type,
        'amount', item.amount_usd,
        'payment', 'SISTEMA',
        'status', 'Creditado',
        'meta', jsonb_build_object(
          'batchId', batch_id,
          'category', item.category,
          'slotNo', item.slot_no,
          'profitUsd', effective_profit,
          'poolUsd', pool_usd_value
        )
      ),
      run_at
    )
    on conflict (profile_id, external_id) do nothing;

    update public.profiles p
    set balances =
          jsonb_set(
            jsonb_set(
              coalesce(p.balances, '{}'::jsonb),
              '{available}',
              to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + item.amount_usd),
              true
            ),
            '{eliteEarnings}',
            to_jsonb(coalesce(nullif(p.balances->>'eliteEarnings', '')::numeric, 0) + item.amount_usd),
            true
          ),
        updated_at = now()
    where p.id = item.profile_id;

    insert into public.notifications (profile_id, kind, ref, payload)
    values (
      item.profile_id,
      'ELITE',
      tx_ext_id,
      jsonb_build_object(
        'title', 'Bolsão Elite creditado',
        'message', 'Você recebeu ' || item.amount_usd::text || ' USD (' || item.category || ').',
        'i18n', jsonb_build_object(
          'key', 'eliteCredited',
          'params', jsonb_build_object('amount', item.amount_usd, 'cat', item.category)
        ),
        'batchId', batch_id,
        'category', item.category
      )
    )
    on conflict do nothing;
  end loop;

  update public.app_config
  set config =
        coalesce(config, '{}'::jsonb) ||
        jsonb_build_object(
          'elite',
          coalesce(config->'elite', '{}'::jsonb) ||
          jsonb_build_object(
            'profitQuinzenal', effective_profit,
            'fortnightProfitUsd', effective_profit,
            'lastPaidAt', to_jsonb(run_at),
            'lastBatchId', batch_id
          )
        )
  where id = 1;

  return jsonb_build_object(
    'ok', true,
    'processed', true,
    'batchId', batch_id,
    'runAt', run_at,
    'profitUsd', effective_profit,
    'poolUsd', pool_usd_value,
    'totalPaidUsd', total_paid_value,
    'itemsCount', coalesce((select count(*) from _elite_assignments), 0)
  );
end;
$$;

create or replace function public.admin_process_elite_payout(
  profit_usd numeric default null,
  run_at timestamptz default now(),
  mode_value text default 'MANUAL'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return public._process_elite_payout(run_at, profit_usd, mode_value, auth.uid());
end;
$$;

create or replace function public.process_due_elite_payouts(run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg jsonb;
  elite_cfg jsonb;
  last_paid timestamptz;
  next_due timestamptz;
  profit_value numeric;
begin
  select config into cfg
  from public.app_config
  where id = 1;

  elite_cfg := coalesce(cfg->'elite', '{}'::jsonb);
  last_paid := nullif(elite_cfg->>'lastPaidAt', '')::timestamptz;
  next_due := case when last_paid is null then null else last_paid + interval '15 days' end;
  profit_value := coalesce(
    nullif(elite_cfg->>'profitQuinzenal', '')::numeric,
    nullif(elite_cfg->>'fortnightProfitUsd', '')::numeric,
    0
  );

  if profit_value <= 0 then
    return jsonb_build_object('ok', true, 'processed', false, 'reason', 'elite_pool_empty');
  end if;

  if next_due is not null and run_at < next_due then
    return jsonb_build_object('ok', true, 'processed', false, 'reason', 'not_due', 'nextDueAt', next_due);
  end if;

  return public._process_elite_payout(run_at, profit_value, 'AUTO', null);
end;
$$;

create or replace function public.admin_list_elite_payout_batches(max_rows int default 20)
returns table(
  id uuid,
  run_at timestamptz,
  mode text,
  profit_usd numeric,
  pool_usd numeric,
  total_paid_usd numeric,
  items_count bigint,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    b.id,
    b.run_at,
    b.mode,
    b.profit_usd,
    b.pool_usd,
    b.total_paid_usd,
    count(i.id) as items_count,
    b.created_at
  from public.elite_payout_batches b
  left join public.elite_payout_items i on i.batch_id = b.id
  where public.is_admin()
  group by b.id
  order by b.run_at desc
  limit greatest(1, least(coalesce(max_rows, 20), 100));
$$;

create or replace function public.admin_list_elite_payout_items(target_batch_id uuid)
returns table(
  id uuid,
  batch_id uuid,
  profile_id uuid,
  email text,
  username text,
  category text,
  slot_no int,
  amount_usd numeric,
  achieved_at timestamptz,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    i.id,
    i.batch_id,
    i.profile_id,
    p.email,
    p.username,
    i.category,
    i.slot_no,
    i.amount_usd,
    i.achieved_at,
    i.created_at
  from public.elite_payout_items i
  join public.profiles p on p.id = i.profile_id
  where public.is_admin()
    and i.batch_id = target_batch_id
  order by public._elite_cat_index(i.category) desc, i.slot_no asc, i.amount_usd desc;
$$;

create or replace function public.admin_settle_nowpayments_payment(
  payment_id text,
  payment_status text,
  raw_event jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden';
  end if;

  return public.process_nowpayments_payment(payment_id, payment_status, raw_event);
end;
$$;

create or replace function public.confirm_my_nowpayments_payment(
  payment_id text,
  payment_status text,
  raw_event jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dep_owner uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select t.profile_id
  into dep_owner
  from public.transactions t
  where t.kind = 'DEPOSITO'
    and (t.meta #>> '{meta,paymentId}') = payment_id
  order by coalesce(t.at, t.created_at) desc
  limit 1;

  if dep_owner is null then
    raise exception 'deposit_not_found';
  end if;

  if dep_owner <> auth.uid() then
    raise exception 'forbidden';
  end if;

  return public.process_nowpayments_payment(payment_id, payment_status, raw_event);
end;
$$;

revoke all on function public._elite_cat_index(text) from public;
revoke all on function public._process_elite_payout(timestamptz, numeric, text, uuid) from public;
revoke all on function public.admin_process_elite_payout(numeric, timestamptz, text) from public;
revoke all on function public.process_due_elite_payouts(timestamptz) from public;
revoke all on function public.admin_list_elite_payout_batches(int) from public;
revoke all on function public.admin_list_elite_payout_items(uuid) from public;
revoke all on function public.admin_settle_nowpayments_payment(text, text, jsonb) from public;
revoke all on function public.confirm_my_nowpayments_payment(text, text, jsonb) from public;

grant execute on function public.admin_process_elite_payout(numeric, timestamptz, text) to authenticated;
grant execute on function public.process_due_elite_payouts(timestamptz) to service_role;
grant execute on function public.admin_list_elite_payout_batches(int) to authenticated;
grant execute on function public.admin_list_elite_payout_items(uuid) to authenticated;
grant execute on function public.admin_settle_nowpayments_payment(text, text, jsonb) to authenticated;
grant execute on function public.confirm_my_nowpayments_payment(text, text, jsonb) to authenticated;
