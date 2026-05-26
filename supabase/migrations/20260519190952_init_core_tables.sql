create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique,
  username text unique,
  name text,
  country text not null default 'Brasil',
  whatsapp text,
  referrer_username text,
  balances jsonb not null default '{}'::jsonb,
  holdings jsonb not null default '{}'::jsonb,
  team_state jsonb not null default '{}'::jsonb,
  rank_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

alter table public.profiles enable row level security;

create policy profiles_select_own
on public.profiles
for select
to authenticated
using (id = auth.uid());

create policy profiles_update_own
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create table if not exists public.wallets (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  usdt_bep20 text,
  usdt_trc20 text,
  usdc_arbitrum text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger wallets_set_updated_at
before update on public.wallets
for each row
execute function public.set_updated_at();

alter table public.wallets enable row level security;

create policy wallets_select_own
on public.wallets
for select
to authenticated
using (profile_id = auth.uid());

create policy wallets_update_own
on public.wallets
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy wallets_insert_own
on public.wallets
for insert
to authenticated
with check (profile_id = auth.uid());

create table if not exists public.team_nodes (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  referrer_profile_id uuid references public.profiles(id) on delete set null,
  referrer_username text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_nodes_referrer_profile_id_idx on public.team_nodes (referrer_profile_id);

create trigger team_nodes_set_updated_at
before update on public.team_nodes
for each row
execute function public.set_updated_at();

alter table public.team_nodes enable row level security;

create policy team_nodes_select_own
on public.team_nodes
for select
to authenticated
using (profile_id = auth.uid());

create policy team_nodes_update_own
on public.team_nodes
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

create policy team_nodes_insert_own
on public.team_nodes
for insert
to authenticated
with check (profile_id = auth.uid());

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  amount_usd numeric(18, 2) not null default 0,
  status text not null default 'created',
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists transactions_profile_created_at_idx on public.transactions (profile_id, created_at desc);

alter table public.transactions enable row level security;

create policy transactions_select_own
on public.transactions
for select
to authenticated
using (profile_id = auth.uid());

create policy transactions_insert_own
on public.transactions
for insert
to authenticated
with check (profile_id = auth.uid());

create policy transactions_update_own
on public.transactions
for update
to authenticated
using (profile_id = auth.uid())
with check (profile_id = auth.uid());

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
begin
  meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  desired_username := nullif(lower(meta->>'username'), '');
  desired_referrer_username := nullif(lower(meta->>'referrerUsername'), '');

  if desired_referrer_username is not null then
    select id into ref_id
    from public.profiles
    where username = desired_referrer_username
    limit 1;
  end if;

  insert into public.profiles (id, email, username, name, country, whatsapp, referrer_username)
  values (
    new.id,
    lower(new.email),
    desired_username,
    nullif(meta->>'name', ''),
    coalesce(nullif(meta->>'country', ''), 'Brasil'),
    nullif(meta->>'whatsapp', ''),
    desired_referrer_username
  )
  on conflict (id) do update
    set email = excluded.email,
        username = coalesce(public.profiles.username, excluded.username),
        name = coalesce(public.profiles.name, excluded.name),
        country = coalesce(public.profiles.country, excluded.country),
        whatsapp = coalesce(public.profiles.whatsapp, excluded.whatsapp),
        referrer_username = coalesce(public.profiles.referrer_username, excluded.referrer_username),
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

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_new_user();

grant usage on schema public to anon, authenticated, service_role;
grant select, update on table public.profiles to authenticated;
grant select, insert, update on table public.wallets to authenticated;
grant select, insert, update on table public.team_nodes to authenticated;
grant select, insert, update on table public.transactions to authenticated;
