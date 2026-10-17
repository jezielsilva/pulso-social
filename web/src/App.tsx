import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type Account, type BestTimes } from './api';
import { Ctx, type ComposerSeed, type Tab } from './ctx';
import { Icon } from './components/Icon';
import { Composer } from './components/Composer';
import { Home } from './screens/Home';
import { Agenda } from './screens/Agenda';
import { Analytics } from './screens/Analytics';
import { Inbox } from './screens/Inbox';
import { Settings } from './screens/Settings';

function Login({ onOk }: { onOk: () => void }) {
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="login">
      <form onSubmit={async (e) => {
        e.preventDefault(); setBusy(true); setErr(null);
        try { await api.login(pw); onOk(); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
      }}>
        <div className="logo"><Icon name="chart" /></div>
        <h1>Pulso Social</h1>
        <span className="muted">Seu painel de Instagram e X.</span>
        <input id="password" type="password" autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Senha" autoFocus />
        {err && <div className="errbox">{err}</div>}
        <button className="btn" disabled={busy || !pw}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}

function getTheme() { try { return localStorage.getItem('pulso-theme') ?? 'dark'; } catch { return 'dark'; } }

export function App() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('home');
  const [composer, setComposer] = useState<{ open: boolean; seed: ComposerSeed }>({ open: false, seed: {} });
  const [settings, setSettings] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [best, setBest] = useState<BestTimes | null>(null);
  const [version, setVersion] = useState(0);
  const [toastMsg, setToastMsg] = useState<{ m: string; err?: boolean; on: boolean }>({ m: '', on: false });
  const tt = useRef<number>();

  const toast = useCallback((m: string, err?: boolean) => {
    setToastMsg({ m, err, on: true });
    clearTimeout(tt.current);
    tt.current = window.setTimeout(() => setToastMsg((t) => ({ ...t, on: false })), 2600);
  }, []);

  const loadAccounts = useCallback(() => { api.accounts().then(setAccounts).catch(() => {}); }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = getTheme();
    api.me().then((r) => setAuthed(r.authed)).catch(() => setAuthed(false));
    const onLogout = () => setAuthed(false);
    window.addEventListener('pulso:logout', onLogout);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => window.removeEventListener('pulso:logout', onLogout);
  }, []);

  useEffect(() => {
    if (!authed) return;
    loadAccounts();
    api.bestTimes().then(setBest).catch(() => {});
    // retorno do OAuth: ?conectar=instagram|x|erro
    const q = new URLSearchParams(location.search);
    const c = q.get('conectar');
    if (c) {
      toast(c === 'erro' ? `Não conectou: ${q.get('msg') ?? ''}` : `${c === 'x' ? 'X' : 'Instagram'} conectado!`, c === 'erro');
      history.replaceState(null, '', '/');
    }
  }, [authed, loadAccounts, toast]);

  // recarrega dados quando o app volta ao primeiro plano
  useEffect(() => {
    const f = () => document.visibilityState === 'visible' && setVersion((v) => v + 1);
    document.addEventListener('visibilitychange', f);
    return () => document.removeEventListener('visibilitychange', f);
  }, []);

  const toggleTheme = () => {
    const next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('pulso-theme', next); } catch { /* sem storage */ }
  };

  if (authed === null) return null;
  if (!authed) return <><div className="orbs" aria-hidden="true"><span /><span /></div><Login onOk={() => setAuthed(true)} /></>;

  const ctx = {
    go: (t: Tab) => { setTab(t); window.scrollTo({ top: 0 }); },
    compose: (seed: ComposerSeed = {}) => setComposer({ open: true, seed }),
    openSettings: () => setSettings(true),
    toast, accounts, best, version, bump: () => setVersion((v) => v + 1), toggleTheme,
  };

  const navItem = (t: Tab, icon: string, label: string) => (
    <button className={tab === t ? 'on' : ''} onClick={() => ctx.go(t)}><Icon name={icon} />{label}</button>
  );

  return (
    <Ctx.Provider value={ctx}>
      <div className="orbs" aria-hidden="true"><span /><span /></div>
      <main className="app">
        <div className="scroll">
          {tab === 'home' && <Home />}
          {tab === 'cal' && <Agenda />}
          {tab === 'stats' && <Analytics />}
          {tab === 'inbox' && <Inbox />}
        </div>
      </main>
      <nav className="nav" aria-label="Navegação">
        {navItem('home', 'home', 'Início')}
        {navItem('cal', 'cal', 'Agenda')}
        <button className="fab" onClick={() => ctx.compose()} aria-label="Criar post"><Icon name="plus" /></button>
        {navItem('stats', 'chart', 'Analytics')}
        {navItem('inbox', 'inbox', 'Comentários')}
      </nav>
      <Composer open={composer.open} seed={composer.seed} onClose={() => setComposer((c) => ({ ...c, open: false }))} />
      <Settings open={settings} onClose={() => setSettings(false)} onAccounts={loadAccounts} />
      <div className={`toast ${toastMsg.on ? 'on' : ''} ${toastMsg.err ? 'err' : ''}`} role="status">{toastMsg.m}</div>
    </Ctx.Provider>
  );
}
