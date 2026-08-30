import process from 'node:process';

import { serve } from '@hono/node-server';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { createApp } from './app.js';
import { type Collector, type SampleStore, createCollector } from './collect/collector.js';
import { createMqttAdapter } from './collect/mqtt.js';
import { createPgSampleStore } from './collect/pg.js';
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
interface Wiring {
  store: ModelStore;
  dictionary: Dictionary;
  samples?: SampleStore;
  collector?: Collector;
  kind: string;
}

function wire(): Wiring {
  const url = process.env['DATABASE_URL'];
  if (!url) {
    /* DB가 없으면 수집도 켜지 않는다 — 받은 값을 둘 곳이 없다 */
    return {
      store: createMemoryStore(),
      dictionary: createDictionary(createMemoryDictStore()),
      kind: '메모리 — 재시작하면 사라집니다',
    };
  }
  const db = drizzle(postgres(url, { max: 5 }));
  const samples = createPgSampleStore(db);
  return {
    store: createPgStore(db),
    /* 상류(IEC CDD)는 아직 없다. 캐시가 답하고, 채우는 것은 scripts/dict-seed.ts다 */
    dictionary: createDictionary(createPgDictStore(db)),
    samples,
    /**
     * 수집한 값은 **시계열에만** 쌓는다.
     *
     * 저작 문서에 되쓰지 않는 이유: 값이 바뀔 때마다 명령 로그에 버전이 생기면
     * 10초마다 한 건씩 쌓여 버전 비교가 무의미해진다. 저작 모델은 구조의 원본이고,
     * 실행 중 값은 BaSyx(런타임 사본)와 시계열이 갖는다.
     *
     * BaSyx로 되미는 것(PATCH $value)은 **어느 요소에 쓸지**를 알아야 하는데,
     * AID는 접점만 기술하고 대상 요소를 가리키지 않는다. 그 연결은 별도 규격
     * (IDTA 02027 Asset Interfaces Mapping Configuration)의 몫이다. 짐작으로 잇지 않는다.
     */
    collector: createCollector({ adapters: [createMqttAdapter()], store: samples }),
    kind: `PostgreSQL (${url.replace(/:[^:@]*@/, ':***@')})`,
  };
}

const { store, dictionary, samples, collector, kind } = wire();
const app = createApp(store, { dictionary, samples, collector });
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
