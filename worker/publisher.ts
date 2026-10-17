import { type Env, type Account, type PostRow, type StepResult, now, publicUrl } from './env';
import * as ig from './instagram';
import * as x from './x';

const MAX_RETRIES = 5;      // falhas temporárias (rate limit, 5xx)
const MAX_TICKS = 90;       // etapas aguardando processamento (~90 min de vídeo)
const LOCK_MS = 3 * 60_000;

/** Executa uma etapa de publicação de um post e grava o resultado. */
export async function stepPost(env: Env, post: PostRow, base: string): Promise<PostRow['status']> {
  const t = now();
  // trava otimista: só um tick processa o post por vez
  const lock = await env.DB.prepare(
    'UPDATE posts SET locked_until=? WHERE id=? AND (locked_until IS NULL OR locked_until < ?)',
  ).bind(t + LOCK_MS, post.id, t).run();
  if (!lock.meta.changes) return post.status;

  const acc = post.account_id
    ? await env.DB.prepare('SELECT * FROM accounts WHERE id=?').bind(post.account_id).first<Account>()
    : await env.DB.prepare('SELECT * FROM accounts WHERE network=? ORDER BY created_at LIMIT 1').bind(post.network).first<Account>();

  let r: StepResult;
  if (!acc) r = { state: 'failed', error: `Nenhuma conta ${post.network === 'x' ? 'do X' : 'do Instagram'} conectada.`, retry: false };
  else if (post.network === 'x') r = await x.publishStep(env, post, acc);
  else r = await ig.publishStep(env, base, post, acc);

  const attempts = post.attempts + 1;
  if (r.state === 'published') {
    await env.DB.prepare(
      `UPDATE posts SET status='published', external_id=?, permalink=?, published_at=?, error=NULL, attempts=?, locked_until=NULL, updated_at=? WHERE id=?`,
    ).bind(r.externalId, r.permalink ?? null, now(), attempts, now(), post.id).run();
    return 'published';
  }
  if (r.state === 'waiting' && attempts < MAX_TICKS) {
    await env.DB.prepare(`UPDATE posts SET status='processing', progress=?, attempts=?, locked_until=NULL, updated_at=? WHERE id=?`)
      .bind(JSON.stringify(r.progress), attempts, now(), post.id).run();
    return 'processing';
  }
  const error = r.state === 'failed' ? r.error : 'Tempo esgotado aguardando o processamento da mídia.';
  const retry = r.state === 'failed' && r.retry && attempts < MAX_RETRIES;
  if (retry) {
    // backoff: 2, 4, 8, 16 min
    await env.DB.prepare(`UPDATE posts SET scheduled_at=?, error=?, attempts=?, locked_until=NULL, updated_at=? WHERE id=?`)
      .bind(now() + 2 ** attempts * 60_000, error, attempts, now(), post.id).run();
    return post.status;
  }
  await env.DB.prepare(`UPDATE posts SET status='error', error=?, attempts=?, locked_until=NULL, updated_at=? WHERE id=?`)
    .bind(error, attempts, now(), post.id).run();
  return 'error';
}

export async function runDue(env: Env) {
  const base = publicUrl(env);
  const { results } = await env.DB.prepare(
    `SELECT * FROM posts WHERE status IN ('scheduled','processing') AND scheduled_at <= ? ORDER BY scheduled_at LIMIT 10`,
  ).bind(now()).all<PostRow>();
  for (const p of results) {
    try { await stepPost(env, p, base); } catch (e) { console.error('publish', p.id, e); }
  }
}

export async function collectAll(env: Env) {
  const { results } = await env.DB.prepare(`SELECT * FROM accounts WHERE network='instagram'`).all<Account>();
  for (const a of results) {
    try { await ig.collectAccount(env, a); } catch (e) { console.error('collect', a.id, e); }
  }
  await env.DB.prepare('DELETE FROM oauth_state WHERE created_at < ?').bind(now() - 3600_000).run();
}
