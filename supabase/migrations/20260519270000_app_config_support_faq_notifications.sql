create table if not exists public.app_config (
  id int primary key default 1,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint app_config_singleton check (id = 1)
);

create trigger app_config_set_updated_at
before update on public.app_config
for each row execute function public.set_updated_at();

insert into public.app_config (id, config)
values (
  1,
  jsonb_build_object(
    'globalSold', 0,
    'support', jsonb_build_object(
      'finance', jsonb_build_object('online', false, 'queue', 0),
      'tech', jsonb_build_object('online', false, 'queue', 0)
    ),
    'elite', jsonb_build_object('profitQuinzenal', 0, 'lastPaidAt', null)
  )
)
on conflict (id) do nothing;

create table if not exists public.banks (
  id text primary key,
  name text not null,
  quota_key text not null,
  status text not null default 'upcoming',
  limit_usd numeric(18,2) not null default 0,
  filled_pct numeric(10,4) not null default 0,
  profit_month_pct numeric(10,4),
  profit_accumulated_pct numeric(10,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists banks_quota_key_idx on public.banks (quota_key);

create trigger banks_set_updated_at
before update on public.banks
for each row execute function public.set_updated_at();

insert into public.banks (id, name, quota_key, status, limit_usd, filled_pct, profit_month_pct, profit_accumulated_pct)
values
  ('rm1', 'Banca RM 1', 'cota10', 'upcoming', 0, 0, null, null),
  ('rm2', 'Banca RM 2', 'cota50', 'upcoming', 0, 0, null, null),
  ('rm3', 'Banca RM 3', 'cota100', 'upcoming', 0, 0, null, null)
on conflict (id) do nothing;

create table if not exists public.profile_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  lang text not null default 'pt',
  apn_pdf_lang text not null default 'pt',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profile_preferences_set_updated_at
before update on public.profile_preferences
for each row execute function public.set_updated_at();

create table if not exists public.faq_items (
  id uuid primary key default gen_random_uuid(),
  sort int not null default 0,
  q jsonb not null default '{}'::jsonb,
  a jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists faq_items_sort_idx on public.faq_items (sort asc, created_at asc);

create trigger faq_items_set_updated_at
before update on public.faq_items
for each row execute function public.set_updated_at();

create table if not exists public.support_threads (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  channel text not null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_threads_profile_idx on public.support_threads (profile_id, created_at desc);
create index if not exists support_threads_channel_idx on public.support_threads (channel, created_at desc);

create trigger support_threads_set_updated_at
before update on public.support_threads
for each row execute function public.set_updated_at();

create table if not exists public.support_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.support_threads(id) on delete cascade,
  from_role text not null,
  body text not null,
  read_by_user boolean not null default false,
  read_by_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists support_messages_thread_idx on public.support_messages (thread_id, created_at asc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null,
  ref text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index if not exists notifications_profile_created_idx on public.notifications (profile_id, created_at desc);
create index if not exists notifications_profile_read_idx on public.notifications (profile_id, read_at);

create table if not exists public.bank_history (
  id uuid primary key default gen_random_uuid(),
  bank_id text not null references public.banks(id) on delete cascade,
  ymd date not null,
  note text,
  video_urls jsonb not null default '[]'::jsonb,
  image_urls jsonb not null default '[]'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bank_history_bank_ymd_idx on public.bank_history (bank_id, ymd desc);

create trigger bank_history_set_updated_at
before update on public.bank_history
for each row execute function public.set_updated_at();

alter table public.app_config enable row level security;
alter table public.banks enable row level security;
alter table public.profile_preferences enable row level security;
alter table public.faq_items enable row level security;
alter table public.support_threads enable row level security;
alter table public.support_messages enable row level security;
alter table public.notifications enable row level security;
alter table public.bank_history enable row level security;

drop policy if exists app_config_select on public.app_config;
drop policy if exists app_config_update on public.app_config;
drop policy if exists app_config_insert on public.app_config;

create policy app_config_select
on public.app_config
for select
to authenticated
using (true);

create policy app_config_update
on public.app_config
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy app_config_insert
on public.app_config
for insert
to authenticated
with check (public.is_admin());

drop policy if exists banks_select on public.banks;
drop policy if exists banks_update on public.banks;
drop policy if exists banks_insert on public.banks;

create policy banks_select
on public.banks
for select
to authenticated
using (true);

create policy banks_update
on public.banks
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy banks_insert
on public.banks
for insert
to authenticated
with check (public.is_admin());

drop policy if exists profile_preferences_select on public.profile_preferences;
drop policy if exists profile_preferences_upsert on public.profile_preferences;

create policy profile_preferences_select
on public.profile_preferences
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy profile_preferences_upsert
on public.profile_preferences
for insert
to authenticated
with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists profile_preferences_update on public.profile_preferences;
create policy profile_preferences_update
on public.profile_preferences
for update
to authenticated
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists faq_items_select on public.faq_items;
drop policy if exists faq_items_update on public.faq_items;
drop policy if exists faq_items_insert on public.faq_items;

create policy faq_items_select
on public.faq_items
for select
to authenticated
using (true);

create policy faq_items_update
on public.faq_items
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create policy faq_items_insert
on public.faq_items
for insert
to authenticated
with check (public.is_admin());

drop policy if exists support_threads_select on public.support_threads;
drop policy if exists support_threads_insert on public.support_threads;
drop policy if exists support_threads_update on public.support_threads;

create policy support_threads_select
on public.support_threads
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy support_threads_insert
on public.support_threads
for insert
to authenticated
with check (profile_id = auth.uid() or public.is_admin());

create policy support_threads_update
on public.support_threads
for update
to authenticated
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists support_messages_select on public.support_messages;
drop policy if exists support_messages_insert on public.support_messages;
drop policy if exists support_messages_update on public.support_messages;

create policy support_messages_select
on public.support_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.support_threads th
    where th.id = thread_id
      and (th.profile_id = auth.uid() or public.is_admin())
  )
);

create policy support_messages_insert
on public.support_messages
for insert
to authenticated
with check (
  exists (
    select 1
    from public.support_threads th
    where th.id = thread_id
      and (th.profile_id = auth.uid() or public.is_admin())
  )
);

create policy support_messages_update
on public.support_messages
for update
to authenticated
using (
  exists (
    select 1
    from public.support_threads th
    where th.id = thread_id
      and (th.profile_id = auth.uid() or public.is_admin())
  )
)
with check (
  exists (
    select 1
    from public.support_threads th
    where th.id = thread_id
      and (th.profile_id = auth.uid() or public.is_admin())
  )
);

drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_insert on public.notifications;
drop policy if exists notifications_update on public.notifications;

create policy notifications_select
on public.notifications
for select
to authenticated
using (profile_id = auth.uid() or public.is_admin());

create policy notifications_insert
on public.notifications
for insert
to authenticated
with check (public.is_admin());

create policy notifications_update
on public.notifications
for update
to authenticated
using (profile_id = auth.uid() or public.is_admin())
with check (profile_id = auth.uid() or public.is_admin());

drop policy if exists bank_history_select on public.bank_history;
drop policy if exists bank_history_insert on public.bank_history;
drop policy if exists bank_history_update on public.bank_history;

create policy bank_history_select
on public.bank_history
for select
to authenticated
using (true);

create policy bank_history_insert
on public.bank_history
for insert
to authenticated
with check (public.is_admin());

create policy bank_history_update
on public.bank_history
for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

create or replace function public.get_app_config()
returns jsonb
language sql
stable
as $$
  select coalesce((select config from public.app_config where id = 1), '{}'::jsonb);
$$;

create or replace function public.admin_patch_app_config(patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  next jsonb;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  next := coalesce(public.get_app_config(), '{}'::jsonb) || coalesce(patch, '{}'::jsonb);
  insert into public.app_config (id, config) values (1, next)
  on conflict (id) do update set config = excluded.config, updated_at = now();
  return jsonb_build_object('ok', true, 'config', next);
end;
$$;

create or replace function public.list_banks()
returns table(
  id text,
  name text,
  quota_key text,
  status text,
  limit_usd numeric,
  filled_pct numeric,
  profit_month_pct numeric,
  profit_accumulated_pct numeric
)
language sql
stable
as $$
  select b.id, b.name, b.quota_key, b.status, b.limit_usd, b.filled_pct, b.profit_month_pct, b.profit_accumulated_pct
  from public.banks b
  order by b.id asc;
$$;

create or replace function public.admin_upsert_bank(
  bank_id text,
  bank_name text,
  bank_quota_key text,
  bank_status text,
  bank_limit_usd numeric,
  bank_filled_pct numeric,
  bank_profit_month_pct numeric,
  bank_profit_accumulated_pct numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  insert into public.banks (id, name, quota_key, status, limit_usd, filled_pct, profit_month_pct, profit_accumulated_pct)
  values (
    nullif(bank_id, ''),
    coalesce(nullif(bank_name, ''), 'Banca'),
    coalesce(nullif(bank_quota_key, ''), 'cota10'),
    coalesce(nullif(bank_status, ''), 'upcoming'),
    coalesce(bank_limit_usd, 0),
    coalesce(bank_filled_pct, 0),
    bank_profit_month_pct,
    bank_profit_accumulated_pct
  )
  on conflict (id) do update set
    name = excluded.name,
    quota_key = excluded.quota_key,
    status = excluded.status,
    limit_usd = excluded.limit_usd,
    filled_pct = excluded.filled_pct,
    profit_month_pct = excluded.profit_month_pct,
    profit_accumulated_pct = excluded.profit_accumulated_pct,
    updated_at = now();
  return jsonb_build_object('ok', true);
end;
$$;

revoke all on table public.app_config from public;
revoke all on table public.banks from public;
revoke all on table public.profile_preferences from public;
revoke all on table public.faq_items from public;
revoke all on table public.support_threads from public;
revoke all on table public.support_messages from public;
revoke all on table public.notifications from public;
revoke all on table public.bank_history from public;

revoke all on function public.get_app_config() from public;
revoke all on function public.admin_patch_app_config(jsonb) from public;
revoke all on function public.list_banks() from public;
revoke all on function public.admin_upsert_bank(text, text, text, text, numeric, numeric, numeric, numeric) from public;

grant select on public.app_config to authenticated;
grant select on public.banks to authenticated;
grant select, insert, update on public.profile_preferences to authenticated;
grant select on public.faq_items to authenticated;
grant select, insert, update on public.support_threads to authenticated;
grant select, insert, update on public.support_messages to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select on public.bank_history to authenticated;

grant execute on function public.get_app_config() to authenticated;
grant execute on function public.admin_patch_app_config(jsonb) to authenticated;
grant execute on function public.list_banks() to authenticated;
grant execute on function public.admin_upsert_bank(text, text, text, text, numeric, numeric, numeric, numeric) to authenticated;
