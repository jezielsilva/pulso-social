import type { Env } from './env';

const DAY = 864e5;

function parts(ts: number, tz: string) {
  const f = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hour12: false }).formatToParts(new Date(ts));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(f.find((p) => p.type === 'weekday')!.value);
  const hour = Number(f.find((p) => p.type === 'hour')!.value) % 24;
  return { wd, hour };
}

async function igAccount(env: Env) {
  return env.DB.prepare(`SELECT id, username, avatar FROM accounts WHERE network='instagram' ORDER BY created_at LIMIT 1`)
    .first<{ id: string; username: string; avatar: string }>();
}

/** Cards da tela inicial e do topo do Analytics, comparando com o período anterior. */
export async function overview(env: Env, days: number) {
  const acc = await igAccount(env);
  if (!acc) return { connected: false };
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const prev = new Date(Date.now() - 2 * days * DAY).toISOString().slice(0, 10);
  const sum = `SELECT COALESCE(SUM(reach),0) reach, COALESCE(SUM(views),0) views, COALESCE(SUM(interactions),0) interactions,
    COALESCE(SUM(likes),0) likes, COALESCE(SUM(comments),0) comments, COALESCE(SUM(shares),0) shares, COALESCE(SUM(saves),0) saves,
    COALESCE(SUM(follows),0) follows, COALESCE(SUM(unfollows),0) unfollows, COALESCE(SUM(profile_views),0) profile_views
    FROM account_daily WHERE account_id=? AND date >= ? AND date < ?`;
  const cur = await env.DB.prepare(sum).bind(acc.id, since, '9999').first<Record<string, number>>();
  const before = await env.DB.prepare(sum).bind(acc.id, prev, since).first<Record<string, number>>();
  const last = await env.DB.prepare('SELECT followers FROM account_daily WHERE account_id=? AND followers IS NOT NULL ORDER BY date DESC LIMIT 1')
    .bind(acc.id).first<{ followers: number }>();
  const first = await env.DB.prepare('SELECT followers FROM account_daily WHERE account_id=? AND date >= ? AND followers IS NOT NULL ORDER BY date LIMIT 1')
    .bind(acc.id, since).first<{ followers: number }>();
  const posts = await env.DB.prepare('SELECT COUNT(*) n FROM post_metrics WHERE account_id=? AND posted_at >= ?')
    .bind(acc.id, Date.now() - days * DAY).first<{ n: number }>();
  const followers = last?.followers ?? 0;
  return {
    connected: true, account: acc, days, followers,
    followersDelta: first ? followers - first.followers : 0,
    engagementRate: followers && cur!.reach ? cur!.interactions / cur!.reach : 0,
    posts: posts?.n ?? 0, current: cur, previous: before,
  };
}

export async function timeline(env: Env, days: number) {
  const acc = await igAccount(env);
  if (!acc) return [];
  const since = new Date(Date.now() - days * DAY).toISOString().slice(0, 10);
  const { results } = await env.DB.prepare(
    'SELECT date, followers, follows, unfollows, reach, views, interactions FROM account_daily WHERE account_id=? AND date >= ? ORDER BY date',
  ).bind(acc.id, since).all();
  return results;
}

export async function topPosts(env: Env, days: number, sort: string) {
  const col = ['interactions', 'reach', 'views', 'saved', 'shares', 'likes', 'comments'].includes(sort) ? sort : 'interactions';
  const { results } = await env.DB.prepare(
    `SELECT * FROM post_metrics WHERE posted_at >= ? ORDER BY ${col} DESC LIMIT 20`,
  ).bind(Date.now() - days * DAY).all();
  return results;
}

/** Interações médias por formato (Reels, Carrossel, Feed). */
export async function formats(env: Env, days: number) {
  const { results } = await env.DB.prepare(
    `SELECT CASE WHEN product_type='REELS' THEN 'Reels' WHEN media_type='CAROUSEL_ALBUM' THEN 'Carrossel' ELSE 'Feed' END fmt,
       COUNT(*) n, SUM(interactions) interactions, AVG(interactions) avg_interactions, AVG(reach) avg_reach
     FROM post_metrics WHERE posted_at >= ? GROUP BY fmt ORDER BY interactions DESC`,
  ).bind(Date.now() - days * DAY).all();
  return results;
}

/** Mapa de calor 7×24 com média de interações por post em cada dia/hora (fuso do usuário). */
export async function bestTimes(env: Env, days = 90) {
  const { results } = await env.DB.prepare('SELECT posted_at, interactions, reach FROM post_metrics WHERE posted_at >= ?')
    .bind(Date.now() - days * DAY).all<{ posted_at: number; interactions: number; reach: number }>();
  const sum = Array.from({ length: 7 }, () => Array(24).fill(0));
  const cnt = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const r of results) {
    const { wd, hour } = parts(r.posted_at, env.TIMEZONE);
    sum[wd][hour] += r.interactions; cnt[wd][hour] += 1;
  }
  const avg = sum.map((row, d) => row.map((v, h) => (cnt[d][h] ? v / cnt[d][h] : 0)));
  const overall = results.length ? results.reduce((a, r) => a + r.interactions, 0) / results.length : 0;
  let best = { wd: 4, hour: 19, score: 0 };
  avg.forEach((row, d) => row.forEach((v, h) => { if (cnt[d][h] >= 1 && v > best.score) best = { wd: d, hour: h, score: v }; }));
  return { grid: avg, counts: cnt, samples: results.length, best, lift: overall ? best.score / overall : 0 };
}
