create or replace function public.process_nowpayments_reference(
  payment_id text default null,
  invoice_id text default null,
  order_id text default null,
  payment_status text default null,
  raw_event jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  dep public.transactions%rowtype;
  now_ts timestamptz;
  now_iso text;
  status_lc text;
  confirmed boolean;
  purpose text;
  buyer_id uuid;
  purchase_tx_id text;
  plan_key text;
  plan_title text;
  plan_price numeric;
  units int;
  total numeric;
  lot_id text;
  lot jsonb;
  start_at timestamptz;
  end_at timestamptz;
  renew_until timestamptz;
  renew_tx_id text;
  old_lot_id text;
  new_lot jsonb;
  te_base numeric;
  ref1 uuid;
  ref2 uuid;
  ref3 uuid;
  rec_level int;
  rec_id uuid;
  rec_pct numeric;
  rec_amount numeric;
  rec_ext_id text;
  rec_type text;
  rec_meta jsonb;
  rec_inserted_count int;
  payment_id_norm text;
  invoice_id_norm text;
  order_id_norm text;
  dep_meta_patch jsonb;
begin
  select * into dep
  from public.find_nowpayments_deposit(payment_id, invoice_id, order_id);

  if dep.id is null then
    return jsonb_build_object('ok', true, 'matched', false, 'reason', 'deposit_not_found');
  end if;

  status_lc := lower(coalesce(payment_status, raw_event->>'payment_status', ''));
  confirmed := status_lc in ('finished', 'confirmed', 'sending', 'partially_paid');
  payment_id_norm := nullif(btrim(coalesce(payment_id, raw_event->>'payment_id', '')), '');
  invoice_id_norm := nullif(btrim(coalesce(invoice_id, raw_event->>'invoice_id', '')), '');
  order_id_norm := nullif(btrim(coalesce(order_id, raw_event->>'order_id', '')), '');
  dep_meta_patch := jsonb_strip_nulls(
    jsonb_build_object(
      'paymentId', payment_id_norm,
      'invoiceId', invoice_id_norm,
      'orderId', order_id_norm
    )
  );

  update public.transactions t
  set payment = coalesce(t.payment, 'NOWPayments'),
      status = case when confirmed then 'Concluído' else coalesce(t.status, 'Pendente') end,
      meta = case
        when dep_meta_patch = '{}'::jsonb then coalesce(t.meta, '{}'::jsonb)
        else jsonb_set(
          coalesce(t.meta, '{}'::jsonb),
          '{meta}',
          coalesce(t.meta->'meta', '{}'::jsonb) || dep_meta_patch,
          true
        )
      end,
      at = coalesce(t.at, now())
  where t.id = dep.id;

  if not confirmed then
    return jsonb_build_object('ok', true, 'matched', true, 'confirmed', false);
  end if;

  now_ts := now();
  now_iso := now_ts::text;
  purpose := upper(coalesce(dep.meta #>> '{meta,purpose}', ''));
  buyer_id := dep.profile_id;

  if purpose = 'RENEW' then
    renew_tx_id := dep.meta #>> '{meta,renewTxId}';
    old_lot_id := dep.meta #>> '{meta,oldLotId}';
    new_lot := dep.meta #> '{meta,newLot}';

    if buyer_id is null or old_lot_id is null or new_lot is null then
      return jsonb_build_object('ok', true, 'applied', false, 'reason', 'renew_payload_invalid');
    end if;

    update public.transactions t
    set status = 'Concluído',
        payment = coalesce(dep.payment, 'NOWPayments'),
        meta = jsonb_set(coalesce(t.meta, '{}'::jsonb), '{meta,settledAt}', to_jsonb(now_iso), true),
        at = coalesce(t.at, now_ts)
    where t.profile_id = buyer_id
      and t.external_id = renew_tx_id;

    update public.profiles p
    set balances =
          jsonb_set(
            jsonb_set(coalesce(p.balances, '{}'::jsonb), '{invested}', to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + coalesce(dep.amount_usd, 0)), true),
            '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0)), true
          ),
        quota_lots = (
          select coalesce(jsonb_agg(elem) filter (where elem->>'id' <> old_lot_id), '[]'::jsonb)
          from jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) elem
        ) || jsonb_build_array(coalesce(new_lot, '{}'::jsonb)),
        updated_at = now_ts
    where p.id = buyer_id;

    return jsonb_build_object('ok', true, 'matched', true, 'confirmed', true, 'applied', true, 'reason', 'renew_applied');
  end if;

  if purpose <> 'PURCHASE' then
    return jsonb_build_object('ok', true, 'applied', true, 'reason', 'deposit_only');
  end if;

  plan_key := coalesce(dep.meta #>> '{meta,planKey}', '');
  plan_title := coalesce(dep.meta #>> '{meta,planTitle}', '');
  plan_price := coalesce(nullif(dep.meta #>> '{meta,planPrice}', '')::numeric, 0);
  units := greatest(1, coalesce(nullif(dep.meta #>> '{meta,units}', '')::int, 1));
  total := round(plan_price * units, 2);
  purchase_tx_id := nullif(dep.meta #>> '{meta,purchaseTxId}', '');

  if exists (
    select 1
    from public.profiles p
    cross join lateral jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) elem
    where p.id = buyer_id
      and (
        coalesce(elem #>> '{source,depositTxId}', '') = coalesce(dep.external_id, '')
        or (
          payment_id_norm is not null
          and coalesce(elem #>> '{source,paymentId}', '') = payment_id_norm
        )
        or (
          order_id_norm is not null
          and coalesce(elem #>> '{source,orderId}', '') = order_id_norm
        )
      )
  ) then
    update public.transactions t
    set status = 'Concluído',
        payment = coalesce(dep.payment, 'NOWPayments'),
        meta = jsonb_set(coalesce(t.meta, '{}'::jsonb), '{meta,settledAt}', to_jsonb(now_iso), true),
        at = coalesce(t.at, now_ts)
    where purchase_tx_id is not null
      and t.profile_id = buyer_id
      and t.external_id = purchase_tx_id;

    return jsonb_build_object('ok', true, 'matched', true, 'confirmed', true, 'applied', false, 'reason', 'already_applied');
  end if;

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
    'settledAt', now_iso,
    'cancelRequestedAt', null,
    'cancelPayAt', null,
    'cancelPenaltyPct', null,
    'cancelAmount', null,
    'bankId', dep.meta #>> '{meta,bankId}',
    'bankName', dep.meta #>> '{meta,bankName}',
    'source', jsonb_build_object(
      'provider', 'NOWPAYMENTS',
      'paymentId', coalesce(payment_id_norm, dep.meta #>> '{meta,paymentId}'),
      'invoiceId', coalesce(invoice_id_norm, dep.meta #>> '{meta,invoiceId}'),
      'orderId', coalesce(order_id_norm, dep.meta #>> '{meta,orderId}'),
      'purchaseTxId', purchase_tx_id,
      'depositTxId', dep.external_id
    )
  );

  update public.profiles p
  set holdings = jsonb_set(
        coalesce(p.holdings, '{}'::jsonb),
        array[plan_key],
        to_jsonb(coalesce(nullif(p.holdings->>plan_key, '')::numeric, 0) + units),
        true
      ),
      balances =
        jsonb_set(
          jsonb_set(coalesce(p.balances, '{}'::jsonb), '{invested}', to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + total), true),
          '{available}', to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0)), true
        ),
      quota_lots = coalesce(p.quota_lots, '[]'::jsonb) || jsonb_build_array(lot),
      updated_at = now_ts
  where p.id = buyer_id;

  update public.transactions t
  set status = 'Concluído',
      payment = coalesce(dep.payment, 'NOWPayments'),
      meta = jsonb_set(coalesce(t.meta, '{}'::jsonb), '{meta,settledAt}', to_jsonb(now_iso), true),
      at = coalesce(t.at, now_ts)
  where t.profile_id = buyer_id
    and t.external_id = coalesce(purchase_tx_id, '');

  te_base := round(total * 0.1, 2);
  select tn.referrer_profile_id into ref1 from public.team_nodes tn where tn.profile_id = buyer_id;
  if ref1 is not null then
    select tn.referrer_profile_id into ref2 from public.team_nodes tn where tn.profile_id = ref1;
  end if;
  if ref2 is not null then
    select tn.referrer_profile_id into ref3 from public.team_nodes tn where tn.profile_id = ref2;
  end if;

  for rec_level, rec_id, rec_pct in
    select * from (values
      (1, ref1, 0.4::numeric),
      (2, ref2, 0.2::numeric),
      (3, ref3, 0.1::numeric)
    ) as x(level, id, pct)
  loop
    if rec_id is null then
      continue;
    end if;

    rec_amount := round(te_base * rec_pct, 2);
    if rec_amount <= 0 then
      continue;
    end if;

    rec_ext_id := dep.external_id || '-te-L' || rec_level::text || '-' || rec_id::text;
    rec_type := 'Ganho de Rede (TE) - Nível ' || rec_level::text;
    rec_meta := jsonb_build_object('buyerId', buyer_id, 'purchaseId', dep.external_id, 'level', rec_level, 'pct', rec_pct);

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
    do nothing;

    get diagnostics rec_inserted_count = row_count;

    if rec_inserted_count = 0 then
      continue;
    end if;

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

    perform public.apply_sponsorship_credit(rec_id, 'TE', rec_ext_id, rec_amount, rec_meta, now_ts);
  end loop;

  return jsonb_build_object('ok', true, 'matched', true, 'confirmed', true, 'applied', true);
end;
$$;
