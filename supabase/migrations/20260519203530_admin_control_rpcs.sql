alter table public.profiles
add column if not exists elite jsonb not null default '{}'::jsonb,
add column if not exists blocked boolean not null default false;

create or replace function public.admin_get_user_state(target_id uuid, max_transactions int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  p jsonb;
  w jsonb;
  tx jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  select to_jsonb(pr) into p
  from public.profiles pr
  where pr.id = target_id;

  select to_jsonb(wa) into w
  from public.wallets wa
  where wa.profile_id = target_id;

  select coalesce(jsonb_agg(to_jsonb(t) order by coalesce(t.at, t.created_at) desc), '[]'::jsonb) into tx
  from (
    select
      id,
      profile_id,
      external_id,
      kind,
      type,
      amount_usd,
      payment,
      status,
      meta,
      coalesce(at, created_at) as at,
      created_at
    from public.transactions
    where profile_id = target_id
    order by coalesce(at, created_at) desc
    limit greatest(0, least(max_transactions, 2000))
  ) t;

  return jsonb_build_object(
    'profile', p,
    'wallets', w,
    'transactions', tx
  );
end;
$$;

create or replace function public.admin_upsert_user_state(target_id uuid, payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next_balances jsonb;
  next_holdings jsonb;
  next_team_state jsonb;
  next_rank_key text;
  next_user_id text;
  next_quota_lots jsonb;
  next_elite jsonb;
  next_blocked boolean;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  next_balances := coalesce(payload->'balances', '{}'::jsonb);
  next_holdings := coalesce(payload->'holdings', '{}'::jsonb);
  next_team_state := coalesce(payload->'team_state', '{}'::jsonb);
  next_quota_lots := coalesce(payload->'quota_lots', '[]'::jsonb);
  next_elite := coalesce(payload->'elite', '{}'::jsonb);
  next_rank_key := nullif(payload->>'rank_key', '');
  next_user_id := nullif(payload->>'user_id', '');
  next_blocked := coalesce((payload->>'blocked')::boolean, false);

  update public.profiles
  set balances = next_balances,
      holdings = next_holdings,
      team_state = next_team_state,
      quota_lots = next_quota_lots,
      elite = next_elite,
      rank_key = coalesce(next_rank_key, rank_key),
      user_id = coalesce(user_id, next_user_id),
      blocked = next_blocked,
      updated_at = now()
  where id = target_id;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_upsert_user_transactions(target_id uuid, items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  elem jsonb;
  ext_id text;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if jsonb_typeof(items) <> 'array' then
    raise exception 'items_must_be_array';
  end if;

  for elem in select * from jsonb_array_elements(items)
  loop
    ext_id := nullif(elem->>'id', '');
    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      target_id,
      ext_id,
      nullif(elem->>'kind', ''),
      nullif(elem->>'type', ''),
      coalesce((elem->>'amount')::numeric, 0),
      nullif(elem->>'payment', ''),
      coalesce(nullif(elem->>'status', ''), 'created'),
      elem,
      nullif(elem->>'at', '')::timestamptz
    )
    on conflict (profile_id, external_id)
    do update set
      kind = excluded.kind,
      type = excluded.type,
      amount_usd = excluded.amount_usd,
      payment = excluded.payment,
      status = excluded.status,
      meta = excluded.meta,
      at = excluded.at;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_list_transactions(kind_filter text default null, q text default '', max_rows int default 200)
returns table(
  id uuid,
  profile_id uuid,
  external_id text,
  kind text,
  type text,
  amount_usd numeric,
  payment text,
  status text,
  meta jsonb,
  at timestamptz,
  created_at timestamptz,
  email text,
  username text,
  user_id text,
  blocked boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select
    t.id,
    t.profile_id,
    t.external_id,
    t.kind,
    t.type,
    t.amount_usd,
    t.payment,
    t.status,
    t.meta,
    coalesce(t.at, t.created_at) as at,
    t.created_at,
    p.email,
    p.username,
    p.user_id,
    p.blocked
  from public.transactions t
  join public.profiles p on p.id = t.profile_id
  where public.is_admin()
    and (kind_filter is null or kind_filter = '' or t.kind = kind_filter)
    and (
      q is null
      or q = ''
      or lower(p.email) like '%' || lower(q) || '%'
      or lower(p.username) like '%' || lower(q) || '%'
      or lower(coalesce(p.user_id, '')) like '%' || lower(q) || '%'
      or lower(p.id::text) like '%' || lower(q) || '%'
      or lower(coalesce(t.external_id, '')) like '%' || lower(q) || '%'
    )
  order by coalesce(t.at, t.created_at) desc
  limit greatest(1, least(max_rows, 500));
$$;

create or replace function public.admin_set_blocked(target_id uuid, blocked_value boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  update public.profiles
  set blocked = coalesce(blocked_value, false),
      updated_at = now()
  where id = target_id;

  return jsonb_build_object('ok', true);
end;
$$;

drop function if exists public.admin_search_users(text, int);

create or replace function public.admin_search_users(q text default '', max_rows int default 50)
returns table(
  id uuid,
  email text,
  username text,
  user_id text,
  is_admin boolean,
  blocked boolean,
  created_at timestamptz,
  updated_at timestamptz,
  balances jsonb,
  holdings jsonb,
  quota_lots jsonb,
  elite jsonb,
  rank_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.username, p.user_id, p.is_admin, p.blocked, p.created_at, p.updated_at, p.balances, p.holdings, p.quota_lots, p.elite, p.rank_key
  from public.profiles p
  where public.is_admin()
    and (
      q is null
      or q = ''
      or lower(p.email) like '%' || lower(q) || '%'
      or lower(p.username) like '%' || lower(q) || '%'
      or lower(coalesce(p.user_id, '')) like '%' || lower(q) || '%'
      or lower(p.id::text) like '%' || lower(q) || '%'
    )
  order by p.created_at desc
  limit greatest(1, least(max_rows, 200));
$$;

revoke all on function public.admin_get_user_state(uuid, int) from public;
revoke all on function public.admin_upsert_user_state(uuid, jsonb) from public;
revoke all on function public.admin_upsert_user_transactions(uuid, jsonb) from public;
revoke all on function public.admin_list_transactions(text, text, int) from public;
revoke all on function public.admin_set_blocked(uuid, boolean) from public;
revoke all on function public.admin_search_users(text, int) from public;

grant execute on function public.admin_get_user_state(uuid, int) to authenticated;
grant execute on function public.admin_upsert_user_state(uuid, jsonb) to authenticated;
grant execute on function public.admin_upsert_user_transactions(uuid, jsonb) to authenticated;
grant execute on function public.admin_list_transactions(text, text, int) to authenticated;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;
grant execute on function public.admin_search_users(text, int) to authenticated;
