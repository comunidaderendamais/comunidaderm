# Checklist - Primeira Rodada Real das 18h

Este roteiro serve para acompanhar a primeira rodada operacional real apos a implantacao da regra de **excecao diaria por banca + cota**.

Objetivo:
- confirmar que a rotina das 18h executa sem erro;
- validar taxa fixa e taxa excepcional no banco correto;
- conferir a trilha auditavel no Admin e no Supabase;
- registrar rapidamente qualquer divergencia antes da proxima rodada.

## 1. Antes das 18h

### 1.1 Confirmacao operacional

- Verificar se existe pelo menos **1 lote ativo real** no dia.
- Confirmar se havera ou nao **excecao diaria** para a rodada.
- Se houver excecao, garantir que ela esteja cadastrada no Admin antes das 18h:
  - banca correta;
  - cota correta;
  - data correta;
  - percentual correto;
  - observacao interna preenchida.

### 1.2 Conferencia visual no Admin

- Abrir o painel de **Excecao diaria das 18h**.
- Confirmar que o card da banca mostra:
  - taxa fixa correta;
  - excecao agendada correta, quando existir;
  - status esperado (`SCHEDULED`) antes da rodada.
- Se nao houver excecao, confirmar que o dia segue somente com a taxa fixa.

### 1.3 Conferencia tecnica no banco

Rodar esta consulta para listar overrides relevantes do dia:

```sql
select
  bank_id,
  quota_key,
  target_ymd,
  payout_hour,
  base_daily_pct,
  override_daily_pct,
  status,
  note,
  created_at,
  updated_at
from public.daily_payout_overrides
where target_ymd in (
  (now() at time zone 'America/Sao_Paulo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date - interval '1 day')::date
)
order by target_ymd desc, bank_id asc, quota_key asc;
```

Rodar esta consulta para medir se existem lotes ativos no momento:

```sql
select
  coalesce(nullif(lot->>'bankId', ''), 'sem-bankId') as bank_id,
  lower(coalesce(lot->>'planKey', '')) as quota_key,
  count(*) as lots_count,
  sum(coalesce(nullif(lot->>'units', '')::numeric, 0)) as units_count
from public.profiles p
cross join lateral jsonb_array_elements(coalesce(p.quota_lots, '[]'::jsonb)) as lot
where lot->>'status' = 'ACTIVE'
  and now() >= nullif(lot->>'startAt', '')::timestamptz
  and now() < nullif(lot->>'endAt', '')::timestamptz
group by 1, 2
order by 2, 1;
```

## 2. Execucao da Rodada

### 2.1 Janela de monitoracao

- Iniciar acompanhamento entre **17:58 e 18:05**.
- Confirmar se a rotina sera disparada pelo processo oficial do ambiente.
- Se a rodada for manual, registrar o horario exato da execucao.

### 2.2 Resultado esperado

- Lotes sem override usam a **taxa fixa** da cota.
- Lotes com override usam a **taxa excepcional** somente naquela rodada.
- Overrides antigos sem uso devem virar `EXPIRED`.
- Overrides do dia efetivamente usados devem virar `APPLIED`.

## 3. Logo Apos as 18h

### 3.1 Conferencia do retorno da rotina

Se a rodada for disparada manualmente, guardar a resposta de:

```sql
select public.process_daily_payouts(now());
```

Ou, se estiver usando o wrapper administrativo:

```sql
select public.admin_run_daily_payouts();
```

Campos mais importantes do retorno:
- `ok`
- `day`
- `dailyCount`
- `dailyTotal`
- `residualCount`
- `residualTotal`

### 3.2 Conferencia de ganhos diarios

```sql
select
  t.profile_id,
  t.external_id,
  t.amount_usd,
  t.at,
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
order by t.at desc, t.profile_id asc;
```

Validar:
- cada transacao diaria possui `bankId`;
- `effectiveDailyPct` bate com a taxa esperada;
- `overrideApplied = true` somente onde houve excecao;
- valores em USD batem com a cota e a taxa daquele lote.

### 3.3 Conferencia de residual

```sql
select
  t.profile_id,
  t.external_id,
  t.amount_usd,
  t.at,
  t.meta #>> '{meta,earnerId}' as earner_id,
  t.meta #>> '{meta,level}' as level,
  t.meta #>> '{meta,pct}' as pct
from public.transactions t
where t.kind = 'RESIDUAL'
  and ((coalesce(t.at, t.created_at) at time zone 'America/Sao_Paulo')::date =
       (now() at time zone 'America/Sao_Paulo')::date)
order by t.at desc, t.profile_id asc;
```

Validar:
- residual foi gerado sem erro;
- niveis e percentuais estao coerentes com a arvore real;
- nao houve duplicidade evidente.

## 4. Conferencia dos Overrides

### 4.1 Status final

```sql
select
  bank_id,
  quota_key,
  target_ymd,
  status,
  base_daily_pct,
  override_daily_pct,
  applied_at,
  applied_run_at,
  applied_lots_count,
  applied_override_amount_usd
from public.daily_payout_overrides
where target_ymd in (
  (now() at time zone 'America/Sao_Paulo')::date,
  ((now() at time zone 'America/Sao_Paulo')::date - interval '1 day')::date
)
order by target_ymd desc, bank_id asc, quota_key asc;
```

Validar:
- override usado do dia virou `APPLIED`;
- override vencido virou `EXPIRED`;
- override nao usado do dia nao deve ser marcado indevidamente;
- `applied_lots_count` e `applied_override_amount_usd` fazem sentido.

### 4.2 Trilha auditavel

```sql
select
  created_at,
  event_kind,
  bank_id,
  quota_key,
  payload
from public.daily_payout_override_events
where created_at >= now() - interval '1 day'
order by created_at asc;
```

Validar a presenca de eventos:
- `UPSERT`
- `APPLIED`
- `EXPIRED`
- `CANCELLED`, se houver cancelamento manual

## 5. Conferencia no App

### 5.1 Admin

- Abrir o painel de **Excecao diaria das 18h**.
- Confirmar se o status mudou corretamente para:
  - `APPLIED`, quando houve uso;
  - `EXPIRED`, quando a excecao venceu sem uso.
- Conferir se a trilha mostra os eventos esperados.

### 5.2 Admin do usuario

- Abrir um usuario impactado pela rodada.
- Conferir em lotes/ciclos:
  - taxa fixa da cota;
  - ultima taxa aplicada;
  - ultimo ganho diario;
  - banca do lote.

### 5.3 Historico/Admin Wallet

- Conferir se as transacoes `DAILY` exibem:
  - banca;
  - cota;
  - taxa aplicada;
  - sinalizacao de excecao do dia, quando houver.

## 6. Sinais de Alerta

Investigar imediatamente se ocorrer qualquer um destes pontos:
- `dailyCount = 0` mesmo com lote ativo real;
- override do dia nao saiu de `SCHEDULED` apos a rodada;
- `effectiveDailyPct` diferente da taxa esperada;
- transacao `DAILY` sem `bankId` em lote novo;
- valores diarios divergentes da formula da cota;
- duplicidade de `DAILY` ou `RESIDUAL` para o mesmo lote e mesmo dia;
- erro no painel Admin ou falta de atualizacao visual apos refresh.

## 7. Acao Rapida em Caso de Falha

### 7.1 Coleta minima

Registrar imediatamente:
- horario da rodada;
- retorno da funcao executada;
- banca/cota afetada;
- usuario/lote afetado;
- prints do Admin;
- resultado das consultas SQL acima.

### 7.2 Contencao

- Nao criar ajuste manual no banco sem confirmar a causa.
- Nao editar overrides ja aplicados diretamente na tabela.
- Preferir nova correcao por migration ou SQL controlado, mantendo trilha auditavel.

### 7.3 Diagnostico inicial

Hipoteses mais provaveis:
- lote sem `bankId` legado caindo em fallback inesperado;
- override cadastrado para banca/cota/data errada;
- rotina executada fora do dia esperado em `America/Sao_Paulo`;
- discrepancia entre lote ativo real e leitura esperada pelo app;
- arvore de residual incompleta para alguns usuarios;
- falha de atualizacao visual no Admin apos sucesso do banco.

## 8. Fechamento da Janela

Ao final da primeira rodada real, registrar:
- houve lote ativo real: `sim/nao`
- houve override do dia: `sim/nao`
- resultado da taxa fixa: `ok/falha`
- resultado da excecao aplicada: `ok/falha`
- resultado da expiracao sem uso: `ok/falha`
- residual diario: `ok/falha`
- inconsistencias encontradas
- acao corretiva necessaria

## 9. Observacao Importante

- Na validacao controlada anterior, os tres cenarios foram provados com transacao e `ROLLBACK`, sem deixar lixo em producao.
- Este checklist existe para a **primeira rodada real persistente**, com dados operacionais reais, logo apos as 18h.
