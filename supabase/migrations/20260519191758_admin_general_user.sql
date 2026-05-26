alter table public.profiles
add column if not exists is_admin boolean not null default false;

create or replace function public.is_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) = 'comunidaderendamais@gmail.com';
$$;

drop policy if exists profiles_select_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_select_own_or_admin
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.is_admin());

create policy profiles_update_own_or_admin
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

drop policy if exists wallets_select_own on public.wallets;
drop policy if exists wallets_update_own on public.wallets;
drop policy if exists wallets_insert_own on public.wallets;

create policy wallets_select_own_or_admin
on public.wallets
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy wallets_update_own_or_admin
on public.wallets
for update
to authenticated
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

create policy wallets_insert_own_or_admin
on public.wallets
for insert
to authenticated
with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists team_nodes_select_own on public.team_nodes;
drop policy if exists team_nodes_update_own on public.team_nodes;
drop policy if exists team_nodes_insert_own on public.team_nodes;

create policy team_nodes_select_own_or_admin
on public.team_nodes
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy team_nodes_update_own_or_admin
on public.team_nodes
for update
to authenticated
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

create policy team_nodes_insert_own_or_admin
on public.team_nodes
for insert
to authenticated
with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists transactions_select_own on public.transactions;
drop policy if exists transactions_insert_own on public.transactions;
drop policy if exists transactions_update_own on public.transactions;

create policy transactions_select_own_or_admin
on public.transactions
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy transactions_insert_own_or_admin
on public.transactions
for insert
to authenticated
with check (profile_id = auth.uid() or public.is_admin());

create policy transactions_update_own_or_admin
on public.transactions
for update
to authenticated
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta jsonb;
  desired_username text;
  desired_referrer_username text;
  ref_id uuid;
  admin_email text;
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  desired_username := nullif(lower(meta->>'username'), '');
  desired_referrer_username := nullif(lower(meta->>'referrerUsername'), '');
  admin_email := 'comunidaderendamais@gmail.com';

  if desired_referrer_username is not null then
    select id into ref_id
    from public.profiles
    where username = desired_referrer_username
    limit 1;
  end if;

  insert into public.profiles (id, email, username, name, country, whatsapp, referrer_username, is_admin)
  values (
    new.id,
    lower(new.email),
    desired_username,
    nullif(meta->>'name', ''),
    coalesce(nullif(meta->>'country', ''), 'Brasil'),
    nullif(meta->>'whatsapp', ''),
    desired_referrer_username,
    lower(new.email) = admin_email
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(public.profiles.username, excluded.username),
        name = coalesce(public.profiles.name, excluded.name),
        country = coalesce(public.profiles.country, excluded.country),
        whatsapp = coalesce(public.profiles.whatsapp, excluded.whatsapp),
        referrer_username = coalesce(public.profiles.referrer_username, excluded.referrer_username),
        is_admin = public.profiles.is_admin or excluded.is_admin,
        updated_at = now();

  insert into public.wallets (profile_id)
  values (new.id)
  on conflict (profile_id) do nothing;

  insert into public.team_nodes (profile_id, referrer_profile_id, referrer_username)
  values (new.id, ref_id, desired_referrer_username)
  on conflict (profile_id) do update
    set referrer_profile_id = excluded.referrer_profile_id,
        referrer_username = excluded.referrer_username,
        updated_at = now();

  return new;
end;
$$;

update public.profiles
set is_admin = true
where lower(email) = 'comunidaderendamais@gmail.com';
