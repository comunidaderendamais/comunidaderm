create or replace function public.upsert_my_transactions(items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  elem jsonb;
  ext_id text;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if jsonb_typeof(items) <> 'array' then
    raise exception 'items_must_be_array';
  end if;

  for elem in select * from jsonb_array_elements(items)
  loop
    ext_id := nullif(elem->>'id', '');
    if ext_id is null then
      raise exception 'transaction_id_required';
    end if;

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      uid,
      ext_id,
      nullif(elem->>'kind', ''),
      nullif(elem->>'type', ''),
      coalesce((elem->>'amount')::numeric, 0),
      nullif(elem->>'payment', ''),
      coalesce(nullif(elem->>'status', ''), 'created'),
      elem,
      nullif(elem->>'at', '')::timestamptz
    )
    on conflict (profile_id, external_id)
    do update set
      kind = excluded.kind,
      type = excluded.type,
      amount_usd = excluded.amount_usd,
      payment = excluded.payment,
      status = excluded.status,
      meta = excluded.meta,
      at = excluded.at;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.admin_upsert_transactions(target_id uuid, items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  elem jsonb;
  ext_id text;
begin
  if not public.is_admin() then
    raise exception 'not_admin';
  end if;

  if target_id is null then
    raise exception 'target_id_required';
  end if;

  if jsonb_typeof(items) <> 'array' then
    raise exception 'items_must_be_array';
  end if;

  for elem in select * from jsonb_array_elements(items)
  loop
    ext_id := nullif(elem->>'id', '');
    if ext_id is null then
      raise exception 'transaction_id_required';
    end if;

    insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
    values (
      target_id,
      ext_id,
      nullif(elem->>'kind', ''),
      nullif(elem->>'type', ''),
      coalesce((elem->>'amount')::numeric, 0),
      nullif(elem->>'payment', ''),
      coalesce(nullif(elem->>'status', ''), 'created'),
      elem,
      nullif(elem->>'at', '')::timestamptz
    )
    on conflict (profile_id, external_id)
    do update set
      kind = excluded.kind,
      type = excluded.type,
      amount_usd = excluded.amount_usd,
      payment = excluded.payment,
      status = excluded.status,
      meta = excluded.meta,
      at = excluded.at;
  end loop;

  return jsonb_build_object('ok', true);
end;
$$;
