// Instagram Graph API (conta Profissional ligada a uma Página do Facebook).
import { type Env, type Account, type PostRow, type MediaRef, type StepResult, mediaUrl } from './env';

export const IG_SCOPES = [
  'instagram_basic',
  'instagram_content_publish',
  'instagram_manage_insights',
  'instagram_manage_comments',
  'pages_show_list',
  'pages_read_engagement',
  'business_management',
].join(',');

const graph = (env: Env) => `https://graph.facebook.com/${env.GRAPH_VERSION}`;

export class GraphError extends Error {
  constructor(message: string, public code?: number, public transient = false) { super(message); }
}

async function call<T = any>(env: Env, path: string, params: Record<string, string>, method: 'GET' | 'POST' = 'GET'): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : graph(env) + path);
  let body: URLSearchParams | undefined;
  if (method === 'GET') Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  else body = new URLSearchParams(params);
  const res = await fetch(url, { method, body });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.error) {
    const e = json.error ?? {};
    // códigos 1, 2, 4, 17, 32, 613 e 5xx são temporários (rate limit / instabilidade)
    const transient = res.status >= 500 || [1, 2, 4, 17, 32, 613].includes(e.code) || e.is_transient === true;
    throw new GraphError(e.error_user_msg || e.message || `HTTP ${res.status}`, e.code, transient);
  }
  return json as T;
}

export function authUrl(env: Env, base: string, state: string) {
  const u = new URL(`https://www.facebook.com/${env.GRAPH_VERSION}/dialog/oauth`);
  u.searchParams.set('client_id', env.META_APP_ID);
  u.searchParams.set('redirect_uri', `${base}/auth/meta/callback`);
  u.searchParams.set('state', state);
  u.searchParams.set('scope', IG_SCOPES);
  u.searchParams.set('response_type', 'code');
  return u.toString();
}

/** Troca o code por token de Página (não expira) e devolve as contas IG encontradas. */
export async function exchangeCode(env: Env, base: string, code: string) {
  const short = await call<{ access_token: string }>(env, '/oauth/access_token', {
    client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, redirect_uri: `${base}/auth/meta/callback`, code,
  });
  const long = await call<{ access_token: string }>(env, '/oauth/access_token', {
    grant_type: 'fb_exchange_token', client_id: env.META_APP_ID, client_secret: env.META_APP_SECRET, fb_exchange_token: short.access_token,
  });
  const pages = await call<{ data: any[] }>(env, '/me/accounts', {
    access_token: long.access_token,
    fields: 'id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}',
    limit: '100',
  });
  return pages.data
    .filter((p) => p.instagram_business_account)
    .map((p) => ({
      external_id: p.instagram_business_account.id as string,
      username: p.instagram_business_account.username as string,
      name: (p.instagram_business_account.name ?? p.name) as string,
      avatar: (p.instagram_business_account.profile_picture_url ?? null) as string | null,
      access_token: p.access_token as string,
    }));
}

// ---------- Publicação em etapas (retomável a cada tick do cron) ----------

interface Progress {
  children?: string[];
  container?: string;
}

const isVideo = (m: MediaRef) => m.mime.startsWith('video/');

async function containerStatus(env: Env, id: string, token: string) {
  const r = await call<{ status_code: string; status?: string }>(env, `/${id}`, { fields: 'status_code,status', access_token: token });
  return r;
}

export async function publishStep(env: Env, base: string, post: PostRow, acc: Account): Promise<StepResult> {
  const media: MediaRef[] = JSON.parse(post.media);
  const p: Progress = JSON.parse(post.progress || '{}');
  const token = acc.access_token;
  const ig = acc.external_id;
  const url = (m: MediaRef) => mediaUrl(base, m.key);

  if (!media.length) return { state: 'failed', error: 'O Instagram exige pelo menos uma foto ou vídeo.', retry: false };

  try {
    // 1) criar containers
    if (!p.container) {
      if (post.type === 'carousel') {
        if (media.length < 2) return { state: 'failed', error: 'Carrossel precisa de 2 a 10 itens.', retry: false };
        if (!p.children) {
          p.children = [];
          for (const m of media.slice(0, 10)) {
            const params: Record<string, string> = { is_carousel_item: 'true', access_token: token };
            if (isVideo(m)) { params.media_type = 'VIDEO'; params.video_url = url(m); } else params.image_url = url(m);
            const r = await call<{ id: string }>(env, `/${ig}/media`, params, 'POST');
            p.children.push(r.id);
          }
        }
        for (const child of p.children) {
          const s = await containerStatus(env, child, token);
          if (s.status_code === 'ERROR') return { state: 'failed', error: `Item do carrossel recusado: ${s.status ?? ''}`, retry: false };
          if (s.status_code !== 'FINISHED') return { state: 'waiting', progress: p };
        }
        const r = await call<{ id: string }>(env, `/${ig}/media`, {
          media_type: 'CAROUSEL', children: p.children.join(','), caption: post.caption, access_token: token,
        }, 'POST');
        p.container = r.id;
      } else {
        const m = media[0];
        const params: Record<string, string> = { access_token: token };
        if (post.type === 'story') {
          params.media_type = 'STORIES';
          if (isVideo(m)) params.video_url = url(m); else params.image_url = url(m);
        } else if (post.type === 'reel' || isVideo(m)) {
          // todo vídeo no feed hoje é publicado como Reel
          params.media_type = 'REELS';
          params.video_url = url(m);
          params.caption = post.caption;
          params.share_to_feed = 'true';
        } else {
          params.image_url = url(m);
          params.caption = post.caption;
        }
        const r = await call<{ id: string }>(env, `/${ig}/media`, params, 'POST');
        p.container = r.id;
      }
    }

    // 2) esperar o processamento
    const s = await containerStatus(env, p.container, token);
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED')
      return { state: 'failed', error: `O Instagram recusou a mídia: ${s.status ?? s.status_code}`, retry: false };
    if (s.status_code !== 'FINISHED') return { state: 'waiting', progress: p };

    // 3) publicar
    const pub = await call<{ id: string }>(env, `/${ig}/media_publish`, { creation_id: p.container, access_token: token }, 'POST');
    let permalink: string | undefined;
    try {
      permalink = (await call<{ permalink: string }>(env, `/${pub.id}`, { fields: 'permalink', access_token: token })).permalink;
    } catch { /* stories não têm permalink */ }
    return { state: 'published', externalId: pub.id, permalink };
  } catch (e) {
    const err = e as GraphError;
    return { state: 'failed', error: err.message, retry: err.transient ?? true };
  }
}

// ---------- Métricas (mesmo conjunto do Metricool) ----------

function ymd(d: Date, tz: string) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function collectAccount(env: Env, acc: Account) {
  const token = acc.access_token;
  const ig = acc.external_id;
  const profile = await call<any>(env, `/${ig}`, { fields: 'followers_count,media_count,username,name,profile_picture_url', access_token: token });

  await env.DB.prepare('UPDATE accounts SET username=?, name=?, avatar=? WHERE id=?')
    .bind(profile.username ?? acc.username, profile.name ?? acc.name, profile.profile_picture_url ?? acc.avatar, acc.id).run();

  // métricas do dia anterior (dia completo)
  const until = Math.floor(Date.now() / 1000);
  const since = until - 86400;
  const date = ymd(new Date(since * 1000), env.TIMEZONE);
  const row: Record<string, number | null> = {
    followers: profile.followers_count ?? null, follows: null, unfollows: null, reach: null, views: null,
    interactions: null, likes: null, comments: null, shares: null, saves: null, profile_views: null,
  };
  const map: Record<string, string> = {
    reach: 'reach', views: 'views', total_interactions: 'interactions', likes: 'likes',
    comments: 'comments', shares: 'shares', saves: 'saves', profile_views: 'profile_views',
  };
  try {
    const r = await call<{ data: any[] }>(env, `/${ig}/insights`, {
      metric: Object.keys(map).join(','), period: 'day', metric_type: 'total_value',
      since: String(since), until: String(until), access_token: token,
    });
    for (const m of r.data) row[map[m.name]] = m.total_value?.value ?? null;
  } catch (e) { console.warn('insights conta', (e as Error).message); }
  try {
    const r = await call<{ data: any[] }>(env, `/${ig}/insights`, {
      metric: 'follows_and_unfollows', period: 'day', metric_type: 'total_value', breakdown: 'follow_type',
      since: String(since), until: String(until), access_token: token,
    });
    for (const res of r.data[0]?.total_value?.breakdowns?.[0]?.results ?? []) {
      if (res.dimension_values?.[0] === 'FOLLOWER') row.follows = res.value;
      if (res.dimension_values?.[0] === 'NON_FOLLOWER') row.unfollows = res.value;
    }
  } catch (e) { console.warn('follows_and_unfollows', (e as Error).message); }

  const cols = Object.keys(row);
  await env.DB.prepare(
    `INSERT OR REPLACE INTO account_daily (account_id, date, ${cols.join(',')}) VALUES (?, ?, ${cols.map(() => '?').join(',')})`,
  ).bind(acc.id, date, ...cols.map((k) => row[k])).run();

  // posts recentes + insights por post
  const media = await call<{ data: any[] }>(env, `/${ig}/media`, {
    fields: 'id,caption,media_type,media_product_type,permalink,thumbnail_url,media_url,timestamp,like_count,comments_count',
    limit: '50', access_token: token,
  });
  const stmts: D1PreparedStatement[] = [];
  for (const m of media.data) {
    const v: Record<string, number> = { views: 0, reach: 0, likes: m.like_count ?? 0, comments: m.comments_count ?? 0, shares: 0, saved: 0, interactions: 0 };
    try {
      const ins = await call<{ data: any[] }>(env, `/${m.id}/insights`, { metric: 'views,reach,saved,shares,total_interactions', access_token: token });
      for (const x of ins.data) {
        const val = x.values?.[0]?.value ?? x.total_value?.value ?? 0;
        if (x.name === 'total_interactions') v.interactions = val; else v[x.name] = val;
      }
    } catch { /* álbuns antigos/stories podem não ter todas as métricas */ }
    stmts.push(env.DB.prepare(
      `INSERT OR REPLACE INTO post_metrics (external_id, account_id, media_type, product_type, caption, permalink, thumb, posted_at, views, reach, likes, comments, shares, saved, interactions, fetched_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    ).bind(m.id, acc.id, m.media_type, m.media_product_type ?? null, (m.caption ?? '').slice(0, 500), m.permalink ?? null,
      m.thumbnail_url ?? m.media_url ?? null, Date.parse(m.timestamp), v.views, v.reach, v.likes, v.comments, v.shares, v.saved,
      v.interactions || v.likes + v.comments + v.shares + v.saved, Date.now()));
  }
  if (stmts.length) await env.DB.batch(stmts);
}

// ---------- Inbox (comentários) ----------

export async function listComments(env: Env, acc: Account) {
  const media = await call<{ data: any[] }>(env, `/${acc.external_id}/media`, {
    fields: 'id,caption,permalink,thumbnail_url,media_url,comments_count,timestamp', limit: '15', access_token: acc.access_token,
  });
  const out: any[] = [];
  for (const m of media.data.filter((x) => x.comments_count > 0)) {
    const c = await call<{ data: any[] }>(env, `/${m.id}/comments`, {
      fields: 'id,text,username,timestamp,like_count,replies{id,text,username,timestamp}', limit: '50', access_token: acc.access_token,
    });
    for (const k of c.data) {
      out.push({
        id: k.id, text: k.text, username: k.username, timestamp: k.timestamp, likes: k.like_count ?? 0,
        replies: k.replies?.data ?? [], answered: (k.replies?.data ?? []).some((r: any) => r.username === acc.username),
        post: { id: m.id, caption: (m.caption ?? '').slice(0, 80), permalink: m.permalink, thumb: m.thumbnail_url ?? m.media_url },
      });
    }
  }
  return out.sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
}

export async function replyComment(env: Env, acc: Account, commentId: string, message: string) {
  return call<{ id: string }>(env, `/${commentId}/replies`, { message, access_token: acc.access_token }, 'POST');
}
