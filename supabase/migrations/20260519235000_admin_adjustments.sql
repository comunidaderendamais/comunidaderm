create or replace function public.admin_post_adjustment(
  target_id uuid,
  kind_value text,
  amount_value numeric,
  type_value text default null,
  meta_value jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  ext_id text;
  now_ts timestamptz;
  now_iso text;
  k text;
  amt numeric;
  t text;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if target_id is null then
    raise exception 'target_required';
  end if;

  k := upper(coalesce(kind_value, 'AJUSTE'));
  amt := round(coalesce(amount_value, 0), 2);
  t := coalesce(nullif(type_value, ''), 'Ajuste (Admin)');

  if amt = 0 then
    return jsonb_build_object('ok', true, 'skipped', true);
  end if;

  ext_id := gen_random_uuid()::text;
  now_ts := now();
  now_iso := now_ts::text;

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    target_id,
    ext_id,
    k,
    t,
    amt,
    'ADMIN',
    'Creditado',
    jsonb_build_object(
      'id', ext_id,
      'at', now_iso,
      'kind', k,
      'type', t,
      'amount', amt,
      'payment', 'ADMIN',
      'status', 'Creditado',
      'meta', coalesce(meta_value, '{}'::jsonb)
    ),
    now_ts
  );

  update public.profiles p
  set balances =
        jsonb_set(
          jsonb_set(
            case when k = 'TE' then
              jsonb_set(coalesce(p.balances, '{}'::jsonb), '{teEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teEarnings', '')::numeric, 0) + amt), true)
            else coalesce(p.balances, '{}'::jsonb)
            end,
            '{teamEarnings}',
            to_jsonb(coalesce(nullif(p.balances->>'teamEarnings', '')::numeric, 0) + case when k in ('TE', 'RESIDUAL') then amt else 0 end),
            true
          ),
          '{available}',
          to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + amt),
          true
        ),
      updated_at = now_ts
  where p.id = target_id;

  return jsonb_build_object('ok', true, 'id', ext_id);
end;
$$;

revoke all on function public.admin_post_adjustment(uuid, text, numeric, text, jsonb) from public;
grant execute on function public.admin_post_adjustment(uuid, text, numeric, text, jsonb) to authenticated;
