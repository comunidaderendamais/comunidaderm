# Publicacao Front em Producao (Cloudflare)

Este projeto web e um front `Vite` estatico.

- Comando de build: `npm run build`
- Saida publicada: `dist/`
- Entradas geradas: `/` e `/auth/`
- Pre-build obrigatorio: `scripts/sync-apn-pdfs.mjs`

## Variaveis de ambiente

Configure no projeto da Cloudflare apenas o que o front realmente precisa:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

Opcional:

- `VITE_NOWPAYMENTS_API_BASE`

Evite expor em producao:

- `SUPABASE_SERVICE_ROLE_KEY`
- `NOWPAYMENTS_API_KEY`
- `NOWPAYMENTS_IPN_SECRET`
- `NOWPAYMENTS_PUBLIC_KEY`
- `VITE_NOWPAYMENTS_API_KEY`

Observacao:

- O fluxo principal da NOWPayments no front usa as Edge Functions do Supabase.
- `VITE_NOWPAYMENTS_API_KEY` so deve ser usado como ultimo fallback, porque qualquer variavel `VITE_*` fica publica no build final.

## Passo a passo curto

1. No painel da Cloudflare, abra o projeto do front em producao.
2. Em `Settings > Environment variables`, confira:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
3. Em `Build configuration`, use:
   - Build command: `npm ci && npm run build`
   - Build output directory: `dist`
4. Garanta que o Node da Cloudflare esteja em versao atual compativel com Vite 8.
5. Gere um novo deploy da branch de producao.
6. Apos publicar, valide:
   - home carregando sem tela branca
   - pagina `/auth/`
   - login funcionando
   - tela `Cotas`
   - bloco `Historico de compras (Cotas)` no mobile
   - imagem `/PERSONAGEM RENDA MAIS com LOGO.png`

## Validacao local antes do deploy

Rode localmente em `app/web`:

```bash
npm ci
npm run build
```

Se o build passar, o deploy estatico da Cloudflare deve usar exatamente a pasta `dist/`.

## Publicacao manual pelo painel

Se o projeto da Cloudflare ja estiver conectado ao repositorio:

1. Suba o commit para a branch de producao.
2. Abra `Deployments`.
3. Acione o novo deploy da branch correta.
4. Aguarde a conclusao e valide o site publicado.

Se a publicacao for por upload manual:

1. Gere o build com `npm run build`.
2. Envie o conteudo de `dist/` para a publicacao do projeto na Cloudflare.

## Comando pronto por CLI

Se voce usa `wrangler`, o comando base e:

```bash
npx wrangler pages deploy dist --project-name <NOME_DO_PROJETO> --branch main
```

Substitua `<NOME_DO_PROJETO>` pelo nome real do projeto na Cloudflare Pages.

## Checklist pos-deploy

- `Cotas` abre normalmente em desktop e mobile.
- `Historico de compras (Cotas)` aparece em cards no mobile, sem depender de rolagem horizontal.
- Compras concluidas aparecem com status coerente.
- Fluxos de login e leitura do Supabase funcionam sem erro de ambiente.
- Assets em `public/` carregam normalmente.

## Observacao operacional

O ajuste visual do historico mobile ja esta no codigo. Se a producao ainda mostrar o layout antigo, o problema nao sera de regra de negocio e sim de deploy/cache da Cloudflare ou da branch publicada.
