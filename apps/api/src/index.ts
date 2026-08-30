import process from 'node:process';

import { serve } from '@hono/node-server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { createApp } from './app.js';
import { createPgStore } from './db/store.js';
import { type ModelStore, createMemoryStore } from './store.js';

/**
 * 저장소는 DATABASE_URL이 있으면 PostgreSQL, 없으면 메모리다.
 *
 * 메모리일 때 **서버를 껐다 켜면 사라진다.** 시작 로그가 그렇게 말한다 —
 * 저장된 줄 알았는데 아니었다는 상황이 가장 나쁘다.
 */
function makeStore(): { store: ModelStore; kind: string } {
  const url = process.env['DATABASE_URL'];
  if (!url) return { store: createMemoryStore(), kind: '메모리 — 재시작하면 사라집니다' };
  const sql = postgres(url, { max: 5 });
  return { store: createPgStore(drizzle(sql)), kind: `PostgreSQL (${url.replace(/:[^:@]*@/, ':***@')})` };
}

const { store, kind } = makeStore();
const app = createApp(store);
const port = Number(process.env['PORT'] ?? 8787);

if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port });
  console.log(`[api] http://localhost:${port}`);
  console.log(`[api] 저장소: ${kind}`);
  console.log(`[api] BaSyx: ${process.env['BASYX_URL'] ?? 'http://localhost:8081'}`);
}

export default app;
export { createApp, createMemoryStore, createPgStore };
