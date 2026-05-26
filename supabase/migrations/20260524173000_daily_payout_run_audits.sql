create table if not exists public.daily_payout_run_audits (
  id uuid primary key default gen_random_uuid(),
  run_day date not null,
  requested_run_at timestamptz not null,
  executed_at timestamptz,
  trigger_source text not null default 'CRON',
  actor_id uuid references public.profiles(id) on delete set null,
  actor_email text,
  status text not null default 'RUNNING',
  request_payload jsonb not null default '{}'::jsonb,
  result_payload jsonb not null default '{}'::jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint daily_payout_run_audits_status_chk check (status in ('RUNNING', 'SUCCESS', 'ERROR', 'REJECTED')),
  constraint daily_payout_run_audits_source_chk check (trigger_source in ('CRON', 'ADMIN_BUTTON', 'TOKEN', 'MANUAL_REPLAY'))
);

create index if not exists daily_payout_run_audits_day_idx
on public.daily_payout_run_audits (run_day desc, created_at desc);

create index if not exists daily_payout_run_audits_status_idx
on public.daily_payout_run_audits (status, created_at desc);

drop trigger if exists daily_payout_run_audits_set_updated_at on public.daily_payout_run_audits;
create trigger daily_payout_run_audits_set_updated_at
before update on public.daily_payout_run_audits
for each row execute function public.set_updated_at();

alter table public.daily_payout_run_audits enable row level security;

drop policy if exists daily_payout_run_audits_admin_select on public.daily_payout_run_audits;
create policy daily_payout_run_audits_admin_select
on public.daily_payout_run_audits
for select
to authenticated
using (public.is_admin());

create or replace function public.run_daily_payouts_with_audit(
  run_at timestamptz default now(),
  trigger_source_value text default 'CRON',
  actor_id_value uuid default null,
  actor_email_value text default null,
  request_payload_value jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  run_day date := (run_at at time zone 'America/Sao_Paulo')::date;
  normalized_source text := upper(coalesce(nullif(trigger_source_value, ''), 'CRON'));
  audit_id uuid;
  payout_result jsonb := '{}'::jsonb;
begin
  if normalized_source not in ('CRON', 'ADMIN_BUTTON', 'TOKEN', 'MANUAL_REPLAY') then
    normalized_source := 'TOKEN';
  end if;

  insert into public.daily_payout_run_audits (
    run_day,
    requested_run_at,
    trigger_source,
    actor_id,
    actor_email,
    status,
    request_payload
  )
  values (
    run_day,
    run_at,
    normalized_source,
    actor_id_value,
    nullif(actor_email_value, ''),
    'RUNNING',
    coalesce(request_payload_value, '{}'::jsonb)
  )
  returning id into audit_id;

  begin
    payout_result := coalesce(public.process_daily_payouts(run_at), '{}'::jsonb);

    update public.daily_payout_run_audits
    set status = 'SUCCESS',
        executed_at = now(),
        result_payload = payout_result,
        error_message = null
    where id = audit_id;

    return jsonb_build_object(
      'ok', true,
      'auditId', audit_id,
      'auditStatus', 'SUCCESS',
      'triggerSource', normalized_source,
      'result', payout_result
    );
  exception when others then
    update public.daily_payout_run_audits
    set status = 'ERROR',
        executed_at = now(),
        result_payload = '{}'::jsonb,
        error_message = sqlerrm
    where id = audit_id;

    raise;
  end;
end;
$$;

revoke all on function public.run_daily_payouts_with_audit(timestamptz, text, uuid, text, jsonb) from public;
grant execute on function public.run_daily_payouts_with_audit(timestamptz, text, uuid, text, jsonb) to service_role;

