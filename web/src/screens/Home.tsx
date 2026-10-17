import { api, mediaSrc, type Post } from '../api';
import { useApp } from '../ctx';
import { Icon } from '../components/Icon';
import { Ring, Spark } from '../components/Charts';
import { STATUS_LABEL, TYPE_LABEL, addDays, compact, greeting, hhmm, startOfDay, useCountUp, useLoad } from '../util';

export function Home() {
  const { compose, go, openSettings, toggleTheme, accounts, version } = useApp();
  const ov = useLoad(() => api.overview(7), [version]);
  const tl = useLoad(() => api.timeline(30), [version]);
  const today = startOfDay(new Date());
  const queue = useLoad(() => api.posts(+today, +addDays(today, 2)), [version]);
  const month = useLoad(() => api.posts(+addDays(today, -today.getDate() + 1), +addDays(today, 32)), [version]);
  const top = useLoad(() => api.topPosts(7, 'interactions'), [version]);

  const ig = accounts.find((a) => a.network === 'instagram');
  const xAcc = accounts.find((a) => a.network === 'x');
  const followers = useCountUp(ov.data?.followers ?? 0);
  const o = ov.data;
  const xThisMonth = (month.data ?? []).filter((p) => p.network === 'x' && p.status === 'published').length;
  const scheduledIG = (month.data ?? []).filter((p) => p.network === 'instagram' && p.status === 'scheduled').length;
  const best = top.data?.[0];
  const spark = (tl.data ?? []).map((r) => r.followers ?? 0).filter(Boolean);

  return (
    <section className="screen">
      <div className="top">
        <button className="avatar" onClick={openSettings} aria-label="Ajustes">
          {ig?.avatar ? <img src={ig.avatar} alt="" /> : (ig?.username?.[0] ?? 'P').toUpperCase()}
        </button>
        <div className="hello"><small>{greeting()} 👋</small><b>{ig ? '@' + ig.username : 'Pulso'}</b></div>
        <button className="iconbtn" onClick={toggleTheme} aria-label="Alternar tema"><Icon name="sun" /></button>
        <button className="iconbtn" onClick={openSettings} aria-label="Ajustes"><Icon name="gear" /></button>
      </div>

      {!ig ? (
        <div className="empty">
          <b style={{ color: 'var(--fg)' }}>Conecte seu Instagram</b>
          Precisa ser conta Profissional ligada a uma Página do Facebook.
          <a className="btn" href="/auth/meta/start"><Icon name="ig" />Conectar Instagram</a>
        </div>
      ) : (
        <div className="hero">
          <div className="lbl"><Icon name="ig" size={16} />Seguidores no Instagram</div>
          <div className="big num">{Math.round(followers).toLocaleString('pt-BR')}</div>
          <span className="delta"><Icon name="up" size={14} />{(o?.followersDelta ?? 0) >= 0 ? '+' : ''}{compact(o?.followersDelta)} em 7 dias</span>
          <Spark values={spark} />
          <div className="split">
            <div><span>Alcance 7d</span><b>{compact(o?.current?.reach)}</b></div>
            <div><span>Engajamento</span><b>{((o?.engagementRate ?? 0) * 100).toFixed(1).replace('.', ',')}%</b></div>
            <div><span>Posts</span><b>{o?.posts ?? 0}</b></div>
          </div>
        </div>
      )}

      <div className="quick">
        <button className="qa" onClick={() => compose({ type: 'feed' })}><i><Icon name="img" /></i>Post</button>
        <button className="qa" onClick={() => compose({ type: 'reel' })}><i><Icon name="reel" /></i>Reel</button>
        <button className="qa" onClick={() => compose({ type: 'story' })}><i><Icon name="story" /></i>Story</button>
        <button className="qa" onClick={() => compose({ type: 'x' })}><i><Icon name="x" /></i>Post no X</button>
        <button className="qa alt" onClick={() => go('inbox')}><i><Icon name="inbox" /></i>Comentários</button>
      </div>

      <div className="sec"><h2>Suas redes</h2></div>
      <div className="nets">
        <button className="net ig" onClick={() => (ig ? go('stats') : (location.href = '/auth/meta/start'))}>
          <div className="head"><div className="logo"><Icon name="ig" /></div><Ring pct={Math.min(100, scheduledIG * 10)} color="var(--magenta)" /></div>
          <div className="v num">{ig ? compact(o?.followers) : '—'}</div>
          <small>{ig ? 'seguidores' : 'não conectado'}</small>
          <div className="tag">{scheduledIG} agendados no mês</div>
        </button>
        <button className="net x" onClick={() => (xAcc ? compose({ type: 'x' }) : (location.href = '/auth/x/start'))}>
          <div className="head"><div className="logo"><Icon name="x" /></div><Ring pct={(xThisMonth / 500) * 100} color="var(--violet)" /></div>
          <div className="v num">{xAcc ? `${xThisMonth}/500` : '—'}</div>
          <small>{xAcc ? 'posts no mês (limite Free)' : 'não conectado'}</small>
          <div className="tag" style={{ color: 'var(--muted)' }}>{xAcc ? '@' + xAcc.username : 'toque para conectar'}</div>
        </button>
      </div>

      <div className="sec"><h2>Hoje e amanhã</h2><button className="link" onClick={() => go('cal')}>Ver agenda</button></div>
      <div className="list">
        {queue.loading && !queue.data && <div className="skeleton" style={{ height: 74 }} />}
        {queue.data && queue.data.filter((p) => p.scheduled_at).length === 0 && (
          <div className="empty">Nada na fila.<button className="btn ghost" onClick={() => compose()}><Icon name="plus" />Criar post</button></div>
        )}
        {queue.data?.filter((p) => p.scheduled_at).map((p) => <PostRow key={p.id} p={p} />)}
      </div>

      {best && (
        <>
          <div className="sec"><h2>Melhor post da semana</h2></div>
          <a className="latest" href={best.permalink} target="_blank" rel="noreferrer">
            <div className="ph">{best.thumb && <img src={best.thumb} alt="" />}</div>
            <div style={{ minWidth: 0 }}>
              <small>{best.product_type === 'REELS' ? 'Reel' : best.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : 'Post'} · {new Date(best.posted_at).toLocaleDateString('pt-BR', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}</small>
              <h3>{best.caption || 'Sem legenda'}</h3>
              <div className="stats"><span>♥ {compact(best.likes)}</span><span>💬 {compact(best.comments)}</span><span>↗ {compact(best.shares)}</span><span>🔖 {compact(best.saved)}</span></div>
            </div>
          </a>
        </>
      )}
    </section>
  );
}

export function PostRow({ p }: { p: Post }) {
  const { compose } = useApp();
  const m = p.media[0];
  return (
    <button className="post" onClick={() => compose({ post: p })}>
      <div className="thumb" style={p.network === 'x' && !m ? { background: 'var(--fg)' } : undefined}>
        {m && (m.mime.startsWith('video/') ? <video src={mediaSrc(m.key)} muted preload="metadata" /> : <img src={mediaSrc(m.key)} alt="" loading="lazy" />)}
        <em>{p.network === 'x' ? '𝕏' : p.type === 'reel' ? '▶' : p.type === 'carousel' ? '❐' : p.type === 'story' ? '◎' : '▣'}</em>
      </div>
      <div className="meta">
        <b>{p.caption || (p.type === 'story' ? 'Story' : 'Sem legenda')}</b>
        <span>{TYPE_LABEL[p.type]}{p.scheduled_at ? ` · ${new Date(p.scheduled_at).toLocaleDateString('pt-BR', { weekday: 'short' })} ${hhmm(p.scheduled_at)}` : ''}{p.thread.length ? ` · thread de ${p.thread.length + 1}` : ''}</span>
      </div>
      <span className={`chip ${p.status}`} title={p.error ?? undefined}>{STATUS_LABEL[p.status]}</span>
    </button>
  );
}
