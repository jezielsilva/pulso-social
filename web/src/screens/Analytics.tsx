import { useState } from 'react';
import { api } from '../api';
import { useApp } from '../ctx';
import { Icon } from '../components/Icon';
import { Donut, GlowBars, Heatmap } from '../components/Charts';
import { WEEKDAYS, compact, pctDelta, useCountUp, useLoad } from '../util';

const RANGES = [{ d: 7, l: '7d' }, { d: 30, l: '30d' }, { d: 90, l: '90d' }, { d: 365, l: '12m' }];
const METRICS = [
  { k: 'interactions', l: 'Interações' }, { k: 'reach', l: 'Alcance' }, { k: 'views', l: 'Visualizações' }, { k: 'followers', l: 'Seguidores' },
] as const;
const SORTS = [
  { k: 'interactions', l: 'Interações' }, { k: 'reach', l: 'Alcance' }, { k: 'views', l: 'Views' },
  { k: 'saved', l: 'Salvos' }, { k: 'shares', l: 'Compart.' }, { k: 'comments', l: 'Comentários' },
];
const FMT_COLOR: Record<string, string> = { Reels: 'var(--magenta)', Carrossel: 'var(--violet)', Feed: 'var(--amber)' };

function Delta({ cur, prev }: { cur: number; prev: number }) {
  const d = pctDelta(cur, prev);
  if (d === null) return <span className="muted" style={{ fontSize: 12 }}>sem comparação</span>;
  return <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '▲' : '▼'} {Math.abs(d).toFixed(1).replace('.', ',')}%</span>;
}

export function Analytics() {
  const { version, toast, best } = useApp();
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<(typeof METRICS)[number]['k']>('interactions');
  const [sort, setSort] = useState('interactions');
  const [refreshing, setRefreshing] = useState(false);
  const ov = useLoad(() => api.overview(days), [days, version]);
  const tl = useLoad(() => api.timeline(days), [days, version]);
  const fm = useLoad(() => api.formats(days), [days, version]);
  const tp = useLoad(() => api.topPosts(days, sort), [days, sort, version]);

  const o = ov.data;
  const cur = o?.current, prev = o?.previous;
  const total = useCountUp(metric === 'followers' ? o?.followers ?? 0 : (cur?.[metric] as number) ?? 0);

  // agrega por semana/mês para manter ~12–30 barras
  const rows = tl.data ?? [];
  const bucket = days > 120 ? 30 : days > 45 ? 7 : 1;
  const series: { label: string; v: number }[] = [];
  for (let i = 0; i < rows.length; i += bucket) {
    const chunk = rows.slice(i, i + bucket);
    const v = metric === 'followers'
      ? chunk[chunk.length - 1].followers ?? 0
      : chunk.reduce((a, r) => a + ((r[metric] as number | null) ?? 0), 0);
    const d = new Date(chunk[0].date + 'T12:00:00');
    series.push({ label: bucket >= 30 ? d.toLocaleDateString('pt-BR', { month: 'short' }) : `${d.getDate()}/${d.getMonth() + 1}`, v });
  }

  const fmts = fm.data ?? [];
  const fmtTotal = fmts.reduce((a, f) => a + f.interactions, 0);
  const topFmt = fmts[0];

  async function refresh() {
    setRefreshing(true);
    try { await api.refresh(); toast('Métricas atualizadas'); ov.reload(); tl.reload(); fm.reload(); tp.reload(); }
    catch (e) { toast((e as Error).message, true); } finally { setRefreshing(false); }
  }

  if (o && !o.connected) {
    return (
      <section className="screen">
        <div className="top"><div className="hello"><small>Instagram</small><b>Analytics</b></div></div>
        <div className="empty">Conecte o Instagram para ver suas métricas.<a className="btn" href="/auth/meta/start"><Icon name="ig" />Conectar Instagram</a></div>
      </section>
    );
  }

  return (
    <section className="screen">
      <div className="top">
        <div className="hello"><small>{o?.account ? '@' + o.account.username : 'Instagram'}</small><b>Analytics</b></div>
        <button className="iconbtn" onClick={refresh} disabled={refreshing} aria-label="Atualizar métricas"><Icon name="refresh" /></button>
      </div>
      <div className="rangebar">
        {RANGES.map((r) => <button key={r.d} className={days === r.d ? 'on' : ''} onClick={() => setDays(r.d)}>{r.l}</button>)}
      </div>

      <div className="glowcard">
        <div className="sortbar" style={{ marginBottom: 6 }}>
          {METRICS.map((m) => <button key={m.k} className={metric === m.k ? 'on' : ''} onClick={() => setMetric(m.k)}>{m.l}</button>)}
        </div>
        <div>
          <span className="big num">{compact(Math.round(total))}</span>{' '}
          {metric === 'followers'
            ? <span className={(o?.followersDelta ?? 0) >= 0 ? 'up' : 'down'}>{(o?.followersDelta ?? 0) >= 0 ? '+' : ''}{compact(o?.followersDelta)}</span>
            : cur && prev && <Delta cur={cur[metric]} prev={prev[metric]} />}
        </div>
        <small className="muted">{metric === 'followers' ? `variação em ${days} dias` : `vs. ${days} dias anteriores`}</small>
        {series.length ? <GlowBars labels={series.map((s) => s.label)} values={series.map((s) => s.v)} format={compact} />
          : <div className="empty" style={{ marginTop: 12 }}>Os dados aparecem a partir da primeira coleta diária (06h).</div>}
      </div>

      <div className="kpis">
        {([['reach', 'Alcance'], ['views', 'Visualizações'], ['saves', 'Salvamentos'], ['shares', 'Compartilhamentos'],
          ['comments', 'Comentários'], ['profile_views', 'Visitas ao perfil']] as const).map(([k, l]) => (
          <div className="kpi" key={k}>
            <small>{l}</small>
            <div className="v num">{compact(cur?.[k])}</div>
            {cur && prev && <Delta cur={cur[k]} prev={prev[k]} />}
          </div>
        ))}
      </div>

      <div className="sec"><h2>Seguidores ganhos × perdidos</h2></div>
      <div className="flow">
        <div className="kpi"><small>Novos seguidores</small><div className="v num up">+{compact(cur?.follows)}</div></div>
        <div className="kpi"><small>Deixaram de seguir</small><div className="v num down">−{compact(cur?.unfollows)}</div></div>
      </div>

      <div className="sec"><h2>O que mais funciona</h2></div>
      {fmts.length ? (
        <div className="donutwrap">
          <Donut data={fmts.map((f) => ({ label: f.fmt, value: f.interactions, color: FMT_COLOR[f.fmt] ?? 'var(--mint)' }))}
            center={`${fmtTotal ? Math.round((topFmt.interactions / fmtTotal) * 100) : 0}%`} sub={`vem de ${topFmt.fmt}`} />
          <div className="legend">
            {fmts.map((f) => (
              <div key={f.fmt}><i style={{ background: FMT_COLOR[f.fmt] ?? 'var(--mint)' }} />{f.fmt} <span className="muted" style={{ fontSize: 11 }}>({f.n})</span><b>{compact(Math.round(f.avg_interactions))}/post</b></div>
            ))}
          </div>
        </div>
      ) : <div className="empty">Sem posts no período.</div>}

      <div className="sec"><h2>Melhor horário</h2><span className="muted" style={{ fontSize: 12 }}>seus posts, 90 dias</span></div>
      <div className="heat">
        {best && best.samples > 0 ? (
          <>
            <Heatmap grid={best.grid} best={best.best} />
            <div className="heatnote">
              {best.samples >= 5
                ? <>Pico: <b>{WEEKDAYS[best.best.wd].toLowerCase()}, {best.best.hour}h</b> · {best.lift.toFixed(1).replace('.', ',')}× a média de interações</>
                : <>Poucos posts ainda ({best.samples}). O cálculo fica confiável com 5+.</>}
            </div>
          </>
        ) : <div className="muted" style={{ fontSize: 13 }}>Aparece depois da primeira coleta de posts.</div>}
      </div>

      <div className="sec"><h2>Top posts</h2></div>
      <div className="sortbar">
        {SORTS.map((s) => <button key={s.k} className={sort === s.k ? 'on' : ''} onClick={() => setSort(s.k)}>{s.l}</button>)}
      </div>
      <div className="list">
        {tp.data?.length === 0 && <div className="empty">Sem posts no período.</div>}
        {tp.data?.slice(0, 10).map((p) => (
          <a key={p.external_id} className="post" href={p.permalink} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div className="thumb">{p.thumb && <img src={p.thumb} alt="" loading="lazy" />}</div>
            <div className="meta">
              <b>{p.caption || 'Sem legenda'}</b>
              <span className="num">👁 {compact(p.views)} · ♥ {compact(p.likes)} · 💬 {compact(p.comments)} · 🔖 {compact(p.saved)}</span>
            </div>
            <span className="chip scheduled num">{compact((p as any)[sort])}</span>
          </a>
        ))}
      </div>
    </section>
  );
}
