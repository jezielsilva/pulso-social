import { useMemo, useState } from 'react';
import { api, type Post } from '../api';
import { useApp } from '../ctx';
import { Icon } from '../components/Icon';
import { PostRow } from './Home';
import { WD1, WEEKDAYS, addDays, hhmm, sameDay, startOfDay, useLoad } from '../util';

const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06h–23h; madrugada entra no slot das 06h
const slotOf = (ts: number) => Math.max(6, new Date(ts).getHours());
const dotColor = (p: Post) => (p.network === 'x' ? 'var(--fg)' : p.status === 'error' ? 'var(--red)' : 'var(--magenta)');

export function Agenda() {
  const { compose, version, best } = useApp();
  const [view, setView] = useState<'day' | 'month' | 'list'>('day');
  const [sel, setSel] = useState(startOfDay(new Date()));
  const [monthAnchor, setMonthAnchor] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  const weekStart = addDays(sel, -sel.getDay());
  const range = view === 'month'
    ? [monthAnchor, new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1)]
    : view === 'list' ? [startOfDay(new Date()), addDays(new Date(), 60)] : [weekStart, addDays(weekStart, 7)];
  const posts = useLoad(() => api.posts(+range[0], +range[1]), [version, +range[0], +range[1]]);
  const list = posts.data ?? [];

  const byDay = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of list) if (p.scheduled_at) {
      const k = new Date(p.scheduled_at).toDateString();
      m.set(k, [...(m.get(k) ?? []), p]);
    }
    return m;
  }, [list]);

  const dayPosts = byDay.get(sel.toDateString()) ?? [];
  const now = new Date();
  const isBestDay = best && best.samples >= 5 && sel.getDay() === best.best.wd;
  const bestFree = isBestDay && !dayPosts.some((p) => new Date(p.scheduled_at!).getHours() === best!.best.hour);

  return (
    <section className="screen">
      <div className="top">
        <div className="hello"><small>{sel.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</small><b>Agenda</b></div>
        <button className="iconbtn" onClick={() => setSel(startOfDay(new Date()))} aria-label="Hoje"><Icon name="cal" /></button>
        <button className="iconbtn" onClick={() => compose({ at: new Date(+sel + 19 * 3600_000) })} aria-label="Novo post"><Icon name="plus" /></button>
      </div>
      <div className="seg" role="tablist">
        {(['day', 'month', 'list'] as const).map((v) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{{ day: 'Semana', month: 'Mês', list: 'Lista' }[v]}</button>
        ))}
      </div>

      {view === 'day' && (
        <>
          <div className="weekhead">
            <button className="iconbtn" onClick={() => setSel(addDays(sel, -7))} aria-label="Semana anterior"><Icon name="left" /></button>
            <b>{weekStart.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} – {addDays(weekStart, 6).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })}</b>
            <button className="iconbtn" onClick={() => setSel(addDays(sel, 7))} aria-label="Próxima semana"><Icon name="right" /></button>
          </div>
          <div className="week">
            {Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).map((d) => (
              <button key={+d} className={`day ${sameDay(d, sel) ? 'on' : ''} ${sameDay(d, now) ? 'today' : ''}`} onClick={() => setSel(d)}>
                <span>{WD1[d.getDay()]}</span><b>{d.getDate()}</b>
                <span className="dots">{(byDay.get(d.toDateString()) ?? []).slice(0, 4).map((p) => <i key={p.id} style={{ background: sameDay(d, sel) ? '#fff' : dotColor(p) }} />)}</span>
              </button>
            ))}
          </div>
          <div className="timeline">
            {HOURS.map((h) => {
              const here = dayPosts.filter((p) => slotOf(p.scheduled_at!) === h);
              const showNow = sameDay(sel, now) && now.getHours() === h;
              return (
                <div className="slot" key={h} onDoubleClick={() => compose({ at: new Date(+sel + h * 3600_000) })}>
                  <span className="h">{String(h).padStart(2, '0')}:00</span>
                  {here.map((p) => (
                    <button key={p.id} className={`ev ${p.network === 'x' ? 'x' : 'ig'}`} onClick={() => compose({ post: p })}>
                      <div className="t"><b>{p.caption || (p.type === 'story' ? 'Story' : 'Sem legenda')}</b><span>{hhmm(p.scheduled_at!)} · {p.network === 'x' ? 'X' : p.type}</span></div>
                      <span className={`chip ${p.status}`}>{p.status === 'published' ? '✓' : p.status === 'error' ? '!' : '•'}</span>
                    </button>
                  ))}
                  {bestFree && h === best!.best.hour && (
                    <button className="ev best" onClick={() => compose({ at: new Date(+sel + h * 3600_000) })}>
                      <div className="t"><b>✨ Seu melhor horário está livre</b><span>Toque para agendar aqui</span></div>
                    </button>
                  )}
                  {showNow && <div className="now" style={{ top: `${(now.getMinutes() / 60) * 100}%` }} />}
                </div>
              );
            })}
          </div>
        </>
      )}

      {view === 'month' && (
        <>
          <div className="weekhead">
            <button className="iconbtn" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))} aria-label="Mês anterior"><Icon name="left" /></button>
            <b>{monthAnchor.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</b>
            <button className="iconbtn" onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))} aria-label="Próximo mês"><Icon name="right" /></button>
          </div>
          <div className="mhead">{WEEKDAYS.map((d) => <span key={d}>{d[0]}</span>)}</div>
          <div className="month">
            {Array.from({ length: monthAnchor.getDay() }, (_, i) => <div key={'b' + i} className="mcell blank" />)}
            {Array.from({ length: new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate() }, (_, i) => {
              const d = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), i + 1);
              const ps = byDay.get(d.toDateString()) ?? [];
              return (
                <button key={i} className={`mcell ${sameDay(d, now) ? 'today' : ''}`} onClick={() => { setSel(d); setView('day'); }}>
                  {i + 1}
                  <span className="dots">{ps.slice(0, 6).map((p) => <i key={p.id} style={{ background: dotColor(p) }} />)}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {view === 'list' && (
        <div className="list" style={{ marginTop: 16 }}>
          {posts.loading && !posts.data && <div className="skeleton" style={{ height: 74 }} />}
          {posts.data && !list.length && <div className="empty">Nenhum post nos próximos 60 dias.</div>}
          {[...list].sort((a, b) => (a.scheduled_at ?? 0) - (b.scheduled_at ?? 0)).map((p) => <PostRow key={p.id} p={p} />)}
        </div>
      )}
    </section>
  );
}
