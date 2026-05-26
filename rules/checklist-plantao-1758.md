# Checklist de Plantao - 17:58

Versao curta para uso operacional em tempo real, imediatamente antes e depois da rodada das 18h.

Use este roteiro junto com o checklist completo:
- [checklist-primeira-rodada-real.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-primeira-rodada-real.md)

## Execucao Rapida

1. Confirmar se existe pelo menos `1 lote ativo real` no momento.
2. Confirmar se ha `override` do dia e se ele esta em `SCHEDULED` no Admin.
3. Revisar rapidamente se a banca, a cota, a data e o percentual do override estao corretos.
4. Abrir o painel do Admin de excecao diaria e deixar a tela pronta para refresh.
5. Entre `17:58` e `18:05`, confirmar se a rotina oficial rodou ou disparar o procedimento manual previsto.
6. Guardar o retorno da execucao e conferir: `ok`, `dailyCount`, `dailyTotal`, `residualCount`, `residualTotal`.
7. Verificar no banco se as transacoes `DAILY` do dia vieram com `bankId`, `quotaKey`, `effectiveDailyPct` e `overrideApplied`.
8. Conferir se o override usado virou `APPLIED` e se override vencido virou `EXPIRED`.
9. Validar no Admin do usuario e no historico se a taxa aplicada e o valor do ganho diario aparecem corretamente.
10. Se houver divergencia, registrar horario, retorno, banca/cota, usuario afetado, prints e consultas SQL antes de qualquer ajuste manual.

## SQL Rapido

### Lotes ativos agora

```sql
select
  coalesce(nullif(lot->>'bankId', ''), 'sem-bankId') as bank_id,
  lower(coalesce(lot->>'planKey', '')) as quota_key,
  count(*) as lots_count
from public.profiles p
cross join lateral jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) as lot
where lot->>'status' = 'ACTIVE'
  and now() >= nullif(lot->>'startAt', '')::timestamptz
  and now() < nullif(lot->>'endAt', '')::timestamptz
group by 1, 2
order by 2, 1;
```

### Overrides do dia

```sql
select
  bank_id,
  quota_key,
  target_ymd,
  status,
  base_daily_pct,
  override_daily_pct,
  applied_lots_count,
  applied_override_amount_usd
from public.daily_payout_overrides
where target_ymd in (
  (now() at time zone 'America/Sao_Paulo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date - interval '1 day')::date
)
order by target_ymd desc, bank_id asc, quota_key asc;
```

### Ganhos diarios do dia

```sql
select
  t.profile_id,
  t.external_id,
  t.amount_usd,
  t.meta #>> '{meta,bankId}' as bank_id,
  t.meta #>> '{meta,quotaKey}' as quota_key,
  t.meta #>> '{meta,effectiveDailyPct}' as effective_daily_pct,
  t.meta #>> '{meta,overrideApplied}' as override_applied
from public.transactions t
where t.kind = 'DAILY'
  and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
order by t.at desc, t.profile_id asc;
```

## Alertas Imediatos

- `dailyCount = 0` com lote ativo real
- override ficou em `SCHEDULED` apos a rodada
- `effectiveDailyPct` diferente do esperado
- `DAILY` sem `bankId`
- valor diario divergente da cota
- duplicidade de `DAILY` ou `RESIDUAL`
