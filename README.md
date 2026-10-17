# Pulso Social

Agendador + analytics pessoal de **Instagram** (publicar, métricas, comentários) e **X** (só publicar).
Roda inteiro no plano grátis da Cloudflare: um Worker serve o app (PWA), a API, o cron de publicação,
o banco (D1) e a mídia (R2).

```
Celular (PWA) ──► Cloudflare Worker
                   ├─ /            app React (web/dist)
                   ├─ /api/*       API (senha → cookie de sessão)
                   ├─ /auth/*      OAuth Meta e X
                   ├─ /m/:key      mídia pública (o Instagram baixa daqui)
                   ├─ cron 1 min   publica posts vencidos / continua vídeos processando
                   └─ cron 06h     coleta métricas do Instagram
                  D1 (SQLite) · R2 (arquivos)
```

## Estrutura

| Pasta | O quê |
|---|---|
| `worker/` | Backend (Hono). `instagram.ts` e `x.ts` falam com as APIs; `publisher.ts` é a máquina de publicação em etapas; `stats.ts` agrega métricas |
| `migrations/` | Esquema do banco D1 |
| `web/` | Front-end React + Vite (PWA) |
| `docs-recon/` | Análise do app Metricool e o mock visual |

## Rodar local

```bash
npm install
cp .dev.vars.example .dev.vars   # edite a senha
npm run db:migrate:local
npm run dev                      # http://localhost:8787
```

Para mexer só no visual com recarga instantânea: `npm run dev:web` (com o `npm run dev` rodando em outro terminal).

## Colocar no ar (uma vez)

1. **Cloudflare**: crie a conta e rode `npx wrangler login`.
2. Banco e storage:
   ```bash
   npx wrangler d1 create pulso          # copie o database_id para o wrangler.toml
   npx wrangler r2 bucket create pulso-media
   npm run db:migrate
   ```
3. Primeiro deploy (`npm run deploy`) para descobrir a URL `https://pulso-social.<voce>.workers.dev`.
   Coloque essa URL em `PUBLIC_URL` no `wrangler.toml`.
4. Segredos:
   ```bash
   npx wrangler secret put APP_PASSWORD
   npx wrangler secret put SESSION_SECRET     # qualquer texto longo e aleatório
   npx wrangler secret put META_APP_ID
   npx wrangler secret put META_APP_SECRET
   npx wrangler secret put X_CLIENT_ID
   npx wrangler secret put X_CLIENT_SECRET
   ```
5. **Meta for Developers** (developers.facebook.com): app do tipo *Empresa*, produto *Facebook Login for Business*
   + *Instagram Graph API*. URL de redirecionamento: `PUBLIC_URL/auth/meta/callback`.
   Permissões: `instagram_basic, instagram_content_publish, instagram_manage_insights, instagram_manage_comments,
   pages_show_list, pages_read_engagement, business_management`. Para uso próprio o app pode ficar em
   **modo de desenvolvimento** (você é admin), sem App Review.
6. **X Developer** (developer.x.com): plano Free, app com *OAuth 2.0*, tipo *Web App (confidential client)*,
   permissão *Read and write*. Callback: `PUBLIC_URL/auth/x/callback`.
7. `npm run deploy`, abra a URL no celular → **Adicionar à tela inicial** → Ajustes → conectar as contas.

## Limites conhecidos

- **Instagram**: ~100 posts publicados via API a cada 24 h; vídeos de Reels são processados pelo Instagram
  (o post fica "Publicando" até terminar). A API **não** lista quem seguiu/deixou de seguir, só os totais por dia.
- **X (Free)**: só publicação, cota mensal pequena; o Pulso envia texto, threads e até 4 imagens (vídeo ainda não).
- **Upload**: até 95 MB por arquivo (limite de requisição do Workers grátis).
- Métricas aparecem a partir da primeira coleta (logo após conectar e depois todo dia às 06h).
