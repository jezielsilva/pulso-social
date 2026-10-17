# Recon: Metricool Android 3.24.7

Análise estática (nada executado) do XAPK `com.ionicframework.metricool185346-3.24.7`.

## Stack do app
- Ionic + Capacitor (Vue/Vite). Toda a lógica está no bundle web `assets/public/assets/index-*.js` (~5,6 MB), e o nativo é só uma casca.
- Plugins: social-login (Google/Apple), RevenueCat (assinatura), push e notificações locais, file picker, mídia, send-intent (compartilhar para o app).
- Backend: `app.metricool.com`, com APIs `api/stats/*` (legado) e `api/v2/*` (novo).
- Integrações: Google Drive, Canva, Pexels, Giphy, chat Crisp, Cloudflare Stream.

## Módulos (rotas)
- **Scheduler (Planner):** calendário, agenda, dia, biblioteca de mídia, posts apagados, notificações, tarefas e aprovações de posts.
- **Analytics por rede:** Instagram, X/Twitter, FB, TikTok, YouTube, LinkedIn, Threads, Bluesky, Pinterest, Twitch, GMB, Ads e Web.
- **Concorrentes** por rede, **relatórios** (listar e criar), resumo cross-rede.
- **Inbox:** conversas, comentários, reviews, notas internas com menções.
- **IA:** `v2/integrations/ai/posts`, quick-actions, idiomas.
- **Melhor horário:** `v2/scheduler/besttimes/`.
- **Hashtags e sugestões:** `actions/instagram/suggestions/hashtags`, `actions/twitter/suggestions`.

## Instagram
- Tipos de post: FEED_IMAGE, FEED_VIDEO, CAROUSEL_ALBUM, REEL, TRIAL_REEL, STORY, além de tag de produto, áudio e colabs.
- Métricas de post: views, interactions, likes, comments, saved, shares (orgânico e pago), com timeline por post.
- Conta: seguidores (cidade, país, idioma), alcance, reels e stories publicados, concorrentes.
- Fonte real: Instagram Graph API (conta Business/Creator ligada a uma Página FB).

## X/Twitter
- Métricas: engagement, impressions, likes, linkClicks, profileClicks, quotes, replies, retweets, videoViews, bookmarks.
- Seguidores ganhos e perdidos por dia (follows/unfollows), seguidores de 2º nível, concorrentes.
- Fonte real: X API v2. O plano Basic é pago e o Free só posta, então é preciso decidir o tier.

## Onde superar (uso pessoal)
1. Histórico ilimitado e bruto no próprio Postgres (o Metricool limita por plano).
2. Seguidores ganhos e perdidos *por pessoa* no IG (snapshot diário), não só o saldo.
3. IA de verdade com Claude: legenda no seu tom, análise semanal automática, "por que esse post foi bem", reaproveitar post do IG como thread no X.
4. Melhor horário calculado com os *seus* dados (histograma de engajamento por hora e dia da semana).
5. Ranking e testes A/B de hashtags com base no desempenho real.
6. Alertas: post viralizando, queda de alcance, comentário que precisa de resposta.
7. Exportação/API própria e dashboards customizáveis.
