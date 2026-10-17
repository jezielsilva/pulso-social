// X API v2 — só publicação (plano Free). OAuth 2.0 com PKCE.
import { type Env, type Account, type PostRow, type MediaRef, type StepResult } from './env';

export const X_SCOPES = 'tweet.read tweet.write users.read media.write offline.access';
const API = 'https://api.x.com/2';

export function authUrl(env: Env, base: string, state: string, challenge: string) {
  const u = new URL('https://x.com/i/oauth2/authorize');
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', env.X_CLIENT_ID);
  u.searchParams.set('redirect_uri', `${base}/auth/x/callback`);
  u.searchParams.set('scope', X_SCOPES);
  u.searchParams.set('state', state);
  u.searchParams.set('code_challenge', challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  return u.toString();
}

async function tokenRequest(env: Env, params: Record<string, string>) {
  const res = await fetch(`${API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + btoa(`${env.X_CLIENT_ID}:${env.X_CLIENT_SECRET}`),
    },
    body: new URLSearchParams({ client_id: env.X_CLIENT_ID, ...params }),
  });
  const j: any = await res.json();
  if (!res.ok) throw new Error(j.error_description || j.error || `X token HTTP ${res.status}`);
  return j as { access_token: string; refresh_token?: string; expires_in: number };
}

export async function exchangeCode(env: Env, base: string, code: string, verifier: string) {
  const t = await tokenRequest(env, { grant_type: 'authorization_code', code, redirect_uri: `${base}/auth/x/callback`, code_verifier: verifier });
  const me = await fetch(`${API}/users/me?user.fields=profile_image_url,name,username`, { headers: { Authorization: `Bearer ${t.access_token}` } });
  const u: any = await me.json();
  if (!me.ok) throw new Error(u.detail || 'Falha ao ler o perfil do X');
  return {
    external_id: u.data.id as string, username: u.data.username as string, name: u.data.name as string,
    avatar: (u.data.profile_image_url ?? null) as string | null,
    access_token: t.access_token, refresh_token: t.refresh_token ?? null, token_expires_at: Date.now() + t.expires_in * 1000,
  };
}

/** Garante token válido (renova 5 min antes de expirar) e persiste o novo par. */
async function freshToken(env: Env, acc: Account) {
  if (acc.token_expires_at && acc.token_expires_at - 300_000 > Date.now()) return acc.access_token;
  if (!acc.refresh_token) throw new Error('Token do X expirou. Reconecte a conta.');
  const t = await tokenRequest(env, { grant_type: 'refresh_token', refresh_token: acc.refresh_token });
  const exp = Date.now() + t.expires_in * 1000;
  await env.DB.prepare('UPDATE accounts SET access_token=?, refresh_token=?, token_expires_at=? WHERE id=?')
    .bind(t.access_token, t.refresh_token ?? acc.refresh_token, exp, acc.id).run();
  acc.access_token = t.access_token;
  acc.refresh_token = t.refresh_token ?? acc.refresh_token;
  acc.token_expires_at = exp;
  return t.access_token;
}

async function uploadImage(env: Env, token: string, m: MediaRef) {
  const obj = await env.MEDIA.get(m.key);
  if (!obj) throw new Error('Arquivo de mídia não encontrado');
  const form = new FormData();
  form.append('media', new Blob([await obj.arrayBuffer()], { type: m.mime }));
  form.append('media_category', m.mime === 'image/gif' ? 'tweet_gif' : 'tweet_image');
  const res = await fetch(`${API}/media/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.detail || j.title || `Upload no X falhou (HTTP ${res.status})`), { status: res.status });
  return (j.data?.id ?? j.media_id_string) as string;
}

async function tweet(token: string, body: Record<string, unknown>) {
  const res = await fetch(`${API}/tweets`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(j.detail || j.title || `X HTTP ${res.status}`), { status: res.status });
  return j.data.id as string;
}

interface Progress { ids?: string[] }

/** Publica post + thread. Guarda os ids já publicados para não duplicar se falhar no meio. */
export async function publishStep(env: Env, post: PostRow, acc: Account): Promise<StepResult> {
  const media: MediaRef[] = JSON.parse(post.media);
  const parts = [post.caption, ...(JSON.parse(post.thread) as string[])].map((s) => s.trim()).filter(Boolean);
  const p: Progress = JSON.parse(post.progress || '{}');
  p.ids ??= [];
  if (!parts.length && !media.length) return { state: 'failed', error: 'Post vazio.', retry: false };
  if (parts.some((t) => [...t].length > 280)) return { state: 'failed', error: 'Algum post passa de 280 caracteres.', retry: false };
  if (media.some((m) => m.mime.startsWith('video/'))) return { state: 'failed', error: 'Vídeo no X ainda não é suportado pelo Pulso (só imagens).', retry: false };

  try {
    const token = await freshToken(env, acc);
    for (let i = p.ids.length; i < Math.max(parts.length, 1); i++) {
      const body: Record<string, unknown> = { text: parts[i] ?? '' };
      if (i === 0 && media.length) {
        const ids: string[] = [];
        for (const m of media.slice(0, 4)) ids.push(await uploadImage(env, token, m));
        body.media = { media_ids: ids };
      }
      if (i > 0) body.reply = { in_reply_to_tweet_id: p.ids[i - 1] };
      p.ids.push(await tweet(token, body));
    }
    const first = p.ids[0];
    return { state: 'published', externalId: first, permalink: `https://x.com/${acc.username}/status/${first}` };
  } catch (e) {
    const status = (e as any).status as number | undefined;
    if (p.ids.length) return { state: 'waiting', progress: p }; // thread parcial: continua do ponto onde parou
    return { state: 'failed', error: (e as Error).message, retry: !status || status === 429 || status >= 500 };
  }
}
