/**
 * 수집 지연 — 이 화면의 1급 지표(계획서 P9).
 *
 * 값이 **틀린 것**보다 값이 **낡은 것**이 더 자주, 더 조용히 생긴다.
 * 브로커가 끊겨도 마지막 값은 화면에 그대로 남아 있기 때문이다.
 * 그래서 값 옆에는 항상 "언제 것인가"가 붙는다.
 */

export type LagLevel = 'never' | 'fresh' | 'late' | 'stale';

export interface Lag {
  level: LagLevel;
  /** 서버 시각 기준 경과 밀리초. 한 번도 안 왔으면 null */
  ms: number | null;
  text: string;
}

/** 기준은 신호마다 다르다. 화면에서 고르게 하고 기본은 30초로 둔다 */
export const LAG_PRESETS = [
  { label: '10초', ms: 10_000 },
  { label: '30초', ms: 30_000 },
  { label: '1분', ms: 60_000 },
  { label: '5분', ms: 300_000 },
] as const;

export function humanMs(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}초`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}분 ${Math.round((ms % 60_000) / 1000)}초`;
  if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)}시간 ${Math.round((ms % 3_600_000) / 60_000)}분`;
  return `${Math.floor(ms / 86_400_000)}일`;
}

/**
 * `now`는 서버가 준 시각이다. 브라우저 `Date.now()`를 쓰면 시계가 몇 분 어긋난 PC에서
 * 멀쩡한 신호가 지연으로, 죽은 신호가 정상으로 보인다.
 */
export function lagOf(lastAt: string | null, now: string, threshold: number): Lag {
  if (!lastAt) return { level: 'never', ms: null, text: '값이 온 적 없음' };
  const ms = Date.parse(now) - Date.parse(lastAt);
  if (!Number.isFinite(ms)) return { level: 'never', ms: null, text: '시각을 읽지 못함' };
  /* 서버보다 미래에 찍힌 값 — 설비 시계가 앞선 것이다. 0으로 접는다 */
  const elapsed = Math.max(0, ms);
  return {
    level: elapsed <= threshold ? 'fresh' : elapsed <= threshold * 4 ? 'late' : 'stale',
    ms: elapsed,
    text: `${humanMs(elapsed)} 전`,
  };
}

/** 화면 맨 위에 세우는 값 — 가장 낡은 신호가 그 설비의 상태다 */
export function worstLag(lags: Lag[]): Lag | null {
  if (lags.length === 0) return null;
  const rank: Record<LagLevel, number> = { fresh: 0, late: 1, stale: 2, never: 3 };
  return [...lags].sort(
    (a, b) => rank[b.level] - rank[a.level] || (b.ms ?? 0) - (a.ms ?? 0),
  )[0]!;
}
