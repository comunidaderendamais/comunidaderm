create or replace function public.is_username_available(desired_username text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles p
    where lower(p.username) = lower(nullif(desired_username, ''))
  );
$$;

create or replace function public.is_email_available(desired_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select not exists (
    select 1
    from public.profiles p
    where lower(p.email) = lower(nullif(desired_email, ''))
  );
$$;

create or replace function public.get_referrer_profile(desired_username text)
returns table (id uuid, username text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.username
  from public.profiles p
  where lower(p.username) = lower(nullif(desired_username, ''))
  limit 1;
$$;

revoke all on function public.is_username_available(text) from public;
revoke all on function public.is_email_available(text) from public;
revoke all on function public.get_referrer_profile(text) from public;

grant execute on function public.is_username_available(text) to authenticated;
grant execute on function public.is_email_available(text) to authenticated;
grant execute on function public.get_referrer_profile(text) to authenticated;
