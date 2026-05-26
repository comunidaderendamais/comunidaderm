# Regras de Ganhos de Equipe (FASE 1)

Este documento descreve as regras implementadas no app para **Ganhos de Equipe**: **Taxa de Entrada (TE / Indicação)**, **Residual (até 5º nível)**, **Rank (qualificação e premiação)** e **Bolsão Elite**.

## 1) Conceitos e fontes (FASE 1)

- Persistência: `localStorage` (simulação).
- Referência de patrocinador: URL `.../ref/:username` (username único).
- Pagamentos:
  - Residual: simulado na tela **Equipes** (botão “Simular pagamento do residual (18h)”).
  - TE: **automático** somente quando a compra é **Concluída** via **SALDO**.
  - Bolsão Elite: simulação quinzenal via **Admin** (“Simular pagamento (15 dias)”).

## 2) Ganhos das Cotas (ciclo de 6 meses)

### 2.1 Regra de base

- Cada cota possui crescimento diario com referencia mensal apresentada no material oficial do projeto.
- A leitura adotada no app segue a base oficial da apresentacao:
  - **COTA 10**: **1% ao dia**, **30% ao mes**, equivalente a **6x 30%** no ciclo de **6 meses**
  - **COTA 50**: **1,1% ao dia**, **33% ao mes**, equivalente a **6x 33%** no ciclo de **6 meses**
  - **COTA 100**: **1,2% ao dia**, **36% ao mes**, equivalente a **6x 36%** no ciclo de **6 meses**
- O ciclo de cada lote eh individual e comeca na **data e hora exatas da compra**, encerrando-se **6 meses** depois.

### 2.2 Tabela oficial por cota

| Cota | Valor base (USD) | Ganho diario | Ganho mensal | Projecao em 6 meses |
|---|---:|---:|---:|---:|
| COTA 10 | 10,00 | 1% ao dia / **US$ 0,10** | 30% ao mes / **US$ 3,00** | 180% / **US$ 18,00** |
| COTA 50 | 50,00 | 1,1% ao dia / **US$ 0,55** | 33% ao mes / **US$ 16,50** | 198% / **US$ 99,00** |
| COTA 100 | 100,00 | 1,2% ao dia / **US$ 1,20** | 36% ao mes / **US$ 36,00** | 216% / **US$ 216,00** |

### 2.3 Leitura no app

- Na tela **Carteira > Ciclos ativos**, cada lote exibe uma **barra de evolucao** do proprio ciclo de 6 meses.
- A barra considera o intervalo entre `startAt` e `endAt`, respeitando o instante real da compra.
- Ao clicar no lote, o app abre um **popup curto** com:
  - ganho diario, mensal e do ciclo;
  - leitura **por cota**;
  - leitura **do lote atual** (quando houver mais de uma unidade no mesmo lote).

### 2.4 Excecao diaria de Admin (rodada das 18h)

- A taxa fixa de cada cota continua sendo a regra oficial do sistema:
  - **COTA 10**: `1% ao dia`
  - **COTA 50**: `1,1% ao dia`
  - **COTA 100**: `1,2% ao dia`
- Quando necessario, o **Admin** pode cadastrar uma **excecao diaria** por **banca + cota**, valida apenas para a **rodada das 18h** de um dia especifico.
- Exemplo: em determinado dia, a **COTA 10** da banca correspondente pode sair de `1%` para `1,5%` apenas naquela rodada.
- Depois que a rodada excepcional eh processada, o sistema retorna **automaticamente** para a taxa fixa original da cota.
- Toda alteracao fica com **trilha auditavel**, incluindo agendamento, cancelamento, aplicacao automatica e expiracao sem uso.

## 3) Ganhos de Indicação (TE – Taxa de Entrada)

### 3.1 Regra de base

- A **taxa de entrada (TE)** é **10%** do valor da compra.
- Pagamento por níveis (cadeia de indicação até 3 níveis):
  - **1º nível**: **40%** da TE
  - **2º nível**: **20%** da TE
  - **3º nível**: **10%** da TE

### 3.2 Momento do pagamento

- O pagamento do TE ocorre **somente** quando a compra é feita com **SALDO** e fica **Concluída**.
- Compras cripto (modo simulação) ficam como **Pendente** e não disparam TE na FASE 1.

### 3.3 Quando não há patrocinador (ou faltam níveis)

- Se o comprador não tem patrocinador, ou se a cadeia não tem níveis suficientes, o valor daquele nível vai para o usuário **admin**: `comunidaderendamais@gmail.com`.

## 4) Residual (Ganhos por Mérito – até 5º nível)

### 4.1 Regra de base

- O residual é calculado sobre o volume de compras/participação da equipe até o **5º nível**.
- A taxa depende do **Rank atual** do usuário.
- Do **2º ao 5º nível**, a taxa é **50% da taxa do 1º nível** (por nível).

### 4.2 Tabela de Residual (por Rank)

| Rank | 1º Nível | 2º ao 5º Nível |
|---|---:|---:|
| Ferro | 6% | 3% |
| Bronze | 8% | 4% |
| Silver | 10% | 5% |
| Ouro | 15% | 7,5% |
| Diamond | 20% | 10% |
| Diamond RM | 25% | 12,5% |

### 4.3 Pagamento (FASE 1)

- Na FASE 1, o residual é **simulado** na tela **Equipes**.
- Na FASE 2, a intenção é pagamento automático diário às **18h**.

## 5) Rank (qualificação e premiação)

### 5.1 Volume para rank (ponderação 100% / 50%)

Para apurar volume de rank:
- Soma **100% do 1º nível** (diretos).
- Soma **50% do 2º ao 5º nível** (indiretos).

### 5.2 Perna (direto) e “Máx. por perna”

- Cada indicado direto é uma **perna**.
- Regra implementada: **máximo de 50% do target do rank por perna**.
  - Ex.: para OURO (target 5.000), cada perna pode contribuir no máximo **2.500**.
- O “máx. por perna” é aplicado a partir de **BRONZE** (targets ≥ 200).

### 5.3 Targets e premiações (recompensa de rank)

| Rank | Target (USD) | Prêmio (USD) |
|---|---:|---:|
| Ferro | 10 | 0 |
| Bronze | 200 | 10 |
| Silver | 2.000 | 100 |
| Ouro | 5.000 | 300 |
| Diamond | 15.000 | 1.200 |
| Diamond RM | 50.000 | 3.000 |

Observação: a premiação de rank é exibida no app como trilha/informação (pode ser evoluída para pagamento automático em uma fase posterior).

## 6) Bolsão Elite (Top 10 líderes – lucro quinzenal)

### 6.1 Regra do pool

- O **Bolsão Elite** é **10%** do lucro quinzenal informado no **Admin**.

### 6.2 Distribuição por vagas (10 líderes)

- **SILVER**: 4 vagas, **5% por vaga** (total 20% do pool)
- **OURO**: 2 vagas, **10% por vaga** (total 20% do pool)
- **DIAMOND**: 2 vagas, **15% por vaga** (total 30% do pool)
- **DIAMOND RM**: 2 vagas, **15% por vaga** (total 30% do pool)

### 6.3 Ordem de chegada e “segurar vaga”

- Cada categoria usa **ordem de chegada** pelo timestamp do momento em que o usuário atingiu aquele rank (`achievedAt`).
- Regra adicional implementada: **segurar a vaga anterior**.
  - Se um líder tem vaga em SILVER e sobe para OURO, mas OURO está cheio, ele **continua ocupando SILVER** até surgir vaga em OURO.
  - O mesmo vale nas transições para DIAMOND e DIAMOND RM.
- Alocação é feita de cima para baixo: primeiro tenta preencher **DIAMOND RM**, depois **DIAMOND**, depois **OURO**, e por fim **SILVER**.

### 6.4 Pagamento (FASE 1)

- O pagamento é simulado pelo **Admin** e gera transações e notificações para os líderes ocupando vagas.
