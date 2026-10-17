export interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ASSETS: Fetcher;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  META_APP_ID: string;
  META_APP_SECRET: string;
  X_CLIENT_ID: string;
  X_CLIENT_SECRET: string;
  PUBLIC_URL?: string;
  GRAPH_VERSION: string;
  TIMEZONE: string;
}

export interface Account {
  id: string;
  network: 'instagram' | 'x';
  external_id: string;
  username: string | null;
  name: string | null;
  avatar: string | null;
  access_token: string;
  refresh_token: string | null;
  token_expires_at: number | null;
  created_at: number;
}

export type PostType = 'feed' | 'carousel' | 'reel' | 'story' | 'x';
export type PostStatus = 'draft' | 'scheduled' | 'processing' | 'published' | 'error';

export interface MediaRef {
  key: string;
  mime: string;
}

export interface PostRow {
  id: string;
  account_id: string | null;
  network: 'instagram' | 'x';
  type: PostType;
  caption: string;
  media: string;
  thread: string;
  scheduled_at: number | null;
  status: PostStatus;
  progress: string;
  external_id: string | null;
  permalink: string | null;
  error: string | null;
  attempts: number;
  locked_until: number | null;
  published_at: number | null;
  created_at: number;
  updated_at: number;
}

/** Result of one publishing step: done, still waiting on the network (try next tick), or failed. */
export type StepResult =
  | { state: 'published'; externalId: string; permalink?: string }
  | { state: 'waiting'; progress: unknown }
  | { state: 'failed'; error: string; retry: boolean };

export const uid = () => crypto.randomUUID().replace(/-/g, '').slice(0, 16);
export const now = () => Date.now();

export function publicUrl(env: Env, req?: Request): string {
  if (env.PUBLIC_URL) return env.PUBLIC_URL.replace(/\/$/, '');
  if (req) return new URL(req.url).origin;
  throw new Error('Defina PUBLIC_URL no wrangler.toml');
}

export function mediaUrl(base: string, key: string) {
  return `${base}/m/${key}`;
}
