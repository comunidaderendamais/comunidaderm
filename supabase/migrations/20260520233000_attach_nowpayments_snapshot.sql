create or replace function public.attach_nowpayments_snapshot(
  deposit_id text,
  payment_snapshot jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  dep public.transactions%rowtype;
  snapshot jsonb;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if deposit_id is null or btrim(deposit_id) = '' then
    raise exception 'deposit_id_required';
  end if;

  select *
  into dep
  from public.transactions t
  where t.profile_id = uid
    and t.kind = 'DEPOSITO'
    and t.external_id = deposit_id
  order by coalesce(t.at, t.created_at) desc
  limit 1;

  if dep is null then
    raise exception 'deposit_not_found';
  end if;

  snapshot := coalesce(payment_snapshot, '{}'::jsonb);
  if jsonb_typeof(snapshot) is distinct from 'object' then
    raise exception 'invalid_snapshot';
  end if;

  snapshot := jsonb_strip_nulls(
    snapshot || jsonb_build_object(
      'paymentId', to_jsonb(coalesce(nullif(snapshot->>'paymentId', ''), dep.meta #>> '{meta,paymentId}')),
      'invoiceId', to_jsonb(coalesce(nullif(snapshot->>'invoiceId', ''), dep.meta #>> '{meta,invoiceId}')),
      'orderId', to_jsonb(coalesce(nullif(snapshot->>'orderId', ''), dep.meta #>> '{meta,orderId}')),
      'checkoutUrl', to_jsonb(nullif(coalesce(snapshot->>'checkoutUrl', ''), '')),
      'qrCodeUrl', to_jsonb(nullif(coalesce(snapshot->>'qrCodeUrl', ''), '')),
      'payAddress', to_jsonb(coalesce(nullif(snapshot->>'payAddress', ''), nullif(snapshot->>'pay_address', ''))),
      'payAmount', coalesce(snapshot->'payAmount', snapshot->'pay_amount'),
      'payCurrency', to_jsonb(coalesce(nullif(snapshot->>'payCurrency', ''), nullif(snapshot->>'pay_currency', ''))),
      'paymentStatus', to_jsonb(coalesce(nullif(snapshot->>'paymentStatus', ''), nullif(snapshot->>'payment_status', '')))
    )
  );

  update public.transactions t
  set meta = jsonb_set(coalesce(dep.meta, '{}'::jsonb), '{meta,nowpaymentsSnapshot}', snapshot, true)
  where t.id = dep.id;

  return jsonb_build_object(
    'ok', true,
    'depositId', dep.external_id,
    'snapshot', snapshot
  );
end;
$$;

revoke all on function public.attach_nowpayments_snapshot(text, jsonb) from public;
grant execute on function public.attach_nowpayments_snapshot(text, jsonb) to authenticated;
