do $$
begin
  if exists (
    select 1
    from public.transactions
    where external_id is not null
    group by profile_id, external_id
    having count(*) > 1
  ) then
    raise exception 'duplicate_transactions_profile_external_id';
  end if;
end
$$;

drop index if exists public.transactions_profile_external_id_uniq;

create unique index if not exists transactions_profile_external_id_uniq
on public.transactions (profile_id, external_id);
