create or replace function public.calc_desist_penalty_pct(start_at timestamptz, run_at timestamptz)
returns numeric
language plpgsql
stable
as $$
declare
  start_ts bigint;
  now_ts bigint;
  days int;
  month_index int;
  pct numeric;
begin
  if start_at is null or run_at is null then
    return 0.2;
  end if;
  start_ts := (extract(epoch from start_at) * 1000)::bigint;
  now_ts := (extract(epoch from run_at) * 1000)::bigint;
  if now_ts <= start_ts then
    return 0.2;
  end if;
  days := floor((now_ts - start_ts) / (1000 * 60 * 60 * 24))::int;
  month_index := least(6, floor(days / 30)::int + 1);
  pct := 0.2 - 0.04 * (month_index - 1);
  return greatest(0, round(pct::numeric, 4));
end;
$$;

create or replace function public.request_desistance(lot_id text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  p record;
  now_ts timestamptz;
  now_iso text;
  lots jsonb;
  lot jsonb;
  next_lots jsonb;
  start_at timestamptz;
  total numeric;
  principal_return numeric;
  penalty_pct numeric;
  amount numeric;
  pay_at timestamptz;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if lot_id is null or btrim(lot_id) = '' then
    raise exception 'lot_id_required';
  end if;

  now_ts := now();
  now_iso := now_ts::text;

  select * into p from public.profiles where id = uid;
  lots := coalesce(p.quota_lots, '[]'::jsonb);

  select elem into lot
  from jsonb_array_elements(lots) elem
  where elem->>'id' = lot_id
  limit 1;
  if lot is null then
    raise exception 'lot_not_found';
  end if;
  if coalesce(lot->>'status', '') <> 'ACTIVE' then
    raise exception 'only_active';
  end if;

  start_at := nullif(lot->>'startAt', '')::timestamptz;
  total := coalesce(nullif(lot->>'planPrice', '')::numeric, 0) * coalesce(nullif(lot->>'units', '')::numeric, 0);
  principal_return := round(total * (1 - 0.1), 2);
  penalty_pct := public.calc_desist_penalty_pct(start_at, now_ts);
  amount := round(principal_return * (1 - penalty_pct), 2);
  pay_at := now_ts + make_interval(hours => 72);

  select coalesce(jsonb_agg(
    case
      when elem->>'id' = lot_id then
        jsonb_set(
          jsonb_set(
            jsonb_set(
              jsonb_set(
                jsonb_set(elem, '{status}', to_jsonb('CANCEL_PENDING'::text), true),
                '{cancelRequestedAt}', to_jsonb(now_iso), true
              ),
              '{cancelPayAt}', to_jsonb(pay_at::text), true
            ),
            '{cancelPenaltyPct}', to_jsonb(penalty_pct), true
          ),
          '{cancelAmount}', to_jsonb(amount), true
        )
      else elem
    end
  ), '[]'::jsonb)
  into next_lots
  from jsonb_array_elements(lots) elem;

  update public.profiles
  set quota_lots = next_lots,
      updated_at = now_ts
  where id = uid;

  return jsonb_build_object('ok', true, 'lotId', lot_id, 'payAt', pay_at::text, 'cancelAmount', amount, 'penaltyPct', penalty_pct);
end;
$$;

create or replace function public.renew_lot(
  lot_id text,
  payment_currency text,
  payment_network text default null,
  payment_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  p record;
  now_ts timestamptz;
  now_iso text;
  lots jsonb;
  lot jsonb;
  renew_until timestamptz;
  total numeric;
  currency text;
  network text;
  pay_label text;
  renew_ext_id text;
  deposit_ext_id text;
  available numeric;
  new_lot_id text;
  start_at timestamptz;
  end_at timestamptz;
  renew_until_new timestamptz;
  new_lot jsonb;
  next_lots jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;
  if lot_id is null or btrim(lot_id) = '' then
    raise exception 'lot_id_required';
  end if;

  now_ts := now();
  now_iso := now_ts::text;
  currency := upper(coalesce(payment_currency, ''));
  network := nullif(upper(coalesce(payment_network, '')), '');

  select * into p from public.profiles where id = uid;
  lots := coalesce(p.quota_lots, '[]'::jsonb);

  select elem into lot
  from jsonb_array_elements(lots) elem
  where elem->>'id' = lot_id
  limit 1;
  if lot is null then
    raise exception 'lot_not_found';
  end if;
  if coalesce(lot->>'status', '') <> 'MATURED' then
    raise exception 'only_matured';
  end if;

  renew_until := nullif(lot->>'renewUntil', '')::timestamptz;
  if renew_until is null or now_ts > renew_until then
    raise exception 'renew_expired';
  end if;

  total := coalesce(nullif(lot->>'planPrice', '')::numeric, 0) * coalesce(nullif(lot->>'units', '')::numeric, 0);
  renew_ext_id := gen_random_uuid()::text;

  start_at := now_ts;
  end_at := start_at + make_interval(months => 6);
  renew_until_new := end_at + make_interval(hours => 72);
  new_lot_id := gen_random_uuid()::text;
  new_lot := jsonb_build_object(
    'id', new_lot_id,
    'planKey', coalesce(lot->>'planKey', ''),
    'planTitle', coalesce(lot->>'planTitle', ''),
    'units', coalesce(nullif(lot->>'units', '')::numeric, 0),
    'planPrice', coalesce(nullif(lot->>'planPrice', '')::numeric, 0),
    'quotasPerUnit', coalesce(nullif(lot->>'quotasPerUnit', '')::numeric, 0),
    'startAt', start_at,
    'endAt', end_at,
    'renewUntil', renew_until_new,
    'status', 'ACTIVE',
    'settledAt', null,
    'cancelRequestedAt', null,
    'cancelPayAt', null,
    'cancelPenaltyPct', null,
    'cancelAmount', null,
    'source', jsonb_build_object('provider', currency, 'paymentId', payment_id)
  );

  select coalesce(jsonb_agg(elem) filter (where elem->>'id' <> lot_id), '[]'::jsonb) into next_lots
  from jsonb_array_elements(lots) elem;
  next_lots := next_lots || jsonb_build_array(new_lot);

  if currency = 'SALDO' then
    available := coalesce(nullif(p.balances->>'available', '')::numeric, 0);
    if available < total then
      raise exception 'insufficient_balance';
    end if;

    update public.profiles pr
    set balances =
          jsonb_set(
            jsonb_set(coalesce(pr.balances, '{}'::jsonb), '{available}', to_jsonb(available - total), true),
            '{invested}', to_jsonb(coalesce(nullif(pr.balances->>'invested', '')::numeric, 0) + total), true
          ),
        quota_lots = next_lots,
        updated_at = now_ts
    where pr.id = uid;

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      uid,
      renew_ext_id,
      'RENEW',
      'Renovação (' || coalesce(lot->>'planTitle', '') || ')',
      -total,
      'SALDO',
      'Concluído',
      jsonb_build_object(
        'id', renew_ext_id,
        'at', now_iso,
        'kind', 'RENEW',
        'type', 'Renovação (' || coalesce(lot->>'planTitle', '') || ')',
        'amount', -total,
        'payment', 'SALDO',
        'status', 'Concluído',
        'meta', jsonb_build_object('oldLotId', lot_id, 'newLotId', new_lot_id)
      ),
      now_ts
    );

    return jsonb_build_object('ok', true, 'mode', 'SALDO', 'renewId', renew_ext_id, 'newLotId', new_lot_id);
  end if;

  if currency not in ('USDT', 'USDC') then
    raise exception 'invalid_currency';
  end if;
  if currency = 'USDT' and network not in ('BEP20', 'TRC20') then
    raise exception 'invalid_network';
  end if;
  if currency = 'USDC' then
    network := 'ARBITRUM';
  end if;
  if payment_id is null or btrim(payment_id) = '' then
    raise exception 'payment_id_required';
  end if;
  if exists(select 1 from public.transactions t where t.kind = 'DEPOSITO' and (t.meta #>> '{meta,paymentId}') = payment_id) then
    raise exception 'payment_id_already_used';
  end if;

  deposit_ext_id := gen_random_uuid()::text;
  pay_label := currency || ' ' || coalesce(network, '');

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    renew_ext_id,
    'RENEW',
    'Renovação (' || coalesce(lot->>'planTitle', '') || ')',
    -total,
    pay_label,
    'Pendente',
    jsonb_build_object(
      'id', renew_ext_id,
      'at', now_iso,
      'kind', 'RENEW',
      'type', 'Renovação (' || coalesce(lot->>'planTitle', '') || ')',
      'amount', -total,
      'payment', pay_label,
      'status', 'Pendente',
      'meta', jsonb_build_object('depositTxId', deposit_ext_id, 'oldLotId', lot_id, 'newLotId', new_lot_id)
    ),
    now_ts
  );

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    deposit_ext_id,
    'DEPOSITO',
    'Depósito em processamento • Renovação (' || coalesce(lot->>'planTitle', '') || ')',
    total,
    pay_label,
    'Pendente',
    jsonb_build_object(
      'id', deposit_ext_id,
      'at', now_iso,
      'kind', 'DEPOSITO',
      'type', 'Depósito em processamento • Renovação (' || coalesce(lot->>'planTitle', '') || ')',
      'amount', total,
      'payment', pay_label,
      'status', 'Pendente',
      'meta', jsonb_build_object(
        'provider', 'NOWPAYMENTS',
        'paymentId', payment_id,
        'currency', currency,
        'network', network,
        'purpose', 'RENEW',
        'renewTxId', renew_ext_id,
        'oldLotId', lot_id,
        'newLot', new_lot
      )
    ),
    now_ts
  );

  return jsonb_build_object('ok', true, 'mode', 'NOWPAYMENTS', 'renewId', renew_ext_id, 'depositId', deposit_ext_id, 'newLotId', new_lot_id);
end;
$$;

create or replace function public.process_cycle_settlements(run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prof record;
  lot jsonb;
  next_lots jsonb;
  now_ts timestamptz;
  now_iso text;
  applied_cycle int := 0;
  applied_release int := 0;
  applied_desist int := 0;
  total_cycle numeric := 0;
  total_desist numeric := 0;
begin
  now_ts := coalesce(run_at, now());
  now_iso := now_ts::text;

  for prof in select id, balances, holdings, quota_lots from public.profiles
  loop
    next_lots := '[]'::jsonb;
    for lot in select * from jsonb_array_elements(coalesce(prof.quota_lots, '[]'::jsonb))
    loop
      if coalesce(lot->>'status', '') = 'CANCEL_PENDING'
         and now_ts >= nullif(lot->>'cancelPayAt', '')::timestamptz then
        declare
          amt numeric := round(coalesce(nullif(lot->>'cancelAmount', '')::numeric, 0), 2);
          plan_key text := coalesce(lot->>'planKey', '');
          units numeric := coalesce(nullif(lot->>'units', '')::numeric, 0);
          total numeric := coalesce(nullif(lot->>'planPrice', '')::numeric, 0) * units;
          penalty_pct numeric := coalesce(nullif(lot->>'cancelPenaltyPct', '')::numeric, 0);
          ext_id text := gen_random_uuid()::text;
        begin
          update public.profiles p
          set balances =
                jsonb_set(
                  jsonb_set(coalesce(p.balances, '{}'::jsonb), '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + amt), true),
                  '{invested}', to_jsonb(greatest(0, coalesce(nullif(p.balances->>'invested', '')::numeric, 0) - total)), true
                ),
              holdings = jsonb_set(
                coalesce(p.holdings, '{}'::jsonb),
                array[plan_key],
                to_jsonb(greatest(0, coalesce(nullif(p.holdings->>plan_key, '')::numeric, 0) - units)),
                true
              ),
              updated_at = now_ts
          where p.id = prof.id;

          insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
          values (
            prof.id,
            ext_id,
            'DESISTENCIA',
            'Desistência (' || coalesce(lot->>'planTitle', '') || ')',
            amt,
            'SISTEMA',
            'Creditado',
            jsonb_build_object(
              'id', ext_id,
              'at', now_iso,
              'kind', 'DESISTENCIA',
              'type', 'Desistência (' || coalesce(lot->>'planTitle', '') || ')',
              'amount', amt,
              'payment', 'SISTEMA',
              'status', 'Creditado',
              'meta', jsonb_build_object('lotId', lot->>'id', 'penaltyPct', penalty_pct)
            ),
            now_ts
          );

          applied_desist := applied_desist + 1;
          total_desist := total_desist + amt;
        end;
        continue;
      end if;

      if coalesce(lot->>'status', '') = 'ACTIVE'
         and now_ts >= nullif(lot->>'endAt', '')::timestamptz then
        declare
          total numeric := coalesce(nullif(lot->>'planPrice', '')::numeric, 0) * coalesce(nullif(lot->>'units', '')::numeric, 0);
          principal_return numeric := round(total * (1 - 0.1), 2);
          ext_id text := gen_random_uuid()::text;
          matured jsonb;
        begin
          update public.profiles p
          set balances =
                jsonb_set(
                  jsonb_set(coalesce(p.balances, '{}'::jsonb), '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + principal_return), true),
                  '{invested}', to_jsonb(greatest(0, coalesce(nullif(p.balances->>'invested', '')::numeric, 0) - total)), true
                ),
              updated_at = now_ts
          where p.id = prof.id;

          insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
          values (
            prof.id,
            ext_id,
            'CYCLE',
            'Ciclo concluído (' || coalesce(lot->>'planTitle', '') || ')',
            principal_return,
            'SISTEMA',
            'Creditado',
            jsonb_build_object(
              'id', ext_id,
              'at', now_iso,
              'kind', 'CYCLE',
              'type', 'Ciclo concluído (' || coalesce(lot->>'planTitle', '') || ')',
              'amount', principal_return,
              'payment', 'SISTEMA',
              'status', 'Creditado',
              'meta', jsonb_build_object('lotId', lot->>'id')
            ),
            now_ts
          );

          matured := jsonb_set(jsonb_set(lot, '{status}', to_jsonb('MATURED'::text), true), '{settledAt}', to_jsonb(now_iso), true);
          next_lots := next_lots || jsonb_build_array(matured);
          applied_cycle := applied_cycle + 1;
          total_cycle := total_cycle + principal_return;
        end;
        continue;
      end if;

      if coalesce(lot->>'status', '') = 'MATURED'
         and now_ts > nullif(lot->>'renewUntil', '')::timestamptz then
        declare
          plan_key text := coalesce(lot->>'planKey', '');
          units numeric := coalesce(nullif(lot->>'units', '')::numeric, 0);
        begin
          update public.profiles p
          set holdings = jsonb_set(
                coalesce(p.holdings, '{}'::jsonb),
                array[plan_key],
                to_jsonb(greatest(0, coalesce(nullif(p.holdings->>plan_key, '')::numeric, 0) - units)),
                true
              ),
              updated_at = now_ts
          where p.id = prof.id;
          applied_release := applied_release + 1;
        end;
        continue;
      end if;

      next_lots := next_lots || jsonb_build_array(lot);
    end loop;

    if next_lots <> coalesce(prof.quota_lots, '[]'::jsonb) then
      update public.profiles p
      set quota_lots = next_lots,
          updated_at = now_ts
      where p.id = prof.id;
    end if;
  end loop;

  return jsonb_build_object(
    'ok', true,
    'cycleCount', applied_cycle,
    'cycleTotal', total_cycle,
    'releasedCount', applied_release,
    'desistanceCount', applied_desist,
    'desistanceTotal', total_desist
  );
end;
$$;

create or replace function public.admin_run_cycle_settlements(run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  return public.process_cycle_settlements(run_at);
end;
$$;

revoke all on function public.calc_desist_penalty_pct(timestamptz, timestamptz) from public;
revoke all on function public.request_desistance(text) from public;
revoke all on function public.renew_lot(text, text, text, text) from public;
revoke all on function public.process_cycle_settlements(timestamptz) from public;
revoke all on function public.admin_run_cycle_settlements(timestamptz) from public;

grant execute on function public.calc_desist_penalty_pct(timestamptz, timestamptz) to authenticated;
grant execute on function public.request_desistance(text) to authenticated;
grant execute on function public.renew_lot(text, text, text, text) to authenticated;
grant execute on function public.process_cycle_settlements(timestamptz) to service_role;
grant execute on function public.admin_run_cycle_settlements(timestamptz) to authenticated;
