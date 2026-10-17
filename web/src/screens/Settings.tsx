import { useState } from 'react';
import { api } from '../api';
import { useApp } from '../ctx';
import { Icon } from '../components/Icon';
import { useLoad } from '../util';

export function Settings({ open, onClose, onAccounts }: { open: boolean; onClose: () => void; onAccounts: () => void }) {
  const { accounts, toast, toggleTheme } = useApp();
  const snips = useLoad(() => (open ? api.snippets() : Promise.resolve([])), [open]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  async function addSnip(e: React.FormEvent) {
    e.preventDefault();
    try { await api.addSnippet(title, body); setTitle(''); setBody(''); snips.reload(); toast('Texto salvo'); }
    catch (err) { toast((err as Error).message, true); }
  }
  async function disconnect(id: string) {
    await api.removeAccount(id); onAccounts(); toast('Conta desconectada');
  }
  async function logout() {
    await api.logout(); location.reload();
  }

  const ig = accounts.find((a) => a.network === 'instagram');
  const x = accounts.find((a) => a.network === 'x');

  return (
    <>
      <div className={`scrim ${open ? 'on' : ''}`} onClick={onClose} />
      <div className={`sheet settings ${open ? 'on' : ''}`} role="dialog" aria-label="Ajustes" aria-hidden={!open}>
        <div className="grab" />
        <h2>Ajustes</h2>

        <div className="sec" style={{ marginTop: 6 }}><h2>Contas</h2></div>
        <div className="list">
          {[{ net: 'instagram', acc: ig, label: 'Instagram', icon: 'ig', href: '/auth/meta/start' },
            { net: 'x', acc: x, label: 'X', icon: 'x', href: '/auth/x/start' }].map((r) => (
            <div className="row" key={r.net}>
              <div className="avatar" style={{ width: 38, height: 38 }}>{r.acc?.avatar ? <img src={r.acc.avatar} alt="" /> : <Icon name={r.icon} />}</div>
              <div className="t"><b>{r.label}</b><small>{r.acc ? '@' + r.acc.username : 'não conectado'}</small></div>
              {r.acc
                ? <><a className="btn ghost" href={r.href} style={{ padding: '8px 12px' }}>Reconectar</a><button className="btn danger" style={{ padding: '8px 12px' }} onClick={() => disconnect(r.acc!.id)}>Sair</button></>
                : <a className="btn" href={r.href} style={{ padding: '8px 14px' }}>Conectar</a>}
            </div>
          ))}
        </div>

        <div className="sec"><h2>Textos salvos</h2><span className="muted" style={{ fontSize: 12 }}>hashtags, assinaturas, CTAs</span></div>
        <div className="list">
          {snips.data?.map((s) => (
            <div className="row" key={s.id}>
              <div className="t"><b>{s.title}</b><small>{s.body.slice(0, 80)}</small></div>
              <button className="iconbtn" aria-label="Apagar" onClick={async () => { await api.removeSnippet(s.id); snips.reload(); }}><Icon name="trash" /></button>
            </div>
          ))}
        </div>
        <form className="form2" onSubmit={addSnip}>
          <input id="snip-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ex.: Hashtags de setup)" />
          <textarea id="snip-body" value={body} onChange={(e) => setBody(e.target.value)} rows={3} placeholder="#setup #homestudio #criadordeconteudo" />
          <button className="btn ghost" type="submit"><Icon name="plus" />Salvar texto</button>
        </form>

        <div className="cta" style={{ marginTop: 24 }}>
          <button className="ghost" onClick={toggleTheme}>Tema claro/escuro</button>
          <button className="ghost" onClick={logout}>Sair do Pulso</button>
        </div>
      </div>
    </>
  );
}
