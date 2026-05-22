# Checklist de Validacao Financeira Pos-Rodada

Versao curta para conferir em producao os fluxos `DAILY`, `RESIDUAL`, `TE` e NOWPayments logo apos a rodada ou apos uma confirmacao de pagamento.

Use junto com:
- [checklist-primeira-rodada-real.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-primeira-rodada-real.md)
- [checklist-plantao-1758.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-plantao-1758.md)

## 1. DAILY do dia

```sql
select
  t.profile_id,
  t.external_id,
  t.amount_usd,
  coalesce(t.at, t.created_at) as at,
  t.meta #>> '{meta,bankId}' as bank_id,
  t.meta #>> '{meta,bankName}' as bank_name,
  t.meta #>> '{meta,quotaKey}' as quota_key,
  t.meta #>> '{meta,baseDailyPct}' as base_daily_pct,
  t.meta #>> '{meta,effectiveDailyPct}' as effective_daily_pct,
  t.meta #>> '{meta,overrideApplied}' as override_applied
from public.transactions t
where t.kind = 'DAILY'
  and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
order by coalesce(t.at, t.created_at) desc, t.profile_id asc;
```

Validar:
- toda transacao `DAILY` tem `external_id`
- `bank_id` e `quota_key` vieram preenchidos
- `effective_daily_pct` bate com a taxa esperada
- `override_applied = true` apenas quando houve excecao

## 2. RESIDUAL do dia

```sql
select
  t.profile_id,
  t.external_id,
  t.amount_usd,
  coalesce(t.at, t.created_at) as at,
  t.meta #>> '{meta,earnerId}' as earner_id,
  t.meta #>> '{meta,level}' as level,
  t.meta #>> '{meta,pct}' as pct
from public.transactions t
where t.kind = 'RESIDUAL'
  and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
order by coalesce(t.at, t.created_at) desc, t.profile_id asc;
```

Validar:
- `external_id` segue o padrao do `DAILY` de origem
- `level` e `pct` fazem sentido para a arvore real
- nao existe duplicidade visual do mesmo residual para mesmo `external_id`

## 3. TE do dia

```sql
select
  t.profile_id,
  t.external_id,
  t.amount_usd,
  coalesce(t.at, t.created_at) as at,
  t.meta #>> '{meta,buyerId}' as buyer_id,
  coalesce(t.meta #>> '{meta,paymentId}', t.meta #>> '{meta,purchaseId}') as source_ref,
  t.meta #>> '{meta,level}' as level,
  t.meta #>> '{meta,pct}' as pct
from public.transactions t
where t.kind = 'TE'
  and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
order by coalesce(t.at, t.created_at) desc, t.profile_id asc;
```

Validar:
- todo `TE` tem `external_id`
- `buyer_id` aponta para a compra/pagamento de origem
- `source_ref` veio preenchido por `paymentId` ou `purchaseId`
- os niveis esperados foram creditados sem duplicidade evidente

## 4. Depositos NOWPayments do dia

```sql
select
  t.profile_id,
  t.external_id as deposit_tx_id,
  t.status,
  t.amount_usd,
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
where t.kind = 'DEPOSITO'
  and t.meta #>> '{meta,provider}' = 'NOWPAYMENTS'
  and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
order by coalesce(t.at, t.created_at) desc, t.profile_id asc;
```

Validar:
- `payment_id`, `invoice_id` ou `order_id` vieram preenchidos
- `status` do deposito acompanha `nowpayments_status`
- pagamento confirmado deve aparecer como `Confirmado`
- `purpose` e `plan_key` estao coerentes com a operacao

## 5. Compras e renovacoes liquidadas por NOWPayments

```sql
select
  t.profile_id,
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
where t.kind in ('COMPRA', 'RENEW')
  and t.payment ilike '%USDT%'
  and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
order by coalesce(t.at, t.created_at) desc, t.profile_id asc;
```

Validar:
- compras confirmadas aparecem como `Concluido` ou `Concluído`
- renovacoes confirmadas nao ficam presas em `Pendente`
- `deposit_tx_id` aponta para o deposito correspondente

## 6. Duplicidade por external_id no dia

```sql
select
  t.kind,
  t.profile_id,
  t.external_id,
  count(*) as total_rows,
  min(coalesce(t.at, t.created_at)) as first_at,
  max(coalesce(t.at, t.created_at)) as last_at
from public.transactions t
where ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
  and t.kind in ('DAILY', 'RESIDUAL', 'TE', 'DEPOSITO', 'COMPRA', 'RENEW')
  and t.external_id is not null
group by t.kind, t.profile_id, t.external_id
having count(*) > 1
order by total_rows desc, last_at desc;
```

Validar:
- o ideal e retornar zero linhas
- qualquer linha aqui merece investigacao imediata

## 7. Alertas Imediatos

- `DAILY` do dia sem `bank_id`, `quota_key` ou `effective_daily_pct`
- `RESIDUAL` com `level` vazio ou sem relacao clara com o `DAILY`
- `TE` sem `buyer_id` ou sem referencia de origem
- deposito NOWPayments `Finished/confirmed` fora do app, mas `status` ainda diferente de `Confirmado`
- `COMPRA` ou `RENEW` presa em `Aguardando deposito` ou `Pendente` apos deposito confirmado
- qualquer retorno na consulta de duplicidade por `external_id`

## 8. Acao Rapida

- Guardar o horario da rodada ou do pagamento confirmado
- Copiar o resultado das consultas com anomalia
- Registrar `payment_id`, `invoice_id`, `order_id` e `deposit_tx_id` quando houver NOWPayments
- Evitar ajuste manual direto sem confirmar antes a funcao/RPC responsavel
