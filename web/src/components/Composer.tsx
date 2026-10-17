import { useEffect, useRef, useState } from 'react';
import { api, mediaSrc, type MediaRef, type Post, type PostType, type Snippet } from '../api';
import { useApp, type ComposerSeed } from '../ctx';
import { Icon } from './Icon';
import { WEEKDAYS, nextSlot, toDateInput, toTimeInput } from '../util';

const TYPES: { t: PostType; label: string; icon: string }[] = [
  { t: 'feed', label: 'Feed', icon: 'img' },
  { t: 'carousel', label: 'Carrossel', icon: 'car' },
  { t: 'reel', label: 'Reel', icon: 'reel' },
  { t: 'story', label: 'Story', icon: 'story' },
  { t: 'x', label: 'X', icon: 'x' },
];

interface Upload { id: string; file?: File; preview: string; ref?: MediaRef; progress: number; error?: string }

export function Composer({ open, seed, onClose }: { open: boolean; seed: ComposerSeed; onClose: () => void }) {
  const { toast, bump, best, accounts } = useApp();
  const [type, setType] = useState<PostType>('feed');
  const [caption, setCaption] = useState('');
  const [thread, setThread] = useState<string[]>([]);
  const [items, setItems] = useState<Upload[]>([]);
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [snips, setSnips] = useState<Snippet[] | null>(null);
  const [over, setOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const editing = seed.post;

  // reinicia o formulário a cada abertura
  useEffect(() => {
    if (!open) return;
    const p = seed.post;
    const at = p?.scheduled_at ? new Date(p.scheduled_at) : seed.at ?? new Date(Date.now() + 3600_000);
    setType(p?.type ?? seed.type ?? 'feed');
    setCaption(p?.caption ?? '');
    setThread(p?.thread ?? []);
    setItems((p?.media ?? []).map((m) => ({ id: m.key, preview: mediaSrc(m.key), ref: m, progress: 1 })));
    setDate(toDateInput(at));
    setTime(toTimeInput(at));
    setErr(p?.status === 'error' ? p.error : null);
    setSnips(null);
  }, [open, seed]);

  const isX = type === 'x';
  const limit = isX ? 280 : 2200;
  const maxItems = isX ? 4 : type === 'carousel' ? 10 : 1;
  const network = isX ? 'x' : 'instagram';
  const connected = accounts.some((a) => a.network === network);

  function addFiles(files: FileList | File[]) {
    const list = [...files].slice(0, Math.max(0, maxItems - items.length));
    for (const file of list) {
      const id = crypto.randomUUID();
      setItems((s) => [...s, { id, file, preview: URL.createObjectURL(file), progress: 0 }]);
      api.upload(file, (p) => setItems((s) => s.map((u) => (u.id === id ? { ...u, progress: p } : u))))
        .then((ref) => setItems((s) => s.map((u) => (u.id === id ? { ...u, ref, progress: 1 } : u))))
        .catch((e) => setItems((s) => s.map((u) => (u.id === id ? { ...u, error: e.message } : u))));
    }
  }

  const uploading = items.some((u) => !u.ref && !u.error);

  async function save(mode: 'draft' | 'schedule' | 'now') {
    setErr(null);
    if (uploading) return setErr('Espere o upload terminar.');
    const media = items.filter((u) => u.ref).map((u) => u.ref!);
    if (!isX && !media.length && mode !== 'draft') return setErr('Adicione uma foto ou vídeo.');
    if (type === 'carousel' && media.length < 2 && mode !== 'draft') return setErr('Carrossel precisa de pelo menos 2 itens.');
    if ((type === 'reel') && media.some((m) => !m.mime.startsWith('video/'))) return setErr('Reel precisa de um vídeo.');
    if (isX && [caption, ...thread].some((t) => [...t].length > 280)) return setErr('Algum post passa de 280 caracteres.');
    if (mode !== 'draft' && !connected) return setErr(`Conecte sua conta ${isX ? 'do X' : 'do Instagram'} em Ajustes.`);
    const at = new Date(`${date}T${time}`);
    if (mode === 'schedule' && (isNaN(+at) || +at < Date.now() - 60_000)) return setErr('Escolha uma data e hora no futuro.');

    const payload: Partial<Post> = {
      network, type, caption, media, thread: isX ? thread.filter((t) => t.trim()) : [],
      scheduled_at: mode === 'draft' ? (isNaN(+at) ? null : +at) : +at,
      status: mode === 'schedule' ? 'scheduled' : 'draft',
    };
    setBusy(true);
    try {
      let p = editing ? await api.updatePost(editing.id, payload) : await api.createPost(payload);
      if (mode === 'now') {
        p = await api.publishNow(p.id);
        if (p.status === 'error') { setErr(p.error); bump(); return; }
        toast(p.status === 'published' ? 'Publicado!' : 'Enviado. O Instagram está processando o vídeo.');
      } else {
        toast(mode === 'draft' ? 'Rascunho salvo' : `Agendado para ${at.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })} às ${time}`);
      }
      bump();
      onClose();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!editing) return;
    setBusy(true);
    try { await api.deletePost(editing.id); toast('Post apagado'); bump(); onClose(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  }

  function applyBest() {
    if (!best) return;
    const d = nextSlot(best.best.wd, best.best.hour);
    setDate(toDateInput(d)); setTime(toTimeInput(d));
  }

  const count = [...caption].length;
  const readonly = editing && (editing.status === 'published' || editing.status === 'processing');

  return (
    <>
      <div className={`scrim ${open ? 'on' : ''}`} onClick={onClose} />
      <div className={`sheet ${open ? 'on' : ''}`} role="dialog" aria-label="Criar post" aria-hidden={!open}>
        <div className="grab" />
        <h2>{editing ? (readonly ? 'Post publicado' : 'Editar post') : 'Criar post'}</h2>

        {readonly ? (
          <div className="list">
            <p className="muted" style={{ margin: 0 }}>{editing!.caption || '(sem legenda)'}</p>
            {editing!.permalink && <a className="btn ghost" href={editing!.permalink} target="_blank" rel="noreferrer"><Icon name="link" />Abrir na rede</a>}
          </div>
        ) : (
          <>
            <div className="types">
              {TYPES.map((x) => (
                <button key={x.t} className={type === x.t ? 'on' : ''} onClick={() => setType(x.t)}><Icon name={x.icon} />{x.label}</button>
              ))}
            </div>

            <div
              className={`drop ${over ? 'over' : ''}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setOver(true); }}
              onDragLeave={() => setOver(false)}
              onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}
            >
              {items.length > 0 && (
                <div className="tiles" onClick={(e) => e.stopPropagation()}>
                  {items.map((u) => (
                    <div className="tile" key={u.id} title={u.error}>
                      {(u.file?.type ?? u.ref?.mime ?? '').startsWith('video/') ? <video src={u.preview} muted /> : <img src={u.preview} alt="" />}
                      {!u.ref && !u.error && <span className="bar" style={{ width: `${u.progress * 100}%` }} />}
                      {u.error && <span className="bar" style={{ width: '100%', background: 'var(--red)' }} />}
                      <button aria-label="Remover" onClick={() => setItems((s) => s.filter((x) => x.id !== u.id))}>×</button>
                    </div>
                  ))}
                </div>
              )}
              {items.length < maxItems && <span>{items.length ? '+ adicionar' : `Toque ou arraste ${type === 'reel' ? 'um vídeo' : isX ? 'até 4 imagens' : type === 'carousel' ? '2 a 10 fotos/vídeos' : 'uma foto ou vídeo'}`}</span>}
              <input ref={fileRef} type="file" hidden multiple={maxItems > 1}
                accept={isX ? 'image/jpeg,image/png,image/gif,image/webp' : type === 'reel' ? 'video/mp4,video/quicktime' : 'image/jpeg,image/png,video/mp4,video/quicktime'}
                onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ''; }} />
            </div>

            {type !== 'story' && (
              <div className="field">
                <textarea id="caption" value={caption} onChange={(e) => setCaption(e.target.value)} placeholder={isX ? 'O que está acontecendo?' : 'Escreva a legenda…'} />
                <div className="tools">
                  <button className="pill" onClick={() => setSnips(snips ? null : [])}><Icon name="hash" size={14} />Textos salvos</button>
                  {isX && <button className="pill" onClick={() => setThread((t) => [...t, ''])}><Icon name="plus" size={14} />Thread</button>}
                  <span className={`count ${count > limit ? 'over' : ''}`}>{count}/{limit}</span>
                </div>
                {snips && <SnippetPicker onPick={(s) => { setCaption((c) => (c.trim() ? c.trimEnd() + '\n\n' : '') + s.body); setSnips(null); }} />}
              </div>
            )}

            {isX && thread.length > 0 && (
              <div className="thread">
                {thread.map((t, i) => (
                  <div className="field" key={i}>
                    <textarea value={t} placeholder={`Post ${i + 2} da thread`} onChange={(e) => setThread((s) => s.map((x, j) => (j === i ? e.target.value : x)))} />
                    <div className="tools">
                      <button className="pill" onClick={() => setThread((s) => s.filter((_, j) => j !== i))}><Icon name="trash" size={14} />Remover</button>
                      <span className={`count ${[...t].length > 280 ? 'over' : ''}`}>{[...t].length}/280</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="when">
              <label htmlFor="d">Data<input id="d" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>
              <label htmlFor="t">Hora<input id="t" type="time" value={time} onChange={(e) => setTime(e.target.value)} /></label>
            </div>
            {best && best.samples >= 5 && !isX && (
              <div className="besthint"><Icon name="clock" />Melhor horário: {WEEKDAYS[best.best.wd].toLowerCase()} {best.best.hour}h<button onClick={applyBest}>Usar</button></div>
            )}

            {err && <div className="errbox" role="alert">{err}</div>}

            <div className="cta">
              {editing && <button className="del" onClick={remove} disabled={busy} aria-label="Apagar"><Icon name="trash" /></button>}
              <button className="ghost" onClick={() => save('draft')} disabled={busy}>Rascunho</button>
              <button className="ghost" onClick={() => save('now')} disabled={busy}>Publicar já</button>
              <button className="go" onClick={() => save('schedule')} disabled={busy}>{busy ? '…' : 'Agendar'}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

function SnippetPicker({ onPick }: { onPick: (s: Snippet) => void }) {
  const [list, setList] = useState<Snippet[] | null>(null);
  useEffect(() => { api.snippets().then(setList).catch(() => setList([])); }, []);
  if (!list) return <div className="snips"><div className="skeleton" style={{ height: 40 }} /></div>;
  if (!list.length) return <div className="snips muted" style={{ fontSize: 13 }}>Nenhum texto salvo. Crie em Ajustes → Textos salvos.</div>;
  return (
    <div className="snips">
      {list.map((s) => <button key={s.id} onClick={() => onPick(s)}><b>{s.title}</b>{s.body.slice(0, 90)}</button>)}
    </div>
  );
}
