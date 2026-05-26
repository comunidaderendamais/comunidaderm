create or replace function public.get_elite_candidates()
returns table(
  id uuid,
  email text,
  username text,
  rank_key text,
  elite jsonb,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select
    p.id,
    p.email,
    p.username,
    upper(coalesce(p.rank_key, '')) as rank_key,
    coalesce(p.elite, '{}'::jsonb) as elite,
    p.created_at,
    p.updated_at
  from public.profiles p
  where upper(coalesce(p.rank_key, '')) in ('SILVER', 'OURO', 'DIAMOND', 'RM')
  order by p.created_at asc, p.email asc;
$$;

revoke all on function public.get_elite_candidates() from public;
grant execute on function public.get_elite_candidates() to authenticated;
