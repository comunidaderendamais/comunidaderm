alter table public.profiles
add column if not exists user_id text unique,
add column if not exists quota_lots jsonb not null default '[]'::jsonb;

alter table public.transactions
add column if not exists external_id text,
add column if not exists type text,
add column if not exists payment text,
add column if not exists at timestamptz;

create unique index if not exists transactions_profile_external_id_uniq
on public.transactions (profile_id, external_id)
where external_id is not null;

create index if not exists transactions_profile_at_idx
on public.transactions (profile_id, at desc nulls last);

create or replace function public.get_my_state(max_transactions int default 200)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  p jsonb;
  w jsonb;
  tx jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select to_jsonb(pr) into p
  from public.profiles pr
  where pr.id = uid;

  select to_jsonb(wa) into w
  from public.wallets wa
  where wa.profile_id = uid;

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
    where profile_id = uid
    order by coalesce(at, created_at) desc
    limit greatest(0, least(max_transactions, 1000))
  ) t;

  return jsonb_build_object(
    'profile', p,
    'wallets', w,
    'transactions', tx
  );
end;
$$;

revoke all on function public.get_my_state(int) from public;
grant execute on function public.get_my_state(int) to authenticated;

create or replace function public.upsert_my_state(payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  next_balances jsonb;
  next_holdings jsonb;
  next_team_state jsonb;
  next_rank_key text;
  next_user_id text;
  next_quota_lots jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  next_balances := coalesce(payload->'balances', '{}'::jsonb);
  next_holdings := coalesce(payload->'holdings', '{}'::jsonb);
  next_team_state := coalesce(payload->'team_state', '{}'::jsonb);
  next_quota_lots := coalesce(payload->'quota_lots', '[]'::jsonb);
  next_rank_key := nullif(payload->>'rank_key', '');
  next_user_id := nullif(payload->>'user_id', '');

  update public.profiles
  set balances = next_balances,
      holdings = next_holdings,
      team_state = next_team_state,
      quota_lots = next_quota_lots,
      rank_key = coalesce(next_rank_key, rank_key),
      user_id = coalesce(user_id, next_user_id),
      updated_at = now()
  where id = uid;

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.upsert_my_state(jsonb) from public;
grant execute on function public.upsert_my_state(jsonb) to authenticated;

create or replace function public.upsert_my_transactions(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  elem jsonb;
  ext_id text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if jsonb_typeof(items) <> 'array' then
    raise exception 'items_must_be_array';
  end if;

  for elem in select * from jsonb_array_elements(items)
  loop
    ext_id := nullif(elem->>'id', '');
    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      uid,
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

revoke all on function public.upsert_my_transactions(jsonb) from public;
grant execute on function public.upsert_my_transactions(jsonb) to authenticated;

create or replace function public.get_my_network(max_depth int default 5)
returns table(level int, id uuid, username text)
language sql
stable
security definer
set search_path = public
as $$
  with recursive downline as (
    select 1 as level, p.id, p.username
    from public.team_nodes tn
    join public.profiles p on p.id = tn.profile_id
    where tn.referrer_profile_id = auth.uid()
    union all
    select d.level + 1, p2.id, p2.username
    from downline d
    join public.team_nodes tn2 on tn2.referrer_profile_id = d.id
    join public.profiles p2 on p2.id = tn2.profile_id
    where d.level < greatest(1, least(max_depth, 10))
  )
  select level, id, username from downline;
$$;

revoke all on function public.get_my_network(int) from public;
grant execute on function public.get_my_network(int) to authenticated;

create or replace function public.admin_search_users(q text default '', max_rows int default 50)
returns table(
  id uuid,
  email text,
  username text,
  user_id text,
  is_admin boolean,
  created_at timestamptz,
  updated_at timestamptz,
  balances jsonb,
  holdings jsonb,
  quota_lots jsonb,
  rank_key text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.email, p.username, p.user_id, p.is_admin, p.created_at, p.updated_at, p.balances, p.holdings, p.quota_lots, p.rank_key
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

revoke all on function public.admin_search_users(text, int) from public;
grant execute on function public.admin_search_users(text, int) to authenticated;

create or replace function public.admin_get_user_network(root_id uuid, max_depth int default 5)
returns table(level int, id uuid, email text, username text, user_id text, balances jsonb, holdings jsonb, rank_key text, created_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with recursive downline as (
    select 1 as level, p.id, p.email, p.username, p.user_id, p.balances, p.holdings, p.rank_key, p.created_at
    from public.team_nodes tn
    join public.profiles p on p.id = tn.profile_id
    where public.is_admin() and tn.referrer_profile_id = root_id
    union all
    select d.level + 1, p2.id, p2.email, p2.username, p2.user_id, p2.balances, p2.holdings, p2.rank_key, p2.created_at
    from downline d
    join public.team_nodes tn2 on tn2.referrer_profile_id = d.id
    join public.profiles p2 on p2.id = tn2.profile_id
    where d.level < greatest(1, least(max_depth, 10))
  )
  select level, id, email, username, user_id, balances, holdings, rank_key, created_at from downline;
$$;

revoke all on function public.admin_get_user_network(uuid, int) from public;
grant execute on function public.admin_get_user_network(uuid, int) to authenticated;
