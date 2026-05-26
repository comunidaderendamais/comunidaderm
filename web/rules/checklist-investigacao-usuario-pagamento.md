# Checklist de Investigacao por Usuario ou Pagamento

Guia curto para investigar um caso isolado em producao, quando o problema afeta um usuario especifico ou um pagamento NOWPayments especifico, sem depender da rodada inteira.

Use junto com:
- [checklist-validacao-financeira-pos-rodada.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-validacao-financeira-pos-rodada.md)
- [checklist-primeira-rodada-real.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-primeira-rodada-real.md)

## 1. Como usar

Edite os placeholders abaixo antes de executar:
- `:login` -> username do usuario, exemplo `alfabrazil`
- `:payment_id` -> id do pagamento NOWPayments
- `:invoice_id` -> id da invoice NOWPayments
- `:order_id` -> order id salvo na compra
- `:deposit_tx_id` -> `external_id` da transacao `DEPOSITO`

Quando nao souber um identificador, comece por `login` e depois avance para os ids encontrados nas consultas seguintes.

## 2. Perfil do usuario

```sql
select
  p.id,
  p.email,
  p.username,
  p.user_id,
  p.rank_key,
  p.referrer_username,
  p.created_at,
  p.updated_at,
  p.balances,
  p.holdings
from public.profiles p
where lower(p.username) = lower(':login');
```

Validar:
- o `login` retornou exatamente um usuario
- `balances` e `holdings` fazem sentido para o caso

## 3. Ultimas transacoes do usuario

```sql
select
  t.kind,
  t.external_id,
  t.status,
  t.amount_usd,
  t.payment,
  coalesce(t.at, t.created_at) as at,
  t.meta
from public.transactions t
join public.profiles p on p.id = t.profile_id
where lower(p.username) = lower(':login')
order by coalesce(t.at, t.created_at) desc
limit 50;
```

Validar:
- existe `DEPOSITO`, `COMPRA`, `RENEW` ou `TE` relacionado ao caso
- os `external_id` relevantes podem ser reaproveitados nas consultas seguintes

## 4. Depositos NOWPayments do usuario

```sql
select
  p.username,
  t.profile_id,
  t.external_id as deposit_tx_id,
  t.status,
  t.amount_usd,
  t.payment,
  coalesce(t.at, t.created_at) as at,
  t.meta #>> '{meta,paymentId}' as payment_id,
  t.meta #>> '{meta,invoiceId}' as invoice_id,
  t.meta #>> '{meta,orderId}' as order_id,
  t.meta #>> '{meta,nowpaymentsStatus}' as nowpayments_status,
  t.meta #>> '{meta,purpose}' as purpose,
  t.meta #>> '{meta,planKey}' as plan_key,
  t.meta #>> '{meta,network}' as network,
  t.meta #>> '{meta,currency}' as currency
from public.transactions t
join public.profiles p on p.id = t.profile_id
where t.kind = 'DEPOSITO'
  and t.meta #>> '{meta,provider}' = 'NOWPAYMENTS'
  and lower(p.username) = lower(':login')
order by coalesce(t.at, t.created_at) desc;
```

Validar:
- `payment_id`, `invoice_id` ou `order_id` aparecem
- `status` do deposito acompanha `nowpayments_status`
- pagamento confirmado deve refletir `Confirmado`

## 5. Busca direta por identificadores do pagamento

```sql
select
  p.username,
  t.kind,
  t.external_id,
  t.status,
  t.amount_usd,
  t.payment,
  coalesce(t.at, t.created_at) as at,
  t.meta #>> '{meta,paymentId}' as payment_id,
  t.meta #>> '{meta,invoiceId}' as invoice_id,
  t.meta #>> '{meta,orderId}' as order_id,
  t.meta #>> '{meta,depositTxId}' as deposit_tx_id,
  t.meta
from public.transactions t
join public.profiles p on p.id = t.profile_id
where
  (':payment_id' <> '' and t.meta #>> '{meta,paymentId}' = ':payment_id')
  or (':invoice_id' <> '' and t.meta #>> '{meta,invoiceId}' = ':invoice_id')
  or (':order_id' <> '' and t.meta #>> '{meta,orderId}' = ':order_id')
  or (':deposit_tx_id' <> '' and t.external_id = ':deposit_tx_id')
order by coalesce(t.at, t.created_at) desc;
```

Validar:
- o conjunto deve mostrar a trilha completa do caso
- confirme se o mesmo identificador aparece coerentemente entre `DEPOSITO`, `COMPRA`, `RENEW` e `TE`

## 6. Compra ou renovacao ligadas ao deposito

```sql
select
  p.username,
  t.kind,
  t.external_id,
  t.status,
  t.amount_usd,
  t.payment,
  coalesce(t.at, t.created_at) as at,
  t.meta #>> '{meta,depositTxId}' as deposit_tx_id,
  t.meta #>> '{meta,paymentId}' as payment_id,
  t.meta #>> '{meta,invoiceId}' as invoice_id,
  t.meta #>> '{meta,orderId}' as order_id,
  t.meta #>> '{meta,oldLotId}' as old_lot_id,
  t.meta #>> '{meta,newLotId}' as new_lot_id
from public.transactions t
join public.profiles p on p.id = t.profile_id
where lower(p.username) = lower(':login')
  and t.kind in ('COMPRA', 'RENEW')
order by coalesce(t.at, t.created_at) desc;
```

Validar:
- `COMPRA` confirmada nao fica em `Aguardando depósito`
- `RENEW` confirmada nao fica em `Pendente`
- `deposit_tx_id` casa com o deposito investigado

## 7. TE ligado ao caso

```sql
select
  p.username,
  t.profile_id,
  t.external_id,
  t.status,
  t.amount_usd,
  coalesce(t.at, t.created_at) as at,
  t.meta #>> '{meta,buyerId}' as buyer_id,
  t.meta #>> '{meta,paymentId}' as payment_id,
  t.meta #>> '{meta,purchaseId}' as purchase_id,
  t.meta #>> '{meta,level}' as level,
  t.meta #>> '{meta,pct}' as pct
from public.transactions t
join public.profiles p on p.id = t.profile_id
where t.kind = 'TE'
  and (
    (':payment_id' <> '' and t.meta #>> '{meta,paymentId}' = ':payment_id')
    or (':deposit_tx_id' <> '' and t.external_id like ':deposit_tx_id' || '-te-%')
    or (':login' <> '' and t.meta #>> '{meta,buyerId}' = (
      select p2.id::text
      from public.profiles p2
      where lower(p2.username) = lower(':login')
      limit 1
    ))
  )
order by coalesce(t.at, t.created_at) desc;
```

Validar:
- `TE` esperado foi gerado para os niveis certos
- nao ha duplicidade evidente para o mesmo `external_id`

## 8. Lotes do usuario

```sql
select
  p.username,
  lot->>'id' as lot_id,
  lot->>'planKey' as plan_key,
  lot->>'planTitle' as plan_title,
  lot->>'status' as status,
  lot->>'units' as units,
  lot->>'planPrice' as plan_price,
  lot->>'bankId' as bank_id,
  lot->>'bankName' as bank_name,
  lot->>'startAt' as start_at,
  lot->>'endAt' as end_at,
  lot->>'renewUntil' as renew_until,
  lot #>> '{source,provider}' as source_provider,
  lot #>> '{source,paymentId}' as source_payment_id,
  lot #>> '{source,invoiceId}' as source_invoice_id,
  lot #>> '{source,orderId}' as source_order_id,
  lot #>> '{source,depositTxId}' as source_deposit_tx_id
from public.profiles p
cross join lateral jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) as lot
where lower(p.username) = lower(':login')
order by nullif(lot->>'startAt', '')::timestamptz desc nulls last;
```

Validar:
- o lote foi criado ou renovado apos a confirmacao esperada
- `source_provider` e referencias de origem batem com o pagamento analisado

## 9. Duplicidade por external_id no caso

```sql
select
  t.kind,
  t.profile_id,
  t.external_id,
  count(*) as total_rows,
  min(coalesce(t.at, t.created_at)) as first_at,
  max(coalesce(t.at, t.created_at)) as last_at
from public.transactions t
join public.profiles p on p.id = t.profile_id
where lower(p.username) = lower(':login')
  and t.external_id is not null
group by t.kind, t.profile_id, t.external_id
having count(*) > 1
order by total_rows desc, last_at desc;
```

Validar:
- o ideal e retornar zero linhas
- qualquer linha aqui merece investigacao imediata

## 10. Alertas Imediatos

- deposito NOWPayments `Finished/confirmed` fora do app, mas `DEPOSITO.status` ainda diferente de `Confirmado`
- `COMPRA` ou `RENEW` sem ligacao clara com `deposit_tx_id`
- lote sem `source_provider` ou sem ids de origem apos pagamento confirmado
- `TE` ausente quando deveria existir
- duplicidade por `external_id`

## 11. Acao Rapida

- comece por `login` quando o caso vier do suporte
- troque para `payment_id`, `invoice_id`, `order_id` ou `deposit_tx_id` assim que encontrar um identificador confiavel
- copie as linhas relevantes de `DEPOSITO`, `COMPRA`, `RENEW`, `TE` e `quota_lots`
- evite ajuste manual antes de confirmar qual RPC ou rotina deveria ter concluido o fluxo
