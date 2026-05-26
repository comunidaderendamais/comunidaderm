# Checklist 60s Pos-Deploy

Use este roteiro logo apos publicar o front em producao.

## Em 60 segundos

1. Abra a home e confirme:
   - sem tela branca
   - logo e imagem do suporte carregando
   - sem erro visual imediato

2. Abra `/auth/` e confirme:
   - pagina abre normalmente
   - sem redirecionamento quebrado

3. Faça login com uma conta de teste e confirme:
   - dashboard carrega
   - sem aviso de ambiente Supabase ausente

4. Entre em `Cotas` e confirme:
   - os cards/lotes aparecem
   - o bloco `Historico de compras (Cotas)` abre normal
   - no mobile ele aparece em cards, sem depender de rolagem horizontal

5. Confira uma compra concluida e valide:
   - status coerente
   - valor coerente
   - meio de pagamento coerente

6. Faça uma ultima passada visual:
   - imagem `/PERSONAGEM RENDA MAIS com LOGO.png`
   - PDFs/APN abrindo
   - sem layout quebrado em botao, modal ou tabela principal

## Se algo falhar

- Layout antigo do historico: revisar cache da Cloudflare e branch publicada.
- Tela branca ou erro de login: revisar `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY`.
- Asset ausente: revisar arquivos em `public/` e o build publicado em `dist/`.

## Resultado esperado

Se todos os itens acima passarem, o deploy do front pode ser considerado validado para esta entrega.
