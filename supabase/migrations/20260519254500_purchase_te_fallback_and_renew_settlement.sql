drop function if exists public.create_purchase(text, int, text, text, text);
drop function if exists public.process_nowpayments_payment(text, text, jsonb);

create or replace function public.create_purchase(
  plan_key text,
  units int,
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
  admin_id uuid;
  pk text;
  u int;
  price numeric;
  quotas_per_unit numeric;
  title text;
  total numeric;
  now_ts timestamptz;
  now_iso text;
  currency text;
  network text;
  pay_label text;
  purchase_ext_id text;
  deposit_ext_id text;
  available numeric;
  lot_id text;
  start_at timestamptz;
  end_at timestamptz;
  renew_until timestamptz;
  lot jsonb;
  te_base numeric;
  ref1 uuid;
  ref2 uuid;
  ref3 uuid;
  rec_id uuid;
  rec_level int;
  rec_pct numeric;
  rec_amount numeric;
  rec_ext_id text;
  rec_type text;
  rec_meta jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  select id into admin_id
  from public.profiles
  where is_admin = true
  order by created_at asc
  limit 1;
  admin_id := coalesce(admin_id, uid);

  pk := lower(coalesce(plan_key, ''));
  if pk not in ('cota10', 'cota50', 'cota100') then
    raise exception 'invalid_plan';
  end if;

  u := greatest(1, least(coalesce(units, 1), 100));
  currency := upper(coalesce(payment_currency, ''));
  network := nullif(upper(coalesce(payment_network, '')), '');

  if pk = 'cota10' then
    price := 10;
    quotas_per_unit := 1;
    title := 'COTA 10';
  elsif pk = 'cota50' then
    price := 50;
    quotas_per_unit := 5;
    title := 'COTA 50';
  else
    price := 100;
    quotas_per_unit := 10;
    title := 'COTA 100';
  end if;

  total := round(price * u, 2);
  now_ts := now();
  now_iso := now_ts::text;

  if currency = 'SALDO' then
    available := coalesce(nullif((select p.balances->>'available' from public.profiles p where p.id = uid), '')::numeric, 0);
    if available < total then
      raise exception 'insufficient_balance';
    end if;

    purchase_ext_id := gen_random_uuid()::text;
    pay_label := 'SALDO';

    start_at := now_ts;
    end_at := start_at + make_interval(months => 6);
    renew_until := end_at + make_interval(hours => 72);
    lot_id := gen_random_uuid()::text;

    lot := jsonb_build_object(
      'id', lot_id,
      'planKey', pk,
      'planTitle', title,
      'units', u,
      'planPrice', price,
      'quotasPerUnit', quotas_per_unit,
      'startAt', start_at,
      'endAt', end_at,
      'renewUntil', renew_until,
      'status', 'ACTIVE',
      'settledAt', null,
      'cancelRequestedAt', null,
      'cancelPayAt', null,
      'cancelPenaltyPct', null,
      'cancelAmount', null,
      'source', jsonb_build_object('provider', 'BALANCE')
    );

    update public.profiles p
    set holdings = jsonb_set(
          coalesce(p.holdings, '{}'::jsonb),
          array[pk],
          to_jsonb(coalesce(nullif(p.holdings->>pk, '')::numeric, 0) + u),
          true
        ),
        balances =
          jsonb_set(
            jsonb_set(coalesce(p.balances, '{}'::jsonb), '{available}', to_jsonb(available - total), true),
            '{invested}', to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + total), true
          ),
        quota_lots = coalesce(p.quota_lots, '[]'::jsonb) || jsonb_build_array(lot),
        updated_at = now_ts
    where p.id = uid;

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      uid,
      purchase_ext_id,
      'COMPRA',
      'Compra ' || title,
      -total,
      pay_label,
      'Concluído',
      jsonb_build_object(
        'id', purchase_ext_id,
        'at', now_iso,
        'kind', 'COMPRA',
        'type', 'Compra ' || title,
        'amount', -total,
        'payment', pay_label,
        'status', 'Concluído',
        'meta', jsonb_build_object('planKey', pk, 'planTitle', title, 'planPrice', price, 'units', u, 'quotasPerUnit', quotas_per_unit)
      ),
      now_ts
    );

    te_base := round(total * 0.1, 2);
    select tn.referrer_profile_id into ref1 from public.team_nodes tn where tn.profile_id = uid;
    if ref1 is not null then
      select tn.referrer_profile_id into ref2 from public.team_nodes tn where tn.profile_id = ref1;
    end if;
    if ref2 is not null then
      select tn.referrer_profile_id into ref3 from public.team_nodes tn where tn.profile_id = ref2;
    end if;

    for rec_level, rec_id, rec_pct in
      select * from (values
        (1, coalesce(ref1, admin_id), 0.4::numeric),
        (2, coalesce(ref2, admin_id), 0.2::numeric),
        (3, coalesce(ref3, admin_id), 0.1::numeric)
      ) as x(level, id, pct)
    loop
      rec_amount := round(te_base * rec_pct, 2);
      if rec_amount <= 0 then
        continue;
      end if;

      rec_ext_id := purchase_ext_id || '-te-L' || rec_level::text || '-' || rec_id::text;
      rec_type := 'Ganho de Rede (TE) - Nível ' || rec_level::text;
      rec_meta := jsonb_build_object('buyerId', uid, 'purchaseId', purchase_ext_id, 'level', rec_level, 'pct', rec_pct);

      insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
      values (
        rec_id,
        rec_ext_id,
        'TE',
        rec_type,
        rec_amount,
        'SISTEMA',
        'Creditado',
        jsonb_build_object(
          'id', rec_ext_id,
          'at', now_iso,
          'kind', 'TE',
          'type', rec_type,
          'amount', rec_amount,
          'payment', 'SISTEMA',
          'status', 'Creditado',
          'meta', rec_meta
        ),
        now_ts
      )
      on conflict (profile_id, external_id)
      do update set
        amount_usd = excluded.amount_usd,
        status = excluded.status,
        meta = excluded.meta,
        at = excluded.at;

      update public.profiles p
      set balances =
            jsonb_set(
              jsonb_set(
                jsonb_set(coalesce(p.balances, '{}'::jsonb), '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + rec_amount), true),
                '{teamEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teamEarnings', '')::numeric, 0) + rec_amount), true
              ),
              '{teEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teEarnings', '')::numeric, 0) + rec_amount), true
            ),
          updated_at = now_ts
      where p.id = rec_id;
    end loop;

    return jsonb_build_object('ok', true, 'mode', 'SALDO', 'purchaseId', purchase_ext_id);
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

  purchase_ext_id := gen_random_uuid()::text;
  deposit_ext_id := gen_random_uuid()::text;
  pay_label := currency || ' ' || coalesce(network, '');

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    purchase_ext_id,
    'COMPRA',
    'Compra ' || title,
    -total,
    pay_label,
    'Aguardando depósito',
    jsonb_build_object(
      'id', purchase_ext_id,
      'at', now_iso,
      'kind', 'COMPRA',
      'type', 'Compra ' || title,
      'amount', -total,
      'payment', pay_label,
      'status', 'Aguardando depósito',
      'meta', jsonb_build_object('depositTxId', deposit_ext_id)
    ),
    now_ts
  );

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    deposit_ext_id,
    'DEPOSITO',
    'Depósito em processamento • ' || title,
    total,
    pay_label,
    'Pendente',
    jsonb_build_object(
      'id', deposit_ext_id,
      'at', now_iso,
      'kind', 'DEPOSITO',
      'type', 'Depósito em processamento • ' || title,
      'amount', total,
      'payment', pay_label,
      'status', 'Pendente',
      'meta', jsonb_build_object(
        'provider', 'NOWPAYMENTS',
        'paymentId', payment_id,
        'currency', currency,
        'network', network,
        'purpose', 'PURCHASE',
        'purchaseTxId', purchase_ext_id,
        'planKey', pk,
        'planTitle', title,
        'planPrice', price,
        'quotasPerUnit', quotas_per_unit,
        'units', u
      )
    ),
    now_ts
  );

  return jsonb_build_object('ok', true, 'mode', 'NOWPAYMENTS', 'purchaseId', purchase_ext_id, 'depositId', deposit_ext_id);
end;
$$;

create or replace function public.process_nowpayments_payment(payment_id text, payment_status text, raw_event jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dep record;
  buy record;
  buyer_id uuid;
  admin_id uuid;
  now_ts timestamptz;
  now_iso text;
  status_lc text;
  confirmed boolean;
  purpose text;
  plan_key text;
  plan_title text;
  plan_price numeric;
  units int;
  total numeric;
  te_base numeric;
  lot_id text;
  start_at timestamptz;
  end_at timestamptz;
  renew_until timestamptz;
  lot jsonb;
  ref1 uuid;
  ref2 uuid;
  ref3 uuid;
  rec_id uuid;
  rec_level int;
  rec_pct numeric;
  rec_amount numeric;
  rec_ext_id text;
  rec_type text;
  rec_meta jsonb;
  renew_tx_id text;
  old_lot_id text;
  new_lot jsonb;
begin
  if payment_id is null or btrim(payment_id) = '' then
    raise exception 'payment_id_required';
  end if;

  select id into admin_id
  from public.profiles
  where is_admin = true
  order by created_at asc
  limit 1;

  now_ts := now();
  now_iso := now_ts::text;
  status_lc := lower(coalesce(payment_status, ''));
  confirmed := status_lc in ('finished', 'confirmed', 'paid', 'sending');

  select *
  into dep
  from public.transactions t
  where t.kind = 'DEPOSITO'
    and (t.meta #>> '{meta,paymentId}') = payment_id
  order by coalesce(t.at, t.created_at) desc
  limit 1;

  if dep is null then
    return jsonb_build_object('ok', false, 'reason', 'deposit_not_found');
  end if;

  if not confirmed then
    update public.transactions
    set meta = jsonb_set(dep.meta, '{meta,nowpaymentsStatus}', to_jsonb(status_lc), true)
    where id = dep.id;
    return jsonb_build_object('ok', true, 'applied', false, 'reason', 'not_confirmed', 'status', status_lc);
  end if;

  if lower(coalesce(dep.status, '')) = 'confirmado' then
    return jsonb_build_object('ok', true, 'applied', false, 'reason', 'already_confirmed');
  end if;

  update public.transactions
  set status = 'Confirmado',
      meta =
        jsonb_set(
          jsonb_set(
            jsonb_set(dep.meta, '{meta,nowpaymentsStatus}', to_jsonb(status_lc), true),
            '{meta,confirmedAt}', to_jsonb(now_iso), true
          ),
          '{meta,rawEvent}', coalesce(raw_event, '{}'::jsonb), true
        ),
      at = coalesce(dep.at, now_ts)
  where id = dep.id;

  purpose := upper(coalesce(dep.meta #>> '{meta,purpose}', ''));
  buyer_id := dep.profile_id;

  if purpose = 'RENEW' then
    renew_tx_id := nullif(dep.meta #>> '{meta,renewTxId}', '');
    old_lot_id := nullif(dep.meta #>> '{meta,oldLotId}', '');
    new_lot := dep.meta #> '{meta,newLot}';

    if renew_tx_id is not null then
      update public.transactions t
      set status = 'Concluído',
          payment = coalesce(dep.payment, 'NOWPayments'),
          meta = jsonb_set(coalesce(t.meta, '{}'::jsonb), '{meta,settledAt}', to_jsonb(now_iso), true),
          at = coalesce(t.at, now_ts)
      where t.profile_id = buyer_id and t.external_id = renew_tx_id;
    end if;

    update public.profiles p
    set balances = jsonb_set(
          coalesce(p.balances, '{}'::jsonb),
          '{invested}',
          to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + coalesce(dep.amount_usd, 0)),
          true
        ),
        quota_lots = (
          select coalesce(jsonb_agg(elem) filter (where elem->>'id' <> old_lot_id), '[]'::jsonb)
          from jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) elem
        ) || jsonb_build_array(coalesce(new_lot, '{}'::jsonb)),
        updated_at = now_ts
    where p.id = buyer_id;

    return jsonb_build_object('ok', true, 'applied', true, 'reason', 'renew_settled', 'paymentId', payment_id);
  end if;

  if purpose <> 'PURCHASE' then
    return jsonb_build_object('ok', true, 'applied', true, 'reason', 'deposit_only');
  end if;

  plan_key := coalesce(dep.meta #>> '{meta,planKey}', '');
  plan_title := coalesce(dep.meta #>> '{meta,planTitle}', '');
  plan_price := coalesce(nullif(dep.meta #>> '{meta,planPrice}', '')::numeric, 0);
  units := greatest(1, coalesce(nullif(dep.meta #>> '{meta,units}', '')::int, 1));
  total := round(plan_price * units, 2);

  start_at := now_ts;
  end_at := start_at + make_interval(months => 6);
  renew_until := end_at + make_interval(hours => 72);
  lot_id := gen_random_uuid()::text;
  lot := jsonb_build_object(
    'id', lot_id,
    'planKey', plan_key,
    'planTitle', plan_title,
    'units', units,
    'planPrice', plan_price,
    'quotasPerUnit', coalesce(nullif(dep.meta #>> '{meta,quotasPerUnit}', '')::numeric, 0),
    'startAt', start_at,
    'endAt', end_at,
    'renewUntil', renew_until,
    'status', 'ACTIVE',
    'settledAt', null,
    'cancelRequestedAt', null,
    'cancelPayAt', null,
    'cancelPenaltyPct', null,
    'cancelAmount', null,
    'source', jsonb_build_object('provider', 'NOWPAYMENTS', 'paymentId', payment_id, 'depositTxId', dep.external_id)
  );

  update public.profiles p
  set holdings = jsonb_set(
        coalesce(p.holdings, '{}'::jsonb),
        array[plan_key],
        to_jsonb(coalesce(nullif(p.holdings->>plan_key, '')::numeric, 0) + units),
        true
      ),
      balances = jsonb_set(
        coalesce(p.balances, '{}'::jsonb),
        '{invested}',
        to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + total),
        true
      ),
      quota_lots = coalesce(p.quota_lots, '[]'::jsonb) || jsonb_build_array(lot),
      updated_at = now_ts
  where p.id = buyer_id;

  select *
  into buy
  from public.transactions t
  where t.profile_id = buyer_id
    and t.kind = 'COMPRA'
    and t.external_id = (dep.meta #>> '{meta,purchaseTxId}')
  limit 1;

  if buy is not null then
    if lower(coalesce(buy.status, '')) <> 'concluído' then
      update public.transactions
      set status = 'Concluído',
          payment = coalesce(dep.payment, 'NOWPayments'),
          meta = jsonb_set(coalesce(buy.meta, '{}'::jsonb), '{meta,settledAt}', to_jsonb(now_iso), true),
          at = coalesce(buy.at, now_ts)
      where id = buy.id;
    end if;
  end if;

  te_base := round(total * 0.1, 2);

  select tn.referrer_profile_id into ref1
  from public.team_nodes tn
  where tn.profile_id = buyer_id;

  if ref1 is not null then
    select tn.referrer_profile_id into ref2
    from public.team_nodes tn
    where tn.profile_id = ref1;
  end if;

  if ref2 is not null then
    select tn.referrer_profile_id into ref3
    from public.team_nodes tn
    where tn.profile_id = ref2;
  end if;

  for rec_level, rec_id, rec_pct in
    select * from (values
      (1, coalesce(ref1, admin_id, buyer_id), 0.4::numeric),
      (2, coalesce(ref2, admin_id, buyer_id), 0.2::numeric),
      (3, coalesce(ref3, admin_id, buyer_id), 0.1::numeric)
    ) as x(level, id, pct)
  loop
    rec_amount := round(te_base * rec_pct, 2);
    if rec_amount <= 0 then
      continue;
    end if;

    rec_ext_id := payment_id || '-te-L' || rec_level::text || '-' || rec_id::text;
    rec_type := 'Ganho de Rede (TE) - Nível ' || rec_level::text;
    rec_meta := jsonb_build_object('buyerId', buyer_id, 'paymentId', payment_id, 'level', rec_level, 'pct', rec_pct);

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      rec_id,
      rec_ext_id,
      'TE',
      rec_type,
      rec_amount,
      'SISTEMA',
      'Creditado',
      jsonb_build_object(
        'id', rec_ext_id,
        'at', now_iso,
        'kind', 'TE',
        'type', rec_type,
        'amount', rec_amount,
        'payment', 'SISTEMA',
        'status', 'Creditado',
        'meta', rec_meta
      ),
      now_ts
    )
    on conflict (profile_id, external_id)
    do update set
      amount_usd = excluded.amount_usd,
      status = excluded.status,
      meta = excluded.meta,
      at = excluded.at;

    update public.profiles p
    set balances =
          jsonb_set(
            jsonb_set(
              jsonb_set(coalesce(p.balances, '{}'::jsonb), '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + rec_amount), true),
              '{teamEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teamEarnings', '')::numeric, 0) + rec_amount), true
            ),
            '{teEarnings}', to_jsonb(coalesce(nullif(p.balances->>'teEarnings', '')::numeric, 0) + rec_amount), true
          ),
        updated_at = now_ts
    where p.id = rec_id;
  end loop;

  return jsonb_build_object('ok', true, 'applied', true, 'buyerId', buyer_id, 'paymentId', payment_id);
end;
$$;

revoke all on function public.create_purchase(text, int, text, text, text) from public;
revoke all on function public.process_nowpayments_payment(text, text, jsonb) from public;
grant execute on function public.create_purchase(text, int, text, text, text) to authenticated;
grant execute on function public.process_nowpayments_payment(text, text, jsonb) to service_role;
