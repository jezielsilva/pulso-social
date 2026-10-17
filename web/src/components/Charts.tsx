import { useEffect, useState } from 'react';
import { WD1 } from '../util';

/** Linha branca com área, para o card degradê. */
export function Spark({ values }: { values: number[] }) {
  const w = 300, h = 70;
  if (values.length < 2) return <svg className="spark" viewBox={`0 0 ${w} ${h}`} />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const xy = values.map((v, i) => [(i * w) / (values.length - 1), h - 6 - ((v - min) / span) * (h - 14)]);
  const d = xy.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
  const last = xy[xy.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="hs" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".45" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w} ${h} L0 ${h} Z`} fill="url(#hs)" />
      <path d={d} fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0] - 3} cy={last[1]} r="4" fill="#fff" />
    </svg>
  );
}

export function Ring({ pct, color }: { pct: number; color: string }) {
  const c = 2 * Math.PI * 16;
  const [off, setOff] = useState(c);
  useEffect(() => { const r = requestAnimationFrame(() => setOff(c * (1 - Math.min(1, Math.max(0, pct / 100))))); return () => cancelAnimationFrame(r); }, [pct, c]);
  return (
    <svg className="ring" viewBox="0 0 40 40" aria-label={`${Math.round(pct)}%`}>
      <circle cx="20" cy="20" r="16" fill="none" stroke="var(--line)" strokeWidth="4" />
      <circle cx="20" cy="20" r="16" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={off}
        transform="rotate(-90 20 20)" style={{ transition: 'stroke-dashoffset 1.2s cubic-bezier(.2,.8,.2,1)' }} />
      <text x="20" y="23.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--fg)" fontFamily="IBM Plex Mono, monospace">{Math.round(pct)}%</text>
    </svg>
  );
}

/** Barras finas com ponto brilhante (referência Keitoto). */
export function GlowBars({ labels, values, format }: { labels: string[]; values: number[]; format: (v: number) => string }) {
  const [grown, setGrown] = useState(false);
  useEffect(() => { setGrown(false); const r = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true))); return () => cancelAnimationFrame(r); }, [values.join()]);
  const W = 340, H = 170, base = 148, top = 18, n = values.length || 1, step = W / n;
  const max = Math.max(1, ...values) * 1.1;
  const every = Math.ceil(n / 12);
  return (
    <svg className="bars" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Evolução">
      <defs>
        <linearGradient id="bg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="var(--magenta)" /><stop offset="1" stopColor="var(--magenta)" stopOpacity="0" /></linearGradient>
        <filter id="gl" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" /></filter>
      </defs>
      {[0.33, 0.66, 1].map((g) => { const y = base - g * (base - top); return <line key={g} x1="0" x2={W} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 4" />; })}
      {values.map((v, i) => {
        const x = i * step + step / 2, y = base - (v / max) * (base - top), hi = i === n - 1;
        return (
          <g key={i}>
            <g style={{ transformOrigin: `${x}px ${base}px`, transform: `scaleY(${grown ? 1 : 0})`, transition: `transform .9s ${Math.min(i * 30, 600)}ms cubic-bezier(.2,.9,.2,1)` }}>
              <rect x={x - 1.5} y={y} width="3" height={Math.max(0, base - y)} fill="url(#bg)" rx="1.5" />
              <circle cx={x} cy={y} r={hi ? 6 : 4} fill="var(--magenta)" filter="url(#gl)" />
              <circle cx={x} cy={y} r={hi ? 4 : 2.4} fill={hi ? '#fff' : 'var(--magenta)'} />
            </g>
            {i % every === 0 && <text x={x} y={H - 4} textAnchor="middle" fontSize="9" fill="var(--faint)" fontFamily="Manrope, sans-serif">{labels[i]}</text>}
            {hi && <text x={x - 8} y={y - 10} textAnchor="end" fontSize="10" fontWeight="700" fill="var(--fg)" fontFamily="IBM Plex Mono, monospace">{format(v)}</text>}
          </g>
        );
      })}
    </svg>
  );
}

export function Donut({ data, center, sub }: { data: { label: string; value: number; color: string }[]; center: string; sub: string }) {
  const r = 46, c = 2 * Math.PI * r, total = data.reduce((a, d) => a + d.value, 0) || 1;
  let off = 0;
  return (
    <svg viewBox="0 0 120 120" role="img" aria-label={sub}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--line)" strokeWidth="14" />
      {data.map((d) => {
        const len = Math.max(0, (c * d.value) / total - 3);
        const el = <circle key={d.label} cx="60" cy="60" r={r} fill="none" stroke={d.color} strokeWidth="14" strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} transform="rotate(-90 60 60)" />;
        off += (c * d.value) / total;
        return el;
      })}
      <text x="60" y="57" textAnchor="middle" fontSize="18" fontWeight="700" fill="var(--fg)" fontFamily="IBM Plex Mono, monospace">{center}</text>
      <text x="60" y="73" textAnchor="middle" fontSize="9" fill="var(--muted)" fontFamily="Manrope, sans-serif">{sub}</text>
    </svg>
  );
}

/** 7 dias × faixas de 3h, agregando a grade 7×24 do backend. */
export function Heatmap({ grid, best }: { grid: number[][]; best: { wd: number; hour: number } }) {
  const bands = [6, 9, 12, 15, 18, 21];
  const cell = (d: number, h: number) => (grid[d]?.[h] ?? 0) + (grid[d]?.[h + 1] ?? 0) + (grid[d]?.[h + 2] ?? 0);
  const max = Math.max(1, ...bands.flatMap((h) => grid.map((_, d) => cell(d, h))));
  const bestBand = bands.reduce((b, h) => (best.hour >= h ? h : b), bands[0]);
  return (
    <div className="heatgrid">
      <span />
      {WD1.map((d, i) => <span key={i}>{d}</span>)}
      {bands.map((h) => (
        <FragmentRow key={h} label={`${h}h`}>
          {WD1.map((_, d) => {
            const v = cell(d, h) / max;
            const isBest = d === best.wd && h === bestBand;
            return <i key={d} title={`${h}h–${h + 3}h`} style={{ background: `color-mix(in srgb, var(--magenta) ${Math.round(6 + v * 90)}%, var(--surface2))`, boxShadow: isBest ? '0 0 14px var(--magenta)' : undefined }} />;
          })}
        </FragmentRow>
      ))}
    </div>
  );
}
function FragmentRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <><span>{label}</span>{children}</>;
}
