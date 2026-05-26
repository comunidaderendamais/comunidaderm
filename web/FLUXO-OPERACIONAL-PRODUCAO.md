# Fluxo Operacional de Producao

Use este roteiro como caminho unico para publicar, validar e aprovar o front em producao na Cloudflare.

## 1. Preparar

Confirme o ambiente antes de publicar:

- Projeto: front `Vite` estatico
- Comando de build: `npm ci && npm run build`
- Pasta publicada: `dist/`
- Entradas geradas: `/` e `/auth/`

Confirme no painel da Cloudflare:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Nao publique no front:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`
- `NOWPAYMENTS_PUBLIC_KEY`
- `VITE_NOWPAYMENTS_API_KEY`

Validacao local recomendada:

```bash
npm ci
npm run build
```

Se o build falhar, nao publique.

## 2. Publicar

### Opcao A: projeto conectado ao repositorio

1. Suba o commit para a branch de producao.
2. Abra `Deployments` na Cloudflare.
3. Gere o deploy da branch correta.
4. Aguarde a conclusao do build.

### Opcao B: upload manual

1. Gere `dist/` com `npm run build`.
2. Envie o conteudo da pasta `dist/` para a publicacao do projeto.

### Opcao C: CLI com Wrangler

```bash
npx wrangler pages deploy dist --project-name <NOME_DO_PROJETO> --branch main
```

## 3. Validar em 60s

Logo apos o deploy, valide em producao:

1. Home
   - sem tela branca
   - logo e imagem do suporte carregando
   - sem erro visual imediato

2. `/auth/`
   - pagina abre normalmente
   - sem redirecionamento quebrado

3. Login
   - conta de teste entra normalmente
   - dashboard carrega
   - sem erro de ambiente Supabase

4. `Cotas`
   - cards/lotes aparecem
   - `Historico de compras (Cotas)` abre normal
   - no mobile o historico aparece em cards
   - nao depende de rolagem horizontal

5. Compra concluida
   - status coerente
   - valor coerente
   - pagamento coerente

6. Assets finais
   - `/PERSONAGEM RENDA MAIS com LOGO.png`
   - PDFs/APN abrindo
   - sem layout quebrado em modal, botao ou bloco principal

## 4. Aprovar

Considere o deploy aprovado quando:

- build concluido sem erro
- login e dashboard funcionando
- tela `Cotas` validada
- historico mobile exibido em cards
- assets principais carregando
- nenhuma regressao visual imediata encontrada

## 5. Se algo falhar

- Layout antigo do historico: revisar cache da Cloudflare e branch publicada.
- Tela branca ou erro de login: revisar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Asset ausente: revisar `public/` e o conteudo final de `dist/`.
- Comportamento diferente do local: revisar se o deploy usou o build mais recente.

## 6. Decisao Rapida

- Passou tudo: aprovar deploy.
- Falhou algo visual leve: checar cache e repetir validacao.
- Falhou login, ambiente ou assets criticos: bloquear aprovacao e corrigir antes de liberar.

## Observacao

Para esta entrega, o ajuste do `Historico de compras (Cotas)` ja esta implementado no codigo. Se a producao ainda mostrar o formato antigo, trate primeiro como problema de deploy, cache ou branch, nao como ausencia de implementacao.
