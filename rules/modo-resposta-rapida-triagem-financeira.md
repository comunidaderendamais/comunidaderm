# Modo Resposta Rapida - Triagem Financeira

Guia ultra curto para primeira triagem de um incidente financeiro isolado em producao.

Use junto com:
- [checklist-validacao-financeira-pos-rodada.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-validacao-financeira-pos-rodada.md)
- [checklist-investigacao-usuario-pagamento.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-investigacao-usuario-pagamento.md)

## Como usar

Edite somente estes placeholders:
- `:login`
- `:payment_id`
- `:invoice_id`
- `:order_id`
- `:deposit_tx_id`

Se o chamado vier pelo suporte, comece por `:login`.
Se vier da NOWPayments, comece por `:payment_id` ou `:deposit_tx_id`.

## Consulta 1. Trilha principal do caso

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
  t.meta #>> '{meta,nowpaymentsStatus}' as nowpayments_status
from public.transactions t
join public.profiles p on p.id = t.profile_id
where lower(p.username) = lower(':login')
   or (':payment_id' <> '' and t.meta #>> '{meta,paymentId}' = ':payment_id')
   or (':invoice_id' <> '' and t.meta #>> '{meta,invoiceId}' = ':invoice_id')
   or (':order_id' <> '' and t.meta #>> '{meta,orderId}' = ':order_id')
   or (':deposit_tx_id' <> '' and (
        t.external_id = ':deposit_tx_id'
        or t.meta #>> '{meta,depositTxId}' = ':deposit_tx_id'
      ))
order by coalesce(t.at, t.created_at) desc;
```

## Consulta 2. Lote e origem do usuario

```sql
select
  p.username,
  lot->>'id' as lot_id,
  lot->>'planKey' as plan_key,
  lot->>'status' as status,
  lot->>'startAt' as start_at,
  lot->>'endAt' as end_at,
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

## Consulta 3. Duplicidade por external_id

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

## Alertas Rapidos

- `DEPOSITO` confirmado fora do app, mas ainda sem `Confirmado`
- `COMPRA` ou `RENEW` sem ligacao clara com `deposit_tx_id`
- lote sem `source_provider` ou sem ids de origem apos pagamento confirmado
- `TE` ausente quando deveria existir
- qualquer retorno na consulta de duplicidade

## Proximo Passo

- Se a triagem mostrar trilha incompleta, use o guia detalhado de investigacao por usuario/pagamento.
- Se a triagem mostrar anomalia ampla do dia, use o checklist de validacao financeira pos-rodada.
