# Regras de Ganhos de Equipe (FASE 1)

Este documento descreve as regras implementadas no app para **Ganhos de Equipe**: **Taxa de Entrada (TE / Indicação)**, **Residual (até 5º nível)**, **Rank (qualificação e premiação)** e **Bolsão Elite**.

## 1) Conceitos e fontes (FASE 1)

- Persistência: `localStorage` (simulação).
- Referência de patrocinador: URL `.../ref/:username` (username único).
- Pagamentos:
  - Residual: simulado na tela **Equipes** (botão “Simular pagamento do residual (18h)”).
  - TE: **automático** somente quando a compra é **Concluída** via **SALDO**.
  - Bolsão Elite: simulação quinzenal via **Admin** (“Simular pagamento (15 dias)”).

## 2) Ganhos de Indicação (TE – Taxa de Entrada)

### 2.1 Regra de base

- A **taxa de entrada (TE)** é **10%** do valor da compra.
- Pagamento por níveis (cadeia de indicação até 3 níveis):
  - **1º nível**: **40%** da TE
  - **2º nível**: **20%** da TE
  - **3º nível**: **10%** da TE

### 2.2 Momento do pagamento

- O pagamento do TE ocorre **somente** quando a compra é feita com **SALDO** e fica **Concluída**.
- Compras cripto (modo simulação) ficam como **Pendente** e não disparam TE na FASE 1.

### 2.3 Quando não há patrocinador (ou faltam níveis)

- Se o comprador não tem patrocinador, ou se a cadeia não tem níveis suficientes, o valor daquele nível vai para o usuário **admin**: `rmadmin@gmail.com`.

## 3) Residual (Ganhos por Mérito – até 5º nível)

### 3.1 Regra de base

- O residual é calculado sobre o volume de compras/participação da equipe até o **5º nível**.
- A taxa depende do **Rank atual** do usuário.
- Do **2º ao 5º nível**, a taxa é **50% da taxa do 1º nível** (por nível).

### 3.2 Tabela de Residual (por Rank)

| Rank | 1º Nível | 2º ao 5º Nível |
|---|---:|---:|
| Ferro | 6% | 3% |
| Bronze | 8% | 4% |
| Silver | 10% | 5% |
| Ouro | 15% | 7,5% |
| Diamond | 20% | 10% |
| Diamond RM | 25% | 12,5% |

### 3.3 Pagamento (FASE 1)

- Na FASE 1, o residual é **simulado** na tela **Equipes**.
- Na FASE 2, a intenção é pagamento automático diário às **18h**.

## 4) Rank (qualificação e premiação)

### 4.1 Volume para rank (ponderação 100% / 50%)

Para apurar volume de rank:
- Soma **100% do 1º nível** (diretos).
- Soma **50% do 2º ao 5º nível** (indiretos).

### 4.2 Perna (direto) e “Máx. por perna”

- Cada indicado direto é uma **perna**.
- Regra implementada: **máximo de 50% do target do rank por perna**.
  - Ex.: para OURO (target 5.000), cada perna pode contribuir no máximo **2.500**.
- O “máx. por perna” é aplicado a partir de **BRONZE** (targets ≥ 200).

### 4.3 Targets e premiações (recompensa de rank)

| Rank | Target (USD) | Prêmio (USD) |
|---|---:|---:|
| Ferro | 10 | 0 |
| Bronze | 200 | 10 |
| Silver | 2.000 | 100 |
| Ouro | 5.000 | 300 |
| Diamond | 15.000 | 1.200 |
| Diamond RM | 50.000 | 3.000 |

Observação: a premiação de rank é exibida no app como trilha/informação (pode ser evoluída para pagamento automático em uma fase posterior).

## 5) Bolsão Elite (Top 10 líderes – lucro quinzenal)

### 5.1 Regra do pool

- O **Bolsão Elite** é **10%** do lucro quinzenal informado no **Admin**.

### 5.2 Distribuição por vagas (10 líderes)

- **SILVER**: 4 vagas, **5% por vaga** (total 20% do pool)
- **OURO**: 2 vagas, **10% por vaga** (total 20% do pool)
- **DIAMOND**: 2 vagas, **15% por vaga** (total 30% do pool)
- **DIAMOND RM**: 2 vagas, **15% por vaga** (total 30% do pool)

### 5.3 Ordem de chegada e “segurar vaga”

- Cada categoria usa **ordem de chegada** pelo timestamp do momento em que o usuário atingiu aquele rank (`achievedAt`).
- Regra adicional implementada: **segurar a vaga anterior**.
  - Se um líder tem vaga em SILVER e sobe para OURO, mas OURO está cheio, ele **continua ocupando SILVER** até surgir vaga em OURO.
  - O mesmo vale nas transições para DIAMOND e DIAMOND RM.
- Alocação é feita de cima para baixo: primeiro tenta preencher **DIAMOND RM**, depois **DIAMOND**, depois **OURO**, e por fim **SILVER**.

### 5.4 Pagamento (FASE 1)

- O pagamento é simulado pelo **Admin** e gera transações e notificações para os líderes ocupando vagas.

