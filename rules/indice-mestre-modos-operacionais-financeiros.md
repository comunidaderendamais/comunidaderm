# Indice Mestre - Modos Operacionais Financeiros

Este arquivo liga os tres modos operacionais financeiros do projeto e responde uma pergunta simples: **qual guia usar primeiro em cada tipo de incidente**.

## Os 3 Modos

### 1. Triagem Inicial

Use quando:
- o chamado acabou de chegar
- voce ainda nao sabe se o problema e pontual ou amplo
- precisa de resposta em poucos minutos

Guia:
- [modo-resposta-rapida-triagem-financeira.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/modo-resposta-rapida-triagem-financeira.md)

Entrega:
- trilha principal do caso
- checagem rapida de lote/origem
- deteccao de duplicidade por `external_id`

### 2. Investigacao Isolada

Use quando:
- o problema parece afetar um usuario especifico
- voce ja tem `login`, `payment_id`, `invoice_id`, `order_id` ou `deposit_tx_id`
- precisa entender a trilha completa de um caso individual

Guia:
- [checklist-investigacao-usuario-pagamento.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-investigacao-usuario-pagamento.md)

Entrega:
- trilha completa entre `DEPOSITO`, `COMPRA`, `RENEW`, `TE` e `quota_lots`
- validacao por identificadores do pagamento
- apoio para incidentes de NOWPayments e compra/renovacao isolada

### 3. Validacao Pos-Rodada

Use quando:
- o problema parece afetar o dia inteiro
- ha suspeita de falha ampla em `DAILY`, `RESIDUAL`, `TE` ou NOWPayments
- voce precisa validar o comportamento da rodada em producao

Guia:
- [checklist-validacao-financeira-pos-rodada.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-validacao-financeira-pos-rodada.md)

Entrega:
- leitura do dia para `DAILY`, `RESIDUAL`, `TE` e NOWPayments
- verificacao de compras e renovacoes liquidadas
- consulta de duplicidade por `external_id` no dia

## Fluxo Rapido de Decisao

1. Chegou um incidente novo e ainda esta confuso:
   use `Triagem Inicial`

2. A triagem mostrou que o problema e de um usuario ou pagamento especifico:
   use `Investigacao Isolada`

3. A triagem mostrou sinais de impacto amplo no dia ou na rodada:
   use `Validacao Pos-Rodada`

## Atalhos Praticos

- Chamado do suporte com username:
  comece por `Triagem Inicial`, depois avance para `Investigacao Isolada`

- Confirmacao NOWPayments que nao refletiu no app:
  comece por `Triagem Inicial`
  se o caso for individual, avance para `Investigacao Isolada`

- Suspeita de erro geral apos as 18h:
  va direto para `Validacao Pos-Rodada`

## Observacao

- Este indice mestre existe para simplificar a navegacao operacional da equipe.
- Ele nao substitui os guias; ele apenas indica qual deles usar primeiro.
