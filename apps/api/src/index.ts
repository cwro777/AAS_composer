import process from 'node:process';

import { serve } from '@hono/node-server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { createApp } from './app.js';
import { createPgStore } from './db/store.js';
import { createPgDictStore } from './dict/pg.js';
import { type Dictionary, createDictionary } from './dict/service.js';
import { createMemoryDictStore } from './dict/store.js';
import { type ModelStore, createMemoryStore } from './store.js';

/**
 * 저장소는 DATABASE_URL이 있으면 PostgreSQL, 없으면 메모리다.
 *
 * 메모리일 때 **서버를 껐다 켜면 사라진다.** 시작 로그가 그렇게 말한다 —
 * 저장된 줄 알았는데 아니었다는 상황이 가장 나쁘다.
 */
function wire(): { store: ModelStore; dictionary: Dictionary; kind: string } {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    return {
      store: createMemoryStore(),
      dictionary: createDictionary(createMemoryDictStore()),
      kind: '메모리 — 재시작하면 사라집니다',
    };
  }
  const db = drizzle(postgres(url, { max: 5 }));
  return {
    store: createPgStore(db),
    /* 상류(IEC CDD)는 아직 없다. 캐시가 답하고, 채우는 것은 scripts/dict-seed.ts다 */
    dictionary: createDictionary(createPgDictStore(db)),
    kind: `PostgreSQL (${url.replace(/:[^:@]*@/, ':***@')})`,
  };
}

const { store, dictionary, kind } = wire();
const app = createApp(store, { dictionary });
const port = Number(process.env['PORT'] ?? 8787);

if (process.env['NODE_ENV'] !== 'test') {
  serve({ fetch: app.fetch, port });
  console.log(`[api] http://localhost:${port}`);
  console.log(`[api] 저장소: ${kind}`);
  console.log(`[api] BaSyx: ${process.env['BASYX_URL'] ?? 'http://localhost:8081'}`);
  void dictionary.status().then((s) => {
    console.log(`[api] 사전: 캐시 ${s.cached}건 · 상류 ${s.upstream ?? '없음 (IEC CDD 미연결)'}`);
  });
}

export default app;
export { createApp, createMemoryStore, createPgStore };
