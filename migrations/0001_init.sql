-- Contas conectadas (Instagram via Página do Facebook, X via OAuth 2.0)
CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  network TEXT NOT NULL CHECK (network IN ('instagram','x')),
  external_id TEXT NOT NULL,
  username TEXT,
  name TEXT,
  avatar TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE (network, external_id)
);

-- Posts agendados / rascunhos / publicados
-- type: feed | carousel | reel | story | x
-- media: JSON [{key, mime}]   thread: JSON ["tweet 2", "tweet 3"]
-- progress: JSON com o estado da publicação em etapas (containers do IG)
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  network TEXT NOT NULL,
  type TEXT NOT NULL,
  caption TEXT NOT NULL DEFAULT '',
  media TEXT NOT NULL DEFAULT '[]',
  thread TEXT NOT NULL DEFAULT '[]',
  scheduled_at INTEGER,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','scheduled','processing','published','error')),
  progress TEXT NOT NULL DEFAULT '{}',
  external_id TEXT,
  permalink TEXT,
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER,
  published_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX posts_due ON posts (status, scheduled_at);

-- Métricas diárias da conta (mesmas do Metricool: seguidores, ganhos/perdidos, alcance, views, interações...)
CREATE TABLE account_daily (
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  followers INTEGER,
  follows INTEGER,
  unfollows INTEGER,
  reach INTEGER,
  views INTEGER,
  interactions INTEGER,
  likes INTEGER,
  comments INTEGER,
  shares INTEGER,
  saves INTEGER,
  profile_views INTEGER,
  PRIMARY KEY (account_id, date)
);

-- Última leitura das métricas de cada post do Instagram
CREATE TABLE post_metrics (
  external_id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  media_type TEXT,
  product_type TEXT,
  caption TEXT,
  permalink TEXT,
  thumb TEXT,
  posted_at INTEGER,
  views INTEGER DEFAULT 0,
  reach INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saved INTEGER DEFAULT 0,
  interactions INTEGER DEFAULT 0,
  fetched_at INTEGER NOT NULL
);
CREATE INDEX post_metrics_time ON post_metrics (account_id, posted_at);

-- Biblioteca de mídia (arquivos no R2)
CREATE TABLE media (
  key TEXT PRIMARY KEY,
  name TEXT,
  mime TEXT NOT NULL,
  size INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

-- Textos salvos / grupos de hashtags
CREATE TABLE snippets (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

-- Estado temporário de OAuth
CREATE TABLE oauth_state (
  state TEXT PRIMARY KEY,
  verifier TEXT,
  created_at INTEGER NOT NULL
);
