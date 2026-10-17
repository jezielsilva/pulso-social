import { useEffect, useRef, useState } from 'react';
import type { Post, PostType } from './api';

export const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
export const WD1 = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

export const TYPE_LABEL: Record<PostType, string> = { feed: 'Feed', carousel: 'Carrossel', reel: 'Reel', story: 'Story', x: 'X' };
export const STATUS_LABEL: Record<Post['status'], string> = {
  draft: 'Rascunho', scheduled: 'Agendado', processing: 'Publicando', published: 'Publicado', error: 'Erro',
};

export function compact(n: number | null | undefined) {
  const v = n ?? 0;
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1).replace('.', ',') + 'M';
  if (Math.abs(v) >= 1e4) return (v / 1e3).toFixed(1).replace('.', ',') + 'K';
  return v.toLocaleString('pt-BR');
}

export function pctDelta(cur: number, prev: number) {
  if (!prev) return null;
  return ((cur - prev) / prev) * 100;
}

export const hhmm = (ts: number) => new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
export const ddmm = (ts: number) => new Date(ts).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

export function startOfDay(d: Date) { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
export function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }
export function sameDay(a: Date, b: Date) { return a.toDateString() === b.toDateString(); }

/** Próxima ocorrência do dia da semana/hora (melhor horário) a partir de agora. */
export function nextSlot(wd: number, hour: number) {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(hour);
  let add = (wd - d.getDay() + 7) % 7;
  if (add === 0 && d.getTime() <= Date.now()) add = 7;
  d.setDate(d.getDate() + add);
  return d;
}

export const toDateInput = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const toTimeInput = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function greeting() {
  const h = new Date().getHours();
  return h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
}

/** Número que conta até o valor final ao aparecer. */
export function useCountUp(target: number, ms = 1000) {
  const [v, setV] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setV(target); return; }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const val = a + (target - a) * (1 - Math.pow(1 - p, 3));
      setV(val);
      if (p < 1) raf = requestAnimationFrame(step); else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

/** Carregamento simples com estado. */
export function useLoad<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fn().then((d) => { if (alive) { setData(d); setError(null); } })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  return { data, error, loading, reload: () => setTick((t) => t + 1) };
}
