import { serve } from '@hono/node-server';
import process from 'node:process';

import { createApp } from './app.js';
import { createMemoryStore } from './store.js';

/**
 * 지금 저장소는 메모리다. `src/db/schema.ts`에 PostgreSQL 스키마가 이미 있고,
 * `ModelStore` 인터페이스를 구현하는 Drizzle 버전을 끼우면 라우트는 그대로다.
 * **끼우기 전까지는 서버를 껐다 켜면 사라진다** — 그 사실을 숨기지 않는다.
 */
const app = createApp(createMemoryStore());
const port = Number(process.env['PORT'] ?? 8787);

if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port });
  console.log(`[api] http://localhost:${port}  (저장소: 메모리 — 재시작하면 사라집니다)`);
}

export default app;
export { createApp, createMemoryStore };
