create or replace function public.get_public_stats()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'globalSold',
    coalesce(
      (
        select
          sum(
            coalesce(nullif(p.holdings->>'cota10','')::numeric,0) * 1 +
            coalesce(nullif(p.holdings->>'cota50','')::numeric,0) * 5 +
            coalesce(nullif(p.holdings->>'cota100','')::numeric,0) * 10
          )::numeric
        from public.profiles p
      ),
      0
    )
  );
$$;

revoke all on function public.get_public_stats() from public;
grant execute on function public.get_public_stats() to authenticated;
