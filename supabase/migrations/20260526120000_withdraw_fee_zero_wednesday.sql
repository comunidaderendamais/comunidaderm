create or replace function public.request_withdrawal(
  amount_usd numeric,
  asset text,
  network text,
  address text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid;
  amt numeric;
  fee numeric;
  net numeric;
  avail numeric;
  addr text;
  pay_label text;
  ext_id text;
  now_ts timestamptz;
  now_iso text;
  local_ts timestamp;
  local_dow int;
begin
  uid := auth.uid();
  if uid is null then
    raise exception 'not_authenticated';
  end if;

  if exists(select 1 from public.profiles p where p.id = uid and p.blocked) then
    raise exception 'user_blocked';
  end if;

  amt := round(coalesce(amount_usd, 0), 2);
  if amt < 10 then
    raise exception 'min_withdraw_10';
  end if;

  now_ts := now();
  now_iso := now_ts::text;
  local_ts := now_ts at time zone 'America/Sao_Paulo';
  local_dow := extract(dow from local_ts);

  fee := case when local_dow = 3 then 0 else 2 end;
  net := greatest(0, round(amt - fee, 2));
  if net <= 0 then
    raise exception 'withdraw_net_invalid';
  end if;

  avail := coalesce(nullif((select p.balances->>'available' from public.profiles p where p.id = uid), '')::numeric, 0);
  if avail < amt then
    raise exception 'insufficient_balance';
  end if;

  addr := btrim(coalesce(address, ''));
  if addr = '' then
    raise exception 'address_required';
  end if;

  pay_label := upper(coalesce(asset, '')) || ' ' || upper(coalesce(network, ''));
  ext_id := gen_random_uuid()::text;

  update public.profiles p
  set balances =
        jsonb_set(
          coalesce(p.balances, '{}'::jsonb),
          '{available}',
          to_jsonb(avail - amt),
          true
        ),
      updated_at = now_ts
  where p.id = uid;

  insert into public.transactions (profile_id, external_id, kind, type, amount_usd, payment, status, meta, at)
  values (
    uid,
    ext_id,
    'SAQUE',
    'Solicitação de saque',
    -amt,
    btrim(pay_label),
    'Solicitado',
    jsonb_build_object(
      'id', ext_id,
      'at', now_iso,
      'kind', 'SAQUE',
      'type', 'Solicitação de saque',
      'amount', -amt,
      'payment', btrim(pay_label),
      'status', 'Solicitado',
      'meta', jsonb_build_object('feeUsd', fee, 'netUsd', net, 'address', addr)
    ),
    now_ts
  );

  return jsonb_build_object('ok', true, 'id', ext_id, 'feeUsd', fee, 'netUsd', net);
end;
$$;

revoke all on function public.request_withdrawal(numeric, text, text, text) from public;
grant execute on function public.request_withdrawal(numeric, text, text, text) to authenticated;
