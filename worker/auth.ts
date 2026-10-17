import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from './env';

const COOKIE = 'pulso_session';
const TTL_DAYS = 30;
const enc = new TextEncoder();

async function hmac(secret: string, data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function login(c: Context<{ Bindings: Env }>) {
  const { password } = await c.req.json<{ password?: string }>().catch(() => ({ password: '' }));
  if (!c.env.APP_PASSWORD || !c.env.SESSION_SECRET) return c.json({ error: 'APP_PASSWORD/SESSION_SECRET não configurados' }, 500);
  // compare digests so timing does not leak length or content
  const ok = safeEqual(await hmac(c.env.SESSION_SECRET, password ?? ''), await hmac(c.env.SESSION_SECRET, c.env.APP_PASSWORD));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800));
    return c.json({ error: 'Senha incorreta' }, 401);
  }
  const exp = Date.now() + TTL_DAYS * 864e5;
  setCookie(c, COOKIE, `${exp}.${await hmac(c.env.SESSION_SECRET, String(exp))}`, {
    httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: TTL_DAYS * 86400,
  });
  return c.json({ ok: true });
}

export function logout(c: Context) {
  deleteCookie(c, COOKIE, { path: '/' });
  return c.json({ ok: true });
}

export async function isAuthed(c: Context<{ Bindings: Env }>) {
  const v = getCookie(c, COOKIE);
  if (!v || !c.env.SESSION_SECRET) return false;
  const [exp, sig] = v.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(c.env.SESSION_SECRET, exp));
}

export async function requireAuth(c: Context<{ Bindings: Env }>, next: Next) {
  if (!(await isAuthed(c))) return c.json({ error: 'Não autenticado' }, 401);
  await next();
}

/** PKCE helpers (X OAuth 2.0) */
export function randomString(bytes = 32) {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}
export async function sha256b64url(s: string) {
  const d = await crypto.subtle.digest('SHA-256', enc.encode(s));
  return btoa(String.fromCharCode(...new Uint8Array(d))).replace(/[+/=]/g, (c) => ({ '+': '-', '/': '_', '=': '' })[c]!);
}
