import { Hono } from 'hono';
import { type Env, type Account, type PostRow, type MediaRef, uid, now, publicUrl } from './env';
import { login, logout, isAuthed, requireAuth, randomString, sha256b64url } from './auth';
import * as ig from './instagram';
import * as x from './x';
import * as stats from './stats';
import { runDue, collectAll, stepPost } from './publisher';

const app = new Hono<{ Bindings: Env }>();
const MAX_UPLOAD = 95 * 1024 * 1024; // limite de corpo de requisição do Workers no plano grátis é 100 MB

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err.message || 'Erro interno' }, 500);
});

// ---------- público ----------
app.post('/api/login', login);
app.post('/api/logout', logout);
app.get('/api/me', async (c) => c.json({ authed: await isAuthed(c) }));

/** Mídia pública: o Instagram baixa as imagens/vídeos daqui. A chave é aleatória e não listável. */
app.get('/m/:key', async (c) => {
  const range = c.req.header('range');
  const obj = await c.env.MEDIA.get(c.req.param('key'), range ? { range: c.req.raw.headers } : undefined);
  if (!obj) return c.notFound();
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('accept-ranges', 'bytes');
  h.set('cache-control', 'public, max-age=31536000, immutable');
  if (range && obj.range && 'offset' in obj.range) {
    const start = obj.range.offset ?? 0;
    const len = obj.range.length ?? obj.size - start;
    h.set('content-range', `bytes ${start}-${start + len - 1}/${obj.size}`);
    return new Response(obj.body, { status: 206, headers: h });
  }
  return new Response(obj.body, { headers: h });
});

// ---------- OAuth ----------
app.get('/auth/meta/start', async (c) => {
  if (!(await isAuthed(c))) return c.redirect('/');
  const state = randomString(16);
  await c.env.DB.prepare('INSERT INTO oauth_state (state, created_at) VALUES (?, ?)').bind(state, now()).run();
  return c.redirect(ig.authUrl(c.env, publicUrl(c.env, c.req.raw), state));
});

app.get('/auth/meta/callback', async (c) => {
  const { code, state, error_description } = c.req.query();
  if (!code) return c.redirect(`/?conectar=erro&msg=${encodeURIComponent(error_description ?? 'cancelado')}`);
  const ok = await c.env.DB.prepare('DELETE FROM oauth_state WHERE state=? RETURNING state').bind(state).first();
  if (!ok) return c.redirect('/?conectar=erro&msg=estado-invalido');
  const found = await ig.exchangeCode(c.env, publicUrl(c.env, c.req.raw), code);
  if (!found.length) return c.redirect('/?conectar=erro&msg=' + encodeURIComponent('Nenhuma conta Profissional do Instagram ligada às suas Páginas.'));
  for (const a of found) {
    await c.env.DB.prepare(
      `INSERT INTO accounts (id, network, external_id, username, name, avatar, access_token, created_at) VALUES (?, 'instagram', ?, ?, ?, ?, ?, ?)
       ON CONFLICT(network, external_id) DO UPDATE SET username=excluded.username, name=excluded.name, avatar=excluded.avatar, access_token=excluded.access_token`,
    ).bind(uid(), a.external_id, a.username, a.name, a.avatar, a.access_token, now()).run();
  }
  c.executionCtx.waitUntil(collectAll(c.env));
  return c.redirect('/?conectar=instagram');
});

app.get('/auth/x/start', async (c) => {
  if (!(await isAuthed(c))) return c.redirect('/');
  const state = randomString(16);
  const verifier = randomString(48);
  await c.env.DB.prepare('INSERT INTO oauth_state (state, verifier, created_at) VALUES (?, ?, ?)').bind(state, verifier, now()).run();
  return c.redirect(x.authUrl(c.env, publicUrl(c.env, c.req.raw), state, await sha256b64url(verifier)));
});

app.get('/auth/x/callback', async (c) => {
  const { code, state, error } = c.req.query();
  if (!code) return c.redirect(`/?conectar=erro&msg=${encodeURIComponent(error ?? 'cancelado')}`);
  const row = await c.env.DB.prepare('DELETE FROM oauth_state WHERE state=? RETURNING verifier').bind(state).first<{ verifier: string }>();
  if (!row?.verifier) return c.redirect('/?conectar=erro&msg=estado-invalido');
  const a = await x.exchangeCode(c.env, publicUrl(c.env, c.req.raw), code, row.verifier);
  await c.env.DB.prepare(
    `INSERT INTO accounts (id, network, external_id, username, name, avatar, access_token, refresh_token, token_expires_at, created_at)
     VALUES (?, 'x', ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(network, external_id) DO UPDATE SET username=excluded.username, name=excluded.name, avatar=excluded.avatar,
       access_token=excluded.access_token, refresh_token=excluded.refresh_token, token_expires_at=excluded.token_expires_at`,
  ).bind(uid(), a.external_id, a.username, a.name, a.avatar, a.access_token, a.refresh_token, a.token_expires_at, now()).run();
  return c.redirect('/?conectar=x');
});

// ---------- API autenticada ----------
const api = new Hono<{ Bindings: Env }>();
api.use('*', requireAuth);

api.get('/accounts', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, network, username, name, avatar, created_at FROM accounts ORDER BY network').all();
  return c.json(results);
});
api.delete('/accounts/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM accounts WHERE id=?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// Posts
const serialize = (p: PostRow) => ({ ...p, media: JSON.parse(p.media), thread: JSON.parse(p.thread), progress: undefined, locked_until: undefined });

api.get('/posts', async (c) => {
  const from = Number(c.req.query('from') ?? 0);
  const to = Number(c.req.query('to') ?? 8.64e15);
  const { results } = await c.env.DB.prepare(
    `SELECT * FROM posts WHERE (scheduled_at BETWEEN ? AND ?) OR (status='draft' AND scheduled_at IS NULL) ORDER BY COALESCE(scheduled_at, created_at)`,
  ).bind(from, to).all<PostRow>();
  return c.json(results.map(serialize));
});

interface PostInput {
  network: 'instagram' | 'x'; type: PostRow['type']; caption?: string; media?: MediaRef[]; thread?: string[];
  scheduled_at?: number | null; status?: 'draft' | 'scheduled'; account_id?: string | null;
}

function validate(b: PostInput) {
  if (!['instagram', 'x'].includes(b.network)) return 'Rede inválida';
  if (b.network === 'x' && b.type !== 'x') return 'Tipo inválido para o X';
  if (b.network === 'instagram' && !['feed', 'carousel', 'reel', 'story'].includes(b.type)) return 'Tipo inválido para o Instagram';
  if (b.status === 'scheduled' && !b.scheduled_at) return 'Escolha data e hora';
  if ((b.caption ?? '').length > 2200) return 'Legenda passa de 2.200 caracteres';
  return null;
}

api.post('/posts', async (c) => {
  const b = await c.req.json<PostInput>();
  const err = validate(b);
  if (err) return c.json({ error: err }, 400);
  const id = uid();
  const t = now();
  await c.env.DB.prepare(
    `INSERT INTO posts (id, account_id, network, type, caption, media, thread, scheduled_at, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
  ).bind(id, b.account_id ?? null, b.network, b.type, b.caption ?? '', JSON.stringify(b.media ?? []), JSON.stringify(b.thread ?? []),
    b.scheduled_at ?? null, b.status ?? 'draft', t, t).run();
  return c.json(serialize((await c.env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first<PostRow>())!));
});

api.patch('/posts/:id', async (c) => {
  const id = c.req.param('id');
  const cur = await c.env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first<PostRow>();
  if (!cur) return c.json({ error: 'Post não encontrado' }, 404);
  if (cur.status === 'published' || cur.status === 'processing') return c.json({ error: 'Post já publicado ou em publicação' }, 409);
  const b = { ...serialize(cur), ...(await c.req.json<Partial<PostInput>>()) } as PostInput;
  const err = validate(b);
  if (err) return c.json({ error: err }, 400);
  await c.env.DB.prepare(
    `UPDATE posts SET account_id=?, network=?, type=?, caption=?, media=?, thread=?, scheduled_at=?, status=?, error=NULL, attempts=0, progress='{}', updated_at=? WHERE id=?`,
  ).bind(b.account_id ?? null, b.network, b.type, b.caption ?? '', JSON.stringify(b.media ?? []), JSON.stringify(b.thread ?? []),
    b.scheduled_at ?? null, b.status ?? 'draft', now(), id).run();
  return c.json(serialize((await c.env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first<PostRow>())!));
});

api.delete('/posts/:id', async (c) => {
  await c.env.DB.prepare(`DELETE FROM posts WHERE id=? AND status != 'processing'`).bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

/** Publica agora: roda a primeira etapa já na requisição; vídeos continuam no cron. */
api.post('/posts/:id/publish', async (c) => {
  const id = c.req.param('id');
  await c.env.DB.prepare(`UPDATE posts SET status='scheduled', scheduled_at=?, error=NULL, attempts=0 WHERE id=? AND status IN ('draft','scheduled','error')`)
    .bind(now(), id).run();
  const post = await c.env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first<PostRow>();
  if (!post) return c.json({ error: 'Post não encontrado' }, 404);
  await stepPost(c.env, post, publicUrl(c.env, c.req.raw));
  return c.json(serialize((await c.env.DB.prepare('SELECT * FROM posts WHERE id=?').bind(id).first<PostRow>())!));
});

// Mídia
api.post('/media', async (c) => {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) return c.json({ error: 'Envie um arquivo' }, 400);
  if (!/^(image\/(jpeg|png|gif|webp)|video\/(mp4|quicktime))$/.test(file.type)) return c.json({ error: 'Formato não suportado (use JPG, PNG, MP4 ou MOV)' }, 400);
  if (file.size > MAX_UPLOAD) return c.json({ error: 'Arquivo maior que 95 MB' }, 400);
  const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const key = `${randomString(18)}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  await c.env.DB.prepare('INSERT INTO media (key, name, mime, size, created_at) VALUES (?,?,?,?,?)').bind(key, file.name, file.type, file.size, now()).run();
  return c.json({ key, mime: file.type, name: file.name, size: file.size });
});
api.get('/media', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM media ORDER BY created_at DESC LIMIT 200').all();
  return c.json(results);
});
api.delete('/media/:key', async (c) => {
  const key = c.req.param('key');
  await c.env.MEDIA.delete(key);
  await c.env.DB.prepare('DELETE FROM media WHERE key=?').bind(key).run();
  return c.json({ ok: true });
});

// Textos salvos / hashtags
api.get('/snippets', async (c) => c.json((await c.env.DB.prepare('SELECT * FROM snippets ORDER BY created_at DESC').all()).results));
api.post('/snippets', async (c) => {
  const { title, body } = await c.req.json<{ title: string; body: string }>();
  if (!title?.trim() || !body?.trim()) return c.json({ error: 'Preencha título e texto' }, 400);
  const id = uid();
  await c.env.DB.prepare('INSERT INTO snippets (id, title, body, created_at) VALUES (?,?,?,?)').bind(id, title.trim(), body.trim(), now()).run();
  return c.json({ id, title, body });
});
api.delete('/snippets/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM snippets WHERE id=?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

// Estatísticas
const days = (c: any) => Math.min(Math.max(Number(c.req.query('days') ?? 30), 1), 3650);
api.get('/stats/overview', async (c) => c.json(await stats.overview(c.env, days(c))));
api.get('/stats/timeline', async (c) => c.json(await stats.timeline(c.env, days(c))));
api.get('/stats/posts', async (c) => c.json(await stats.topPosts(c.env, days(c), c.req.query('sort') ?? 'interactions')));
api.get('/stats/formats', async (c) => c.json(await stats.formats(c.env, days(c))));
api.get('/stats/best-times', async (c) => c.json(await stats.bestTimes(c.env, days(c))));
api.post('/stats/refresh', async (c) => { await collectAll(c.env); return c.json({ ok: true }); });

// Inbox (comentários do Instagram)
async function igAcc(env: Env) {
  return env.DB.prepare(`SELECT * FROM accounts WHERE network='instagram' ORDER BY created_at LIMIT 1`).first<Account>();
}
api.get('/inbox', async (c) => {
  const acc = await igAcc(c.env);
  if (!acc) return c.json({ connected: false, comments: [] });
  return c.json({ connected: true, comments: await ig.listComments(c.env, acc) });
});
api.post('/inbox/:commentId/reply', async (c) => {
  const acc = await igAcc(c.env);
  if (!acc) return c.json({ error: 'Instagram não conectado' }, 400);
  const { message } = await c.req.json<{ message: string }>();
  if (!message?.trim()) return c.json({ error: 'Escreva a resposta' }, 400);
  return c.json(await ig.replyComment(c.env, acc, c.req.param('commentId'), message.trim()));
});

app.route('/api', api);

export default {
  fetch: app.fetch,
  async scheduled(event: ScheduledController, env: Env, ctx: ExecutionContext) {
    if (event.cron === '0 9 * * *') ctx.waitUntil(collectAll(env));
    else ctx.waitUntil(runDue(env));
  },
} satisfies ExportedHandler<Env>;
