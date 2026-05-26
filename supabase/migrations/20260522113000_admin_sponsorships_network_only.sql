create or replace function public.build_sponsorship_summary(items jsonb)
returns jsonb
language sql
immutable
as $$
  with normalized as (
    select case when jsonb_typeof(items) = 'array' then items else '[]'::jsonb end as arr
  ),
  rows as (
    select value as item
    from normalized, jsonb_array_elements(arr)
  ),
  agg as (
    select
      count(*)::int as total_count,
      count(*) filter (where upper(coalesce(item->>'status', 'OPEN')) <> 'SETTLED')::int as open_count,
      count(*) filter (where upper(coalesce(item->>'status', 'OPEN')) = 'SETTLED')::int as settled_count,
      coalesce(sum(coalesce(nullif(item->>'totalUsd', '')::numeric, 0)), 0) as total_usd,
      coalesce(sum(coalesce(nullif(item->>'pendingUsd', '')::numeric, 0)), 0) as pending_usd,
      coalesce(sum(coalesce(nullif(item->>'collectedUsd', '')::numeric, 0)), 0) as collected_usd
    from rows
  )
  select jsonb_build_object(
    'totalCount', total_count,
    'openCount', open_count,
    'settledCount', settled_count,
    'totalUsd', total_usd,
    'pendingUsd', pending_usd,
    'collectedUsd', collected_usd
  )
  from agg;
$$;

create or replace function public.apply_sponsorship_credit(
  target_id uuid,
  source_kind text,
  source_external_id text,
  source_amount numeric,
  source_meta jsonb default '{}'::jsonb,
  event_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  source_kind_norm text;
  source_amount_norm numeric;
  already_applied numeric;
  remaining numeric;
  applied_total numeric := 0;
  items jsonb;
  next_items jsonb := '[]'::jsonb;
  item jsonb;
  item_id text;
  plan_title text;
  current_pending numeric;
  current_collected numeric;
  before_pending numeric;
  take_amount numeric;
  next_pending numeric;
  next_collected numeric;
  next_status text;
  ext_id text;
  now_iso text;
  next_team_state jsonb;
begin
  source_kind_norm := upper(coalesce(source_kind, ''));
  source_amount_norm := round(coalesce(source_amount, 0), 2);
  now_iso := coalesce(event_at, now())::text;

  if target_id is null then
    return jsonb_build_object('ok', true, 'appliedUsd', 0, 'reason', 'target_missing');
  end if;
  if source_kind_norm not in ('TE', 'RESIDUAL') then
    return jsonb_build_object('ok', true, 'appliedUsd', 0, 'reason', 'source_not_eligible');
  end if;
  if coalesce(nullif(btrim(source_external_id), ''), '') = '' then
    return jsonb_build_object('ok', true, 'appliedUsd', 0, 'reason', 'source_missing');
  end if;
  if source_amount_norm <= 0 then
    return jsonb_build_object('ok', true, 'appliedUsd', 0, 'reason', 'source_non_positive');
  end if;

  select coalesce(sum(abs(t.amount_usd)), 0)
  into already_applied
  from public.transactions t
  where t.profile_id = target_id
    and t.kind = 'PATROCINIO_ABATE'
    and coalesce(t.meta #>> '{meta,sourceExternalId}', '') = source_external_id
    and upper(coalesce(t.meta #>> '{meta,sourceKind}', '')) = source_kind_norm;

  remaining := round(greatest(0, source_amount_norm - already_applied), 2);
  if remaining <= 0 then
    return jsonb_build_object('ok', true, 'appliedUsd', 0, 'reason', 'already_applied');
  end if;

  select *
  into prof
  from public.profiles p
  where p.id = target_id
  for update;

  if prof.id is null then
    return jsonb_build_object('ok', true, 'appliedUsd', 0, 'reason', 'target_not_found');
  end if;

  items := coalesce(prof.team_state #> '{sponsorship,items}', '[]'::jsonb);
  if jsonb_typeof(items) <> 'array' then
    items := '[]'::jsonb;
  end if;
  if jsonb_array_length(items) = 0 then
    return jsonb_build_object('ok', true, 'appliedUsd', 0, 'reason', 'no_open_sponsorships');
  end if;

  for item in
    select elem
    from jsonb_array_elements(items) with ordinality as e(elem, ord)
    order by coalesce(nullif(elem->>'createdAt', '')::timestamptz, prof.created_at, event_at), ord
  loop
    item_id := coalesce(item->>'id', '');
    plan_title := coalesce(item->>'planTitle', 'Patrocínio');
    current_pending := round(coalesce(nullif(item->>'pendingUsd', '')::numeric, 0), 2);
    current_collected := round(coalesce(nullif(item->>'collectedUsd', '')::numeric, 0), 2);
    next_status := upper(coalesce(item->>'status', 'OPEN'));

    if remaining > 0 and item_id <> '' and next_status <> 'SETTLED' and current_pending > 0 then
      before_pending := current_pending;
      take_amount := round(least(remaining, current_pending), 2);
      next_pending := round(current_pending - take_amount, 2);
      next_collected := round(current_collected + take_amount, 2);
      remaining := round(remaining - take_amount, 2);
      applied_total := round(applied_total + take_amount, 2);
      next_status := case when next_pending <= 0 then 'SETTLED' else 'OPEN' end;

      item := jsonb_set(item, '{pendingUsd}', to_jsonb(next_pending), true);
      item := jsonb_set(item, '{collectedUsd}', to_jsonb(next_collected), true);
      item := jsonb_set(item, '{status}', to_jsonb(next_status), true);
      item := jsonb_set(item, '{lastOffsetAt}', to_jsonb(now_iso), true);
      item := jsonb_set(item, '{lastOffsetSourceKind}', to_jsonb(source_kind_norm), true);
      item := jsonb_set(item, '{lastOffsetSourceExternalId}', to_jsonb(source_external_id), true);
      if next_status = 'SETTLED' then
        item := jsonb_set(item, '{settledAt}', to_jsonb(now_iso), true);
      end if;

      ext_id := source_external_id || '-sponsor-' || item_id;
      insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
      values (
        target_id,
        ext_id,
        'PATROCINIO_ABATE',
        'Abatimento de patrocínio - ' || plan_title,
        -take_amount,
        source_kind_norm,
        'Compensado',
        jsonb_build_object(
          'id', ext_id,
          'at', now_iso,
          'kind', 'PATROCINIO_ABATE',
          'type', 'Abatimento de patrocínio - ' || plan_title,
          'amount', -take_amount,
          'payment', source_kind_norm,
          'status', 'Compensado',
          'meta', jsonb_build_object(
            'sponsorshipId', item_id,
            'lotId', item->>'lotId',
            'planKey', item->>'planKey',
            'planTitle', plan_title,
            'sourceKind', source_kind_norm,
            'sourceExternalId', source_external_id,
            'sourceAmountUsd', source_amount_norm,
            'beforePendingUsd', before_pending,
            'afterPendingUsd', next_pending,
            'appliedUsd', take_amount,
            'sourceMeta', coalesce(source_meta, '{}'::jsonb)
          )
        ),
        event_at
      )
      on conflict (profile_id, external_id) do nothing;

      if next_status = 'SETTLED' then
        insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
        values (
          target_id,
          item_id || '-quitado',
          'PATROCINIO_QUITADO',
          'Patrocínio quitado - ' || plan_title,
          0,
          source_kind_norm,
          'Concluído',
          jsonb_build_object(
            'id', item_id || '-quitado',
            'at', now_iso,
            'kind', 'PATROCINIO_QUITADO',
            'type', 'Patrocínio quitado - ' || plan_title,
            'amount', 0,
            'payment', source_kind_norm,
            'status', 'Concluído',
            'meta', jsonb_build_object(
              'sponsorshipId', item_id,
              'lotId', item->>'lotId',
              'planKey', item->>'planKey',
              'planTitle', plan_title,
              'settledBySourceKind', source_kind_norm,
              'settledBySourceExternalId', source_external_id
            )
          ),
          event_at
        )
        on conflict (profile_id, external_id) do nothing;
      end if;
    end if;

    next_items := next_items || jsonb_build_array(item);
  end loop;

  if applied_total <= 0 then
    return jsonb_build_object('ok', true, 'appliedUsd', 0, 'reason', 'nothing_to_apply');
  end if;

  next_team_state := jsonb_set(coalesce(prof.team_state, '{}'::jsonb), '{sponsorship,items}', next_items, true);
  next_team_state := jsonb_set(next_team_state, '{sponsorship,summary}', public.build_sponsorship_summary(next_items), true);

  update public.profiles p
  set balances = jsonb_set(
        coalesce(p.balances, '{}'::jsonb),
        '{available}',
        to_jsonb(greatest(0, coalesce(nullif(p.balances->>'available', '')::numeric, 0) - applied_total)),
        true
      ),
      team_state = next_team_state,
      updated_at = event_at
  where p.id = target_id;

  return jsonb_build_object(
    'ok', true,
    'appliedUsd', applied_total,
    'remainingUsd', remaining,
    'summary', next_team_state #> '{sponsorship,summary}'
  );
end;
$$;

drop function if exists public.admin_grant_sponsorship(uuid, text, int, text);
create or replace function public.admin_grant_sponsorship(
  target_id uuid,
  plan_key_value text,
  units_value int default 1,
  note_value text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  prof public.profiles%rowtype;
  bank_row public.banks%rowtype;
  pk text;
  units_norm int;
  price numeric;
  quotas_per_unit int;
  title text;
  total numeric;
  now_ts timestamptz;
  now_iso text;
  lot_id text;
  lot jsonb;
  purchase_ext_id text;
  sponsorship_id text;
  sponsorship_item jsonb;
  current_items jsonb;
  next_items jsonb;
  next_team_state jsonb;
  start_at timestamptz;
  end_at timestamptz;
  renew_until timestamptz;
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
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;
  if target_id is null then
    raise exception 'target_required';
  end if;

  select *
  into prof
  from public.profiles p
  where p.id = target_id
  for update;

  if prof.id is null then
    raise exception 'target_not_found';
  end if;

  pk := lower(coalesce(plan_key_value, ''));
  if pk not in ('cota10', 'cota50', 'cota100') then
    raise exception 'invalid_plan';
  end if;

  units_norm := greatest(1, least(coalesce(units_value, 1), 100));
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

  select *
  into bank_row
  from public.banks b
  where lower(coalesce(b.quota_key, '')) = pk
  order by case when upper(coalesce(b.status, '')) = 'ACTIVE' then 0 else 1 end, b.id asc
  limit 1;

  total := round(price * units_norm, 2);
  now_ts := now();
  now_iso := now_ts::text;
  start_at := now_ts;
  end_at := start_at + make_interval(months => 6);
  renew_until := end_at + make_interval(hours => 72);
  lot_id := gen_random_uuid()::text;
  purchase_ext_id := gen_random_uuid()::text;
  sponsorship_id := gen_random_uuid()::text;

  lot := jsonb_build_object(
    'id', lot_id,
    'planKey', pk,
    'planTitle', title,
    'units', units_norm,
    'planPrice', price,
    'quotasPerUnit', quotas_per_unit,
    'startAt', start_at,
    'endAt', end_at,
    'renewUntil', renew_until,
    'status', 'ACTIVE',
    'settledAt', now_iso,
    'cancelRequestedAt', null,
    'cancelPayAt', null,
    'cancelPenaltyPct', null,
    'cancelAmount', null,
    'bankId', bank_row.id,
    'bankName', bank_row.name,
    'source', jsonb_build_object(
      'provider', 'ADMIN_SPONSORSHIP',
      'sponsorshipId', sponsorship_id,
      'purchaseId', purchase_ext_id,
      'note', nullif(note_value, '')
    )
  );

  sponsorship_item := jsonb_build_object(
    'id', sponsorship_id,
    'lotId', lot_id,
    'purchaseTxId', purchase_ext_id,
    'planKey', pk,
    'planTitle', title,
    'units', units_norm,
    'priceUsd', price,
    'totalUsd', total,
    'pendingUsd', total,
    'collectedUsd', 0,
    'status', 'OPEN',
    'createdAt', now_iso,
    'settledAt', null,
    'lastOffsetAt', null,
    'eligibleKinds', to_jsonb(array['TE', 'RESIDUAL']),
    'createdBy', auth.uid(),
    'note', nullif(note_value, '')
  );

  current_items := coalesce(prof.team_state #> '{sponsorship,items}', '[]'::jsonb);
  if jsonb_typeof(current_items) <> 'array' then
    current_items := '[]'::jsonb;
  end if;
  next_items := current_items || jsonb_build_array(sponsorship_item);
  next_team_state := jsonb_set(coalesce(prof.team_state, '{}'::jsonb), '{sponsorship,items}', next_items, true);
  next_team_state := jsonb_set(next_team_state, '{sponsorship,summary}', public.build_sponsorship_summary(next_items), true);

  update public.profiles p
  set holdings = jsonb_set(
        coalesce(p.holdings, '{}'::jsonb),
        array[pk],
        to_jsonb(coalesce(nullif(p.holdings->>pk, '')::numeric, 0) + units_norm),
        true
      ),
      balances = jsonb_set(
        coalesce(p.balances, '{}'::jsonb),
        '{invested}',
        to_jsonb(coalesce(nullif(p.balances->>'invested', '')::numeric, 0) + total),
        true
      ),
      quota_lots = coalesce(p.quota_lots, '[]'::jsonb) || jsonb_build_array(lot),
      team_state = next_team_state,
      updated_at = now_ts
  where p.id = target_id;

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    target_id,
    purchase_ext_id,
    'COMPRA',
    'Compra patrocinada ' || title,
    -total,
    'PATROCINIO',
    'Concluído',
    jsonb_build_object(
      'id', purchase_ext_id,
      'at', now_iso,
      'kind', 'COMPRA',
      'type', 'Compra patrocinada ' || title,
      'amount', -total,
      'payment', 'PATROCINIO',
      'status', 'Concluído',
      'meta', jsonb_build_object(
        'planKey', pk,
        'planTitle', title,
        'planPrice', price,
        'units', units_norm,
        'quotasPerUnit', quotas_per_unit,
        'sponsorshipId', sponsorship_id,
        'bankId', bank_row.id,
        'bankName', bank_row.name,
        'networkOnlyRepayment', true
      )
    ),
    now_ts
  )
  on conflict (profile_id, external_id) do nothing;

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    target_id,
    sponsorship_id || '-create',
    'PATROCINIO_CREATE',
    'Patrocínio criado - ' || title,
    0,
    'ADMIN',
    'Em aberto',
    jsonb_build_object(
      'id', sponsorship_id || '-create',
      'at', now_iso,
      'kind', 'PATROCINIO_CREATE',
      'type', 'Patrocínio criado - ' || title,
      'amount', 0,
      'payment', 'ADMIN',
      'status', 'Em aberto',
      'meta', jsonb_build_object(
        'sponsorshipId', sponsorship_id,
        'lotId', lot_id,
        'planKey', pk,
        'planTitle', title,
        'units', units_norm,
        'totalUsd', total,
        'pendingUsd', total,
        'eligibleKinds', jsonb_build_array('TE', 'RESIDUAL'),
        'note', nullif(note_value, '')
      )
    ),
    now_ts
  )
  on conflict (profile_id, external_id) do nothing;

  te_base := round(total * 0.1, 2);
  select tn.referrer_profile_id into ref1 from public.team_nodes tn where tn.profile_id = target_id;
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

    rec_ext_id := purchase_ext_id || '-te-L' || rec_level::text || '-' || rec_id::text;
    rec_type := 'Ganho de Rede (TE) - Nível ' || rec_level::text;
    rec_meta := jsonb_build_object(
      'buyerId', target_id,
      'purchaseId', purchase_ext_id,
      'sponsorshipId', sponsorship_id,
      'level', rec_level,
      'pct', rec_pct
    );

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

    perform public.apply_sponsorship_credit(rec_id, 'TE', rec_ext_id, rec_amount, rec_meta, now_ts);
  end loop;

  return jsonb_build_object(
    'ok', true,
    'sponsorshipId', sponsorship_id,
    'purchaseId', purchase_ext_id,
    'lotId', lot_id,
    'totalUsd', total
  );
end;
$$;

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

  if amt > 0 and k in ('TE', 'RESIDUAL') then
    perform public.apply_sponsorship_credit(target_id, k, ext_id, amt, coalesce(meta_value, '{}'::jsonb), now_ts);
  end if;

  return jsonb_build_object('ok', true, 'id', ext_id);
end;
$$;

create or replace function public.process_daily_payouts(run_at timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  day_key text;
  run_day date;
  inserted_daily int;
  inserted_residual int;
  sum_daily numeric;
  sum_residual numeric;
  applied_offsets int;
begin
  run_day := (run_at at time zone 'America/Sao_Paulo')::date;
  day_key := run_day::text;

  perform public._expire_stale_daily_payout_overrides(run_day);

  with recursive active_lots as (
    select
      p.id as profile_id,
      lot->>'id' as lot_id,
      lower(coalesce(lot->>'planKey', '')) as plan_key,
      coalesce(nullif(lot->>'units', '')::numeric, 0) as units,
      coalesce(nullif(lot->>'planPrice', '')::numeric, 0) as plan_price,
      nullif(lot->>'startAt', '')::timestamptz as start_at,
      nullif(lot->>'endAt', '')::timestamptz as end_at,
      coalesce(
        nullif(lot->>'bankId', ''),
        (
          select b.id
          from public.banks b
          where lower(coalesce(b.quota_key, '')) = lower(coalesce(lot->>'planKey', ''))
          order by case when upper(coalesce(b.status, '')) = 'ACTIVE' then 0 else 1 end, b.id asc
          limit 1
        )
      ) as bank_id,
      coalesce(
        nullif(lot->>'bankName', ''),
        (
          select b.name
          from public.banks b
          where lower(coalesce(b.quota_key, '')) = lower(coalesce(lot->>'planKey', ''))
          order by case when upper(coalesce(b.status, '')) = 'ACTIVE' then 0 else 1 end, b.id asc
          limit 1
        )
      ) as bank_name
    from public.profiles p
    cross join lateral jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) as lot
    where (lot->>'status') = 'ACTIVE'
      and run_at >= nullif(lot->>'startAt', '')::timestamptz
      and run_at < nullif(lot->>'endAt', '')::timestamptz
  ),
  credits as (
    select
      a.profile_id,
      a.lot_id,
      a.plan_key,
      a.bank_id,
      a.bank_name,
      public.get_base_daily_pct(a.plan_key) as base_daily_pct,
      coalesce(o.override_daily_pct, public.get_base_daily_pct(a.plan_key)) as effective_daily_pct,
      o.id as override_id,
      round(a.plan_price * a.units * (coalesce(o.override_daily_pct, public.get_base_daily_pct(a.plan_key)) / 100.0), 2) as amount
    from active_lots a
    left join lateral (
      select ov.*
      from public.daily_payout_overrides ov
      where ov.bank_id = a.bank_id
        and lower(coalesce(ov.quota_key, '')) = a.plan_key
        and ov.target_ymd = run_day
        and ov.payout_hour = 18
        and ov.status = 'SCHEDULED'
      order by ov.updated_at desc, ov.created_at desc
      limit 1
    ) o on true
  ),
  due as (
    select
      profile_id,
      lot_id,
      plan_key,
      bank_id,
      bank_name,
      base_daily_pct,
      effective_daily_pct,
      override_id,
      amount
    from credits
    where amount > 0 and lot_id is not null and lot_id <> ''
  ),
  ins_daily as (
    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    select
      d.profile_id,
      d.lot_id || '-daily-' || day_key,
      'DAILY',
      'Ganho diário',
      d.amount,
      'SISTEMA',
      'Creditado',
      jsonb_build_object(
        'id', d.lot_id || '-daily-' || day_key,
        'at', run_at::text,
        'kind', 'DAILY',
        'type', 'Ganho diário',
        'amount', d.amount,
        'payment', 'SISTEMA',
        'status', 'Creditado',
        'meta', jsonb_build_object(
          'lotId', d.lot_id,
          'day', day_key,
          'quotaKey', d.plan_key,
          'bankId', d.bank_id,
          'bankName', d.bank_name,
          'baseDailyPct', d.base_daily_pct,
          'effectiveDailyPct', d.effective_daily_pct,
          'overrideId', d.override_id,
          'overrideApplied', d.override_id is not null
        )
      ),
      run_at
    from due d
    where not exists (
      select 1
      from public.transactions existing_tx
      where existing_tx.profile_id = d.profile_id
        and existing_tx.external_id = d.lot_id || '-daily-' || day_key
    )
    returning profile_id, amount_usd, external_id, meta
  ),
  applied_overrides as (
    select
      nullif(ins.meta #>> '{meta,overrideId}', '')::uuid as override_id,
      sum(ins.amount_usd) as total_amount,
      count(*)::int as lots_count
    from ins_daily ins
    where coalesce(ins.meta #>> '{meta,overrideApplied}', 'false') = 'true'
      and nullif(ins.meta #>> '{meta,overrideId}', '') is not null
    group by nullif(ins.meta #>> '{meta,overrideId}', '')::uuid
  ),
  upd_overrides as (
    update public.daily_payout_overrides o
    set status = 'APPLIED',
        applied_at = now(),
        applied_run_at = run_at,
        applied_override_amount_usd = ao.total_amount,
        applied_lots_count = ao.lots_count,
        updated_at = now()
    from applied_overrides ao
    where o.id = ao.override_id
      and o.status = 'SCHEDULED'
    returning o.*, ao.total_amount, ao.lots_count
  ),
  ins_override_events as (
    insert into public.daily_payout_override_events (override_id, bank_id, quota_key, event_kind, actor_id, payload)
    select
      uo.id,
      uo.bank_id,
      uo.quota_key,
      'APPLIED',
      null,
      jsonb_build_object(
        'targetYmd', uo.target_ymd,
        'payoutHour', uo.payout_hour,
        'baseDailyPct', uo.base_daily_pct,
        'overrideDailyPct', uo.override_daily_pct,
        'appliedAmountUsd', uo.total_amount,
        'appliedLotsCount', uo.lots_count,
        'runAt', run_at
      )
    from upd_overrides uo
    returning 1
  ),
  daily_by_user as (
    select profile_id, sum(amount_usd) as total
    from ins_daily
    group by profile_id
  ),
  upd_daily as (
    update public.profiles p
    set balances =
          jsonb_set(
            coalesce(p.balances, '{}'::jsonb),
            '{available}',
            to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + d.total),
            true
          ),
        updated_at = now()
    from daily_by_user d
    where p.id = d.profile_id
    returning p.id
  ),
  base as (
    select
      profile_id as earner_id,
      amount_usd as base_amount,
      external_id as daily_ext_id
    from ins_daily
  ),
  uplines as (
    select
      b.earner_id,
      tn.referrer_profile_id as upline_id,
      1 as level,
      b.base_amount,
      b.daily_ext_id
    from base b
    join public.team_nodes tn on tn.profile_id = b.earner_id
    where tn.referrer_profile_id is not null
    union all
    select
      u.earner_id,
      tn2.referrer_profile_id,
      u.level + 1,
      u.base_amount,
      u.daily_ext_id
    from uplines u
    join public.team_nodes tn2 on tn2.profile_id = u.upline_id
    where u.level < 5 and tn2.referrer_profile_id is not null
  ),
  uplines_with_rate as (
    select
      u.*,
      upper(coalesce(p.rank_key, 'FERRO')) as rank_key,
      case upper(coalesce(p.rank_key, 'FERRO'))
        when 'FERRO' then case when u.level = 1 then 0.06::numeric else 0.03::numeric end
        when 'BRONZE' then case when u.level = 1 then 0.08::numeric else 0.04::numeric end
        when 'SILVER' then case when u.level = 1 then 0.10::numeric else 0.05::numeric end
        when 'OURO' then case when u.level = 1 then 0.15::numeric else 0.075::numeric end
        when 'DIAMOND' then case when u.level = 1 then 0.20::numeric else 0.10::numeric end
        when 'RM' then case when u.level = 1 then 0.25::numeric else 0.125::numeric end
        else case when u.level = 1 then 0.06::numeric else 0.03::numeric end
      end as pct
    from uplines u
    join public.profiles p on p.id = u.upline_id
  ),
  residuals as (
    select
      earner_id,
      upline_id,
      level,
      daily_ext_id,
      round(base_amount * pct, 2) as amount,
      pct
    from uplines_with_rate
    where pct > 0 and base_amount > 0
  ),
  ins_residual as (
    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    select
      r.upline_id,
      r.daily_ext_id || '-res-L' || r.level::text || '-' || r.upline_id::text,
      'RESIDUAL',
      'Residual diário - Nível ' || r.level::text,
      r.amount,
      'SISTEMA',
      'Creditado',
      jsonb_build_object(
        'id', r.daily_ext_id || '-res-L' || r.level::text || '-' || r.upline_id::text,
        'at', run_at::text,
        'kind', 'RESIDUAL',
        'type', 'Residual diário - Nível ' || r.level::text,
        'amount', r.amount,
        'payment', 'SISTEMA',
        'status', 'Creditado',
        'meta', jsonb_build_object('earnerId', r.earner_id, 'day', day_key, 'level', r.level, 'pct', r.pct)
      ),
      run_at
    from residuals r
    where r.amount > 0
      and not exists (
        select 1
        from public.transactions existing_tx
        where existing_tx.profile_id = r.upline_id
          and existing_tx.external_id = r.daily_ext_id || '-res-L' || r.level::text || '-' || r.upline_id::text
      )
    returning profile_id, amount_usd, external_id, meta
  ),
  residual_by_user as (
    select profile_id, sum(amount_usd) as total
    from ins_residual
    group by profile_id
  ),
  upd_residual as (
    update public.profiles p
    set balances =
          jsonb_set(
            jsonb_set(
              coalesce(p.balances, '{}'::jsonb),
              '{available}',
              to_jsonb(coalesce(nullif(p.balances->>'available', '')::numeric, 0) + r.total),
              true
            ),
            '{teamEarnings}',
            to_jsonb(coalesce(nullif(p.balances->>'teamEarnings', '')::numeric, 0) + r.total),
            true
          ),
        updated_at = now()
    from residual_by_user r
    where p.id = r.profile_id
    returning p.id
  ),
  apply_residual_offsets as (
    select public.apply_sponsorship_credit(i.profile_id, 'RESIDUAL', i.external_id, i.amount_usd, i.meta, run_at)
    from ins_residual i
  )
  select
    (select count(*) from ins_daily),
    (select count(*) from ins_residual),
    coalesce((select sum(amount_usd) from ins_daily), 0),
    coalesce((select sum(amount_usd) from ins_residual), 0),
    (select count(*) from apply_residual_offsets)
  into inserted_daily, inserted_residual, sum_daily, sum_residual, applied_offsets;

  return jsonb_build_object(
    'ok', true,
    'day', day_key,
    'dailyCount', inserted_daily,
    'dailyTotal', sum_daily,
    'residualCount', inserted_residual,
    'residualTotal', sum_residual,
    'sponsorshipOffsetCount', applied_offsets
  );
end;
$$;

drop function if exists public.create_purchase(text, int, text, text, text, text, text);
create or replace function public.create_purchase(
  plan_key text,
  units int,
  payment_currency text,
  payment_network text default null,
  payment_id text default null,
  invoice_id text default null,
  order_id text default null,
  bank_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  pk text;
  u int;
  price numeric;
  quotas_per_unit int;
  title text;
  total numeric;
  currency text;
  network text;
  now_ts timestamptz;
  now_iso text;
  available numeric;
  purchase_ext_id text;
  deposit_ext_id text;
  pay_label text;
  payment_id_norm text;
  invoice_id_norm text;
  order_id_norm text;
  lot_id text;
  lot jsonb;
  start_at timestamptz;
  end_at timestamptz;
  renew_until timestamptz;
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
  bank_row public.banks%rowtype;
begin
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  pk := lower(coalesce(plan_key, ''));
  if pk not in ('cota10', 'cota50', 'cota100') then
    raise exception 'invalid_plan';
  end if;

  u := greatest(1, least(coalesce(units, 1), 100));
  currency := upper(coalesce(payment_currency, ''));
  network := nullif(upper(coalesce(payment_network, '')), '');
  payment_id_norm := nullif(btrim(payment_id), '');
  invoice_id_norm := nullif(btrim(invoice_id), '');
  order_id_norm := nullif(btrim(order_id), '');

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

  select * into bank_row
  from public.banks b
  where (
      nullif(btrim(bank_id), '') is not null
      and b.id = nullif(btrim(bank_id), '')
    )
    or (
      nullif(btrim(bank_id), '') is null
      and lower(coalesce(b.quota_key, '')) = pk
    )
  order by
    case when nullif(btrim(bank_id), '') is not null and b.id = nullif(btrim(bank_id), '') then 0 else 1 end,
    case when upper(coalesce(b.status, '')) = 'ACTIVE' then 0 else 1 end,
    b.id asc
  limit 1;

  if bank_row.id is not null and lower(coalesce(bank_row.quota_key, '')) <> pk then
    raise exception 'bank_quota_mismatch';
  end if;

  total := round(price * u, 2);
  now_ts := now();
  now_iso := now_ts::text;

  if currency = 'SALDO' then
    if exists(select 1 from public.profiles p where p.id = uid and p.blocked) then
      raise exception 'user_blocked';
    end if;

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
      'bankId', bank_row.id,
      'bankName', bank_row.name,
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
        'meta', jsonb_build_object(
          'planKey', pk,
          'planTitle', title,
          'planPrice', price,
          'units', u,
          'quotasPerUnit', quotas_per_unit,
          'bankId', bank_row.id,
          'bankName', bank_row.name
        )
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

      perform public.apply_sponsorship_credit(rec_id, 'TE', rec_ext_id, rec_amount, rec_meta, now_ts);
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

  if payment_id_norm is null and invoice_id_norm is null and order_id_norm is null then
    raise exception 'payment_reference_required';
  end if;

  if exists(
    select 1
    from public.transactions t
    where t.kind = 'DEPOSITO'
      and (
        (payment_id_norm is not null and (t.meta #>> '{meta,paymentId}') = payment_id_norm)
        or (invoice_id_norm is not null and (t.meta #>> '{meta,invoiceId}') = invoice_id_norm)
        or (order_id_norm is not null and (t.meta #>> '{meta,orderId}') = order_id_norm)
      )
  ) then
    raise exception 'payment_reference_already_used';
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
      'meta', jsonb_build_object(
        'depositTxId', deposit_ext_id,
        'paymentId', payment_id_norm,
        'invoiceId', invoice_id_norm,
        'orderId', order_id_norm,
        'bankId', bank_row.id,
        'bankName', bank_row.name
      )
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
        'paymentId', payment_id_norm,
        'invoiceId', invoice_id_norm,
        'orderId', order_id_norm,
        'currency', currency,
        'network', network,
        'purpose', 'PURCHASE',
        'purchaseTxId', purchase_ext_id,
        'planKey', pk,
        'planTitle', title,
        'planPrice', price,
        'quotasPerUnit', quotas_per_unit,
        'units', u,
        'bankId', bank_row.id,
        'bankName', bank_row.name
      )
    ),
    now_ts
  );

  return jsonb_build_object(
    'ok', true,
    'mode', 'NOWPAYMENTS',
    'purchaseId', purchase_ext_id,
    'depositId', deposit_ext_id,
    'paymentId', payment_id_norm,
    'invoiceId', invoice_id_norm,
    'orderId', order_id_norm
  );
end;
$$;

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
begin
  select * into dep
  from public.find_nowpayments_deposit(payment_id, invoice_id, order_id);

  if dep.id is null then
    return jsonb_build_object('ok', true, 'matched', false, 'reason', 'deposit_not_found');
  end if;

  status_lc := lower(coalesce(payment_status, raw_event->>'payment_status', ''));
  confirmed := status_lc in ('finished', 'confirmed', 'sending', 'partially_paid');

  update public.transactions t
  set payment = coalesce(t.payment, 'NOWPayments'),
      status = case when confirmed then 'Concluído' else coalesce(t.status, 'Pendente') end,
      meta =
        jsonb_set(
          jsonb_set(
            jsonb_set(coalesce(t.meta, '{}'::jsonb), '{meta,paymentId}', to_jsonb(nullif(btrim(coalesce(payment_id, raw_event->>'payment_id', '')), '')), true),
            '{meta,invoiceId}', to_jsonb(nullif(btrim(coalesce(invoice_id, raw_event->>'invoice_id', '')), '')), true
          ),
          '{meta,orderId}', to_jsonb(nullif(btrim(coalesce(order_id, raw_event->>'order_id', '')), '')), true
        ),
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
      'paymentId', dep.meta #>> '{meta,paymentId}',
      'invoiceId', dep.meta #>> '{meta,invoiceId}',
      'orderId', dep.meta #>> '{meta,orderId}',
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
    and t.external_id = coalesce(dep.meta #>> '{meta,purchaseTxId}', '');

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

    perform public.apply_sponsorship_credit(rec_id, 'TE', rec_ext_id, rec_amount, rec_meta, now_ts);
  end loop;

  return jsonb_build_object('ok', true, 'matched', true, 'confirmed', true, 'applied', true);
end;
$$;

revoke all on function public.build_sponsorship_summary(jsonb) from public;
revoke all on function public.apply_sponsorship_credit(uuid, text, text, numeric, jsonb, timestamptz) from public;
revoke all on function public.admin_grant_sponsorship(uuid, text, int, text) from public;

grant execute on function public.build_sponsorship_summary(jsonb) to authenticated, service_role;
grant execute on function public.apply_sponsorship_credit(uuid, text, text, numeric, jsonb, timestamptz) to service_role;
grant execute on function public.admin_grant_sponsorship(uuid, text, int, text) to authenticated;
