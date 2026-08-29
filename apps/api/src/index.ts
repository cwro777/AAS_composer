import { serve } from '@hono/node-server';
import { Hono } from 'hono';

/**
 * apps/api — 저장소 · 명령 로그 · 사전 프록시 · BaSyx 게이트웨이.  구현은 P6~P8.
 *
 * 원칙 (docs/plan.html 09장):
 * - `@aas/kernel`을 그대로 import 한다. 검증 로직을 서버에서 다시 쓰지 않는다.
 * - 모든 응답은 Zod 스키마로 정의하고 그 타입을 web이 공유한다.
 * - 사전 프록시는 외부 호출 실패를 에러로 던지지 않고 stale 캐시 + 경고로 응답한다.
 * - 게시(BaSyx V2)는 부분 실패를 롤백하지 않고 항목별 결과를 반환한다.
 */

const app = new Hono();

app.get('/health', (c) => c.json({ ok: true, phase: 'scaffold' }));

/** 아직 만들지 않은 경로는 501과 함께 어느 단계의 일인지 알려 준다. */
const PLANNED: Array<[string, string]> = [
  ['/models', 'P7 — 모델 CRUD · ETag 낙관적 잠금'],
  ['/models/:id/commands', 'P7 — 명령 로그 append → 버전'],
  ['/models/:id/versions', 'P7 — 버전 목록'],
  ['/models/:id/diff', 'P7 — 명령 기반 변경 요약'],
  ['/dictionary/search', 'P6 — IEC CDD 통합 검색 (캐시 우선)'],
  ['/dictionary/:irdi', 'P6 — 단일 조회 + 버전 유효성'],
  ['/export/aasx', 'P7 — AASX 스트리밍'],
  ['/publish/:id', 'P7 — BaSyx V2 등록'],
  ['/batch', 'P8 — CSV 고정 컬럼 일괄 생성'],
];

for (const [path, note] of PLANNED) {
  app.all(path, (c) => c.json({ error: 'NOT_IMPLEMENTED', path, note }, 501));
}

const port = Number(process.env.PORT ?? 8787);

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port });
  console.log(`[api] http://localhost:${port}`);
}

export default app;
