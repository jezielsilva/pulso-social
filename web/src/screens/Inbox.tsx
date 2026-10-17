import { useState } from 'react';
import { api, type Comment } from '../api';
import { useApp } from '../ctx';
import { Icon } from '../components/Icon';
import { useLoad } from '../util';

function ago(ts: string) {
  const m = Math.round((Date.now() - Date.parse(ts)) / 60000);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}

export function Inbox() {
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const inbox = useLoad(() => api.inbox(), []);
  const list = (inbox.data?.comments ?? []).filter((c) => filter === 'all' || !c.answered);

  return (
    <section className="screen">
      <div className="top">
        <div className="hello"><small>Instagram</small><b>Comentários</b></div>
        <button className="iconbtn" onClick={inbox.reload} aria-label="Atualizar"><Icon name="refresh" /></button>
      </div>
      <div className="seg">
        <button className={filter === 'open' ? 'on' : ''} onClick={() => setFilter('open')}>Sem resposta</button>
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>Todos</button>
      </div>
      <div className="list" style={{ marginTop: 16 }}>
        {inbox.loading && !inbox.data && [0, 1, 2].map((i) => <div key={i} className="skeleton" style={{ height: 110 }} />)}
        {inbox.error && <div className="errbox">{inbox.error}</div>}
        {inbox.data && !inbox.data.connected && (
          <div className="empty">Conecte o Instagram para responder comentários.<a className="btn" href="/auth/meta/start"><Icon name="ig" />Conectar</a></div>
        )}
        {inbox.data?.connected && !list.length && <div className="empty">Tudo respondido nos últimos 15 posts. 🎉</div>}
        {list.map((c) => <CommentCard key={c.id} c={c} onDone={inbox.reload} />)}
      </div>
    </section>
  );
}

function CommentCard({ c, onDone }: { c: Comment; onDone: () => void }) {
  const { toast } = useApp();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try { await api.reply(c.id, text); toast('Resposta enviada'); setText(''); onDone(); }
    catch (err) { toast((err as Error).message, true); } finally { setBusy(false); }
  }
  return (
    <div className="comment">
      <a className="ctx" href={c.post.permalink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
        {c.post.thumb && <img src={c.post.thumb} alt="" loading="lazy" />}
        <span>{c.post.caption || 'Post sem legenda'}</span>
        <span style={{ flex: 'none' }}>{ago(c.timestamp)}</span>
      </a>
      <div className="body"><b>@{c.username}</b><p>{c.text}</p></div>
      {c.replies.map((r) => <div className="reply" key={r.id}><b>@{r.username}</b> {r.text}</div>)}
      <form className="replybox" onSubmit={send}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder={`Responder @${c.username}…`} aria-label="Resposta" />
        <button className="send" disabled={busy} aria-label="Enviar"><Icon name="send" /></button>
      </form>
    </div>
  );
}
