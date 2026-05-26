# Roteiro Operacional - Teste Real com 3 Contas

Este roteiro foi feito para execucao controlada em ambiente real, com foco em:
- cadastro e confirmacao por e-mail;
- reset e redefinicao de senha;
- validacao da rede por indicacao;
- compra real via NOWPayments;
- conferencia da comissao de `TE` com evidencia.

Use este arquivo durante a rodada de teste e marque cada item com:
- `OK`
- `Falhou`
- `Evidencia`

Arquivos relacionados:
- [checklist-primeira-rodada-real.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-primeira-rodada-real.md)
- [checklist-plantao-1758.md](file:///e:/DEVELOP-25/RENDA%20MAIS/PROJETO2026/app/web/rules/checklist-plantao-1758.md)

## 1. Identificacao da Rodada

- Data:
- Responsavel:
- Ambiente:
- URL validada:
- Janela do teste:
- Observacoes gerais:

## 2. Pre-Deploy e Pre-Go-Live

### 2.1 Ambiente

- Item: variaveis de ambiente de producao conferidas
  - Resultado:
  - Evidencia:
  - Conferir: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, secrets das functions, credenciais NOWPayments, URLs publicas, callback `/auth`

- Item: templates de e-mail do Supabase conferidos
  - Resultado:
  - Evidencia:
  - Conferir: `confirm sign up` e `reset password` apontando para producao

- Item: Edge Functions da NOWPayments publicadas
  - Resultado:
  - Evidencia:
  - Conferir: deploy concluido, sem erro de auth, CORS ou referencia ausente

- Item: frontend publicado com a versao correta
  - Resultado:
  - Evidencia:
  - Conferir: dominio final, assets atualizados e build valida

### 2.2 Criterio para iniciar

Prosseguir para o teste real somente se:
- o ambiente estiver publicado;
- os e-mails estiverem chegando corretamente;
- a URL `/auth` estiver abrindo em producao;
- a criacao de cobranca NOWPayments estiver operacional.

## 3. Contas do Teste

### 3.1 Conta A

- Nome:
- Usuario:
- E-mail:
- Papel no teste: conta base / raiz da validacao

### 3.2 Conta B

- Nome:
- Usuario:
- E-mail:
- Papel no teste: conta cadastrada pela indicacao da Conta A

### 3.3 Conta C

- Nome:
- Usuario:
- E-mail:
- Papel no teste: conta usada para compra real e validacao de `TE`

## 4. Fluxo da Conta A

### 4.1 Cadastro

- Item: cadastro da Conta A realizado
  - Resultado:
  - Evidencia:

- Item: e-mail de confirmacao recebido
  - Resultado:
  - Evidencia:
  - Conferir: remetente, assunto e link correto

- Item: confirmacao concluida via `/auth`
  - Resultado:
  - Evidencia:
  - Esperado: conta ativada e login liberado

- Item: login da Conta A funcionando
  - Resultado:
  - Evidencia:

### 4.2 Reset de senha

- Item: solicitacao de reset enviada
  - Resultado:
  - Evidencia:

- Item: e-mail de reset recebido
  - Resultado:
  - Evidencia:

- Item: nova senha definida com sucesso
  - Resultado:
  - Evidencia:

- Item: login com a nova senha funcionando
  - Resultado:
  - Evidencia:

- Item: senha antiga rejeitada
  - Resultado:
  - Evidencia:

## 5. Fluxo da Conta B

- Item: link de indicacao da Conta A copiado
  - Resultado:
  - Evidencia:
  - Link usado:

- Item: cadastro da Conta B realizado usando o link da Conta A
  - Resultado:
  - Evidencia:

- Item: e-mail de confirmacao recebido e concluido
  - Resultado:
  - Evidencia:

- Item: login da Conta B funcionando
  - Resultado:
  - Evidencia:

- Item: Conta B aparece na rede da Conta A
  - Resultado:
  - Evidencia:
  - Esperado: posicionamento correto em `Team` e/ou `Admin`

## 6. Fluxo da Conta C

- Item: cadastro da Conta C realizado na estrutura planejada
  - Resultado:
  - Evidencia:

- Item: e-mail de confirmacao recebido e concluido
  - Resultado:
  - Evidencia:

- Item: login da Conta C funcionando
  - Resultado:
  - Evidencia:

- Item: Conta C aparece na rede na posicao esperada
  - Resultado:
  - Evidencia:
  - Esperado: arvore correta para validar `TE`

## 7. Compra Real via NOWPayments

### 7.1 Geracao da cobranca

- Item: acesso a aba `Quotas` validado na Conta C
  - Resultado:
  - Evidencia:

- Item: plano, quantidade, moeda e rede conferidos antes de pagar
  - Resultado:
  - Evidencia:

- Item: cobranca NOWPayments gerada com sucesso
  - Resultado:
  - Evidencia:
  - Registrar: `payment_id`, `invoice_id`, `order_id`

### 7.2 Pagamento

- Item: pagamento real concluido
  - Resultado:
  - Evidencia:
  - Registrar: valor, ativo, rede, horario

- Item: checkout retornou sem erro visivel
  - Resultado:
  - Evidencia:

### 7.3 Conciliacao

- Item: compra conciliada automaticamente
  - Resultado:
  - Evidencia:
  - Esperado: sem ajuste manual indevido

- Item: compra aparece no historico da Conta C
  - Resultado:
  - Evidencia:

- Item: cota/lote aparece na Conta C
  - Resultado:
  - Evidencia:
  - Esperado: reflexo em `Quotas`, `Wallet` e `Reports`

## 8. Validacao da Rede e da TE

### 8.1 Estrutura

- Item: rede final A -> B -> C ou estrutura planejada confirmada
  - Resultado:
  - Evidencia:

- Item: nenhuma conta caiu em perna ou upline indevida
  - Resultado:
  - Evidencia:

### 8.2 Comissao de TE

- Item: `TE` registrada na conta superior correta
  - Resultado:
  - Evidencia:
  - Conta beneficiada:

- Item: valor da `TE` confere com a regra vigente
  - Resultado:
  - Evidencia:
  - Valor esperado:
  - Valor encontrado:

- Item: `TE` nao foi duplicada
  - Resultado:
  - Evidencia:

- Item: `TE` aparece em historico, admin ou trilha auditavel
  - Resultado:
  - Evidencia:

## 9. Evidencias Minimas a Guardar

Guardar ao final do teste:
- prints do cadastro e confirmacao;
- print do reset concluido;
- print da arvore/rede;
- print da cobranca NOWPayments;
- print do historico da compra;
- print da `TE` creditada;
- `payment_id`;
- `invoice_id`;
- `order_id`;
- `deposit_id`, se houver;
- horario do pagamento;
- valor pago.

## 10. Registro Tecnico

- `Conta A`:
- `Conta B`:
- `Conta C`:
- `payment_id`:
- `invoice_id`:
- `order_id`:
- `deposit_id`:
- horario do pagamento:
- valor pago:
- observacoes tecnicas:

## 11. Resultado Final

- Cadastro: `OK / Falhou`
- Confirmacao por e-mail: `OK / Falhou`
- Reset de senha: `OK / Falhou`
- Rede por indicacao: `OK / Falhou`
- Compra real via NOWPayments: `OK / Falhou`
- Conciliacao: `OK / Falhou`
- `TE`: `OK / Falhou`
- Status final da rodada: `Aprovado / Aprovado com ressalvas / Reprovado`

## 12. Criterio de Encerramento

### 12.1 Aprovado

Quando:
- as 3 contas concluem cadastro e login;
- confirmacao e reset funcionam;
- a compra real conclui corretamente;
- a rede fica posicionada como esperado;
- a `TE` e registrada no lugar certo, no valor certo e sem duplicidade.

### 12.2 Aprovado com ressalvas

Quando:
- o fluxo principal funciona;
- existem ajustes menores de UX, observabilidade ou apresentacao;
- nao existe risco financeiro imediato.

### 12.3 Reprovado

Quando houver falha em qualquer ponto critico:
- auth;
- confirmacao por e-mail;
- reset;
- conciliao do pagamento;
- criacao da compra;
- posicionamento da rede;
- lancamento da `TE`.

## 13. Reflexao Pos-Rodada

Ao terminar, registrar em 3 a 5 linhas:
- o que funcionou bem;
- o que precisou de atencao manual;
- o que deve ser ajustado antes do proximo teste real;
- se o fluxo esta pronto para nova rodada sem supervisao intensa.
