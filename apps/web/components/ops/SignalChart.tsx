'use client';

/**
 * 신호 하나의 최근 시계열.
 *
 * 차트 라이브러리를 넣지 않았다. 선 하나를 그리는 데 200KB를 들일 이유가 없고,
 * 값이 무엇인지보다 **끊겼는지**가 이 화면의 목적이기 때문이다.
 *
 * 점이 많으면 구간마다 **최솟값과 최댓값을 함께** 남겨 줄인다. 균등하게 솎아 내면
 * 순간 스파이크가 사라지는데, 설비 화면에서 그것은 지워지면 안 되는 신호다.
 *
 * 아직 없는 것: 팬·줌. 지금은 최근 N건 창만 본다(계획서 P9의 10만 점 목표는 남아 있다).
 */

import { useMemo } from 'react';

import type { Sample } from '../../lib/api';

interface Props {
  samples: Sample[];
  unit: string | null;
  /** 값이 이 시각보다 오래됐다면 선 끝이 끊긴 것이다 */
  now: string;
  height?: number;
}

interface Pt {
  t: number;
  v: number;
}

/** 구간별 min·max를 시간 순서대로 남긴다 */
export function decimate(pts: Pt[], budget: number): Pt[] {
  if (pts.length <= budget) return pts;
  const buckets = Math.max(2, Math.floor(budget / 2));
  const span = pts.length / buckets;
  const out: Pt[] = [];
  for (let i = 0; i < buckets; i += 1) {
    const slice = pts.slice(Math.floor(i * span), Math.max(Math.floor((i + 1) * span), Math.floor(i * span) + 1));
    if (slice.length === 0) continue;
    let lo = slice[0]!;
    let hi = slice[0]!;
    for (const p of slice) {
      if (p.v < lo.v) lo = p;
      if (p.v > hi.v) hi = p;
    }
    const [a, b] = lo.t <= hi.t ? [lo, hi] : [hi, lo];
    out.push(a);
    if (b !== a) out.push(b);
  }
  return out;
}

const fmt = (n: number): string =>
  Math.abs(n) >= 1000 || Number.isInteger(n) ? n.toLocaleString() : n.toFixed(2);

const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString('ko-KR', { hour12: false });

export function SignalChart({ samples, unit, now, height = 150 }: Props): React.JSX.Element {
  const pts = useMemo(() => {
    const raw = samples
      .filter((s): s is Sample & { numValue: number } => typeof s.numValue === 'number')
      .map((s) => ({ t: Date.parse(s.at), v: s.numValue }))
      .filter((p) => Number.isFinite(p.t))
      .sort((a, b) => a.t - b.t);
    return decimate(raw, 600);
  }, [samples]);

  const texts = useMemo(
    () => samples.filter((s) => s.numValue === null && s.textValue !== null).slice(0, 6),
    [samples],
  );

  if (pts.length === 0) {
    /* 수치가 없다고 빈 상자를 보이지 않는다 — 문자열 값도 값이다 */
    return (
      <div className="chart empty">
        {texts.length ? (
          <ul className="textvals">
            {texts.map((s, i) => (
              <li key={`${s.at}-${i}`}>
                <code>{s.textValue}</code>
                <span>{clock(Date.parse(s.at))}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p>그릴 수치 값이 없습니다.</p>
        )}
      </div>
    );
  }

  const W = 720;
  const H = height;
  const P = { t: 10, r: 46, b: 18, l: 8 };

  const t0 = pts[0]!.t;
  const t1 = Math.max(pts[pts.length - 1]!.t, Date.parse(now));
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  /* 값이 하나뿐이거나 전부 같으면 선이 테두리에 붙는다. 여유를 준다 */
  const pad = hi === lo ? Math.abs(hi || 1) * 0.1 : (hi - lo) * 0.12;
  const yLo = lo - pad;
  const yHi = hi + pad;

  const x = (t: number): number =>
    P.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - P.l - P.r);
  const y = (v: number): number => P.t + (1 - (v - yLo) / (yHi - yLo)) * (H - P.t - P.b);

  const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1]!;

  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="시계열">
        <line className="axis" x1={P.l} y1={y(yLo)} x2={W - P.r} y2={y(yLo)} />
        <line className="axis" x1={P.l} y1={y(yHi)} x2={W - P.r} y2={y(yHi)} />
        <path className="line" d={d} />
        {/* 마지막 값 이후의 공백 — 여기가 길면 끊긴 것이다 */}
        <line className="gap" x1={x(last.t)} y1={y(last.v)} x2={x(t1)} y2={y(last.v)} />
        <circle className="dot" cx={x(last.t)} cy={y(last.v)} r="3" />
        <text className="ylab" x={W - P.r + 6} y={y(yHi) + 4}>
          {fmt(hi)}
        </text>
        <text className="ylab" x={W - P.r + 6} y={y(yLo) + 4}>
          {fmt(lo)}
        </text>
      </svg>
      <div className="chartfoot">
        <span>{clock(t0)}</span>
        <span className="mid">
          {pts.length.toLocaleString()}점
          {samples.length > pts.length ? ` (${samples.length.toLocaleString()}건에서 줄임)` : ''}
        </span>
        <span>
          {fmt(last.v)}
          {unit ? ` ${unit}` : ''} · {clock(last.t)}
        </span>
      </div>
    </div>
  );
}
