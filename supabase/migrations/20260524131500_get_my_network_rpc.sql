create or replace function public.get_my_network(max_depth int default 5, only_active boolean default true)
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
    where tn.referrer_profile_id = auth.uid()
    union all
    select d.level + 1, p2.id, p2.email, p2.username, p2.user_id, p2.balances, p2.holdings, p2.rank_key, p2.created_at
    from downline d
    join public.team_nodes tn2 on tn2.referrer_profile_id = d.id
    join public.profiles p2 on p2.id = tn2.profile_id
    where d.level < greatest(1, least(max_depth, 10))
  )
  select
    level,
    id,
    email,
    username,
    user_id,
    balances,
    holdings,
    rank_key,
    created_at
  from downline
  where not only_active
     or coalesce(nullif(balances->>'invested', '')::numeric, 0) > 0
     or (
       coalesce(nullif(holdings->>'cota10', '')::numeric, 0)
       + coalesce(nullif(holdings->>'cota50', '')::numeric, 0)
       + coalesce(nullif(holdings->>'cota100', '')::numeric, 0)
     ) > 0;
$$;

revoke all on function public.get_my_network(int, boolean) from public;
grant execute on function public.get_my_network(int, boolean) to authenticated;
