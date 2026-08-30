/**
 * 살아 있는 MQTT 브로커로 값 수집을 점검한다.
 *
 * AID(MQTT) 템플릿으로 모델을 만들고 → 브로커 주소를 로컬로 바꾸고 →
 * 수집을 켜고 → 값을 실제로 발행해 → PostgreSQL에 쌓이는지 본다.
 *
 *   docker compose up -d
 *   pnpm --filter @aas/api exec tsx scripts/collect-check.ts
 */

import process from 'node:process';

import { drizzle } from 'drizzle-orm/postgres-js';
import mqtt from 'mqtt';
import postgres from 'postgres';

import { apply, emptyDoc, newNode } from '@aas/kernel';
import { getTemplate, instantiate } from '@aas/templates';

import { createApp } from '../src/app.js';
import { createCollector } from '../src/collect/collector.js';
import { createMqttAdapter } from '../src/collect/mqtt.js';
import { createPgSampleStore } from '../src/collect/pg.js';
import { createPgStore } from '../src/db/store.js';

const DB = process.env['DATABASE_URL'] ?? 'postgres://aas:aas@localhost:5433/aas';
const BROKER = process.env['MQTT_URL'] ?? 'mqtt://localhost:1883';
const TOPIC = 'machine/imm150/barrelTemperature';

const line = (a: string, b: unknown): void => console.log(a.padEnd(24), b);

/* 1. AID(MQTT)가 달린 모델을 만든다 */
let seq = 0;
const newId = (): string => `c${++seq}`;
let doc = apply(emptyDoc(), {
  t: 'insert',
  parent: null,
  index: 0,
  node: newNode(newId(), 'shell', {
    idShort: 'IMM150_AAS',
    identifier: 'https://bnb.co.kr/ids/aas/imm150-collect',
    globalAssetId: 'https://bnb.co.kr/ids/asset/imm150-collect',
  }),
}).doc;
const shell = doc.roots[0]!;
doc = apply(doc, instantiate(getTemplate('idta-02017-mqtt')!, { newId, shell })).doc;

/* 브로커와 토픽을 이 자리 값으로 바꾼다 — 템플릿 예시는 example.com이다 */
const find = (idShort: string): string =>
  Object.keys(doc.nodes).find((k) => doc.nodes[k]!.idShort === idShort)!;
doc = apply(doc, { t: 'set', node: find('base'), path: 'value', value: BROKER }).doc;
doc = apply(doc, { t: 'set', node: find('href'), path: 'value', value: `${BROKER}/${TOPIC}` }).doc;
doc = apply(doc, { t: 'set', node: find('property_name'), path: 'idShort', value: 'BarrelTemperature' }).doc;

/* 2. 저장소·수집기를 붙인다 */
const db = drizzle(postgres(DB, { max: 3 }));
const samples = createPgSampleStore(db);
const latest: string[] = [];
const collector = createCollector({
  adapters: [createMqttAdapter()],
  store: samples,
  onLatest: (_, s) => latest.push(`${s.signal}=${s.numValue ?? s.textValue}${s.unit ? ` ${s.unit}` : ''}`),
});
const app = createApp(createPgStore(db), { collector, samples });

const created = (await (
  await app.request('/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '수집 점검용 IM-150E', doc }),
  })
).json()) as { id: string };
line('모델', created.id);

/* 3. 계획을 확인하고 수집을 켠다 */
const plan = (await (await app.request(`/collect/${created.id}/plan`)).json()) as {
  sources: Array<{ protocol: string; base: string; signals: Array<{ name: string; address: string }> }>;
  problems: string[];
};
line('접점', `${plan.sources[0]!.protocol} · ${plan.sources[0]!.base}`);
line('신호', plan.sources[0]!.signals.map((s) => `${s.name} ← ${s.address}`).join(', '));
if (plan.problems.length) line('읽지 못한 것', plan.problems.join(' / '));

const started = await app.request(`/collect/${created.id}/start`, { method: 'POST' });
line('수집 시작', `${started.status} ${started.status === 200 ? '(전부 붙음)' : ''}`);

/* 4. 실제로 값을 발행한다 */
const pub = await mqtt.connectAsync(BROKER);
for (const v of [235.4, 241.2, 248.0]) {
  await pub.publishAsync(TOPIC, JSON.stringify({ value: v, ts: '2026-08-30T09:00:00Z' }));
  await new Promise((r) => setTimeout(r, 120));
}
await pub.publishAsync(TOPIC, 'Fault');
await new Promise((r) => setTimeout(r, 400));
await pub.endAsync();

/* 5. 쌓였는지 되묻는다 */
const ts = (await (await app.request(`/models/${created.id}/timeseries?limit=10`)).json()) as {
  total: number;
  samples: Array<{ signal: string; numValue: number | null; textValue: string | null; unit: string | null }>;
};
line('시계열 총계', `${ts.total}건`);
for (const s of ts.samples) {
  line(`  ${s.signal}`, `${s.numValue ?? s.textValue}${s.unit ? ` ${s.unit}` : ''}`);
}
line('AAS 마지막 값', latest[latest.length - 1] ?? '(없음)');

const status = (await (await app.request('/collect/status')).json()) as {
  jobs: Array<{ received: number; lastError: string | null }>;
};
line('수집 상태', `받은 값 ${status.jobs[0]?.received ?? 0}건 · 오류 ${status.jobs[0]?.lastError ?? '없음'}`);

await app.request(`/collect/${created.id}/stop`, { method: 'POST' });
await collector.stopAll();

/**
 * 만든 것을 치운다.
 *
 * 점검 스크립트가 매번 모델을 남기면 저장소와 운전 화면이 금세 점검용으로 뒤덮인다.
 * 남겨서 화면에서 보고 싶으면 `KEEP=1`.
 */
if (process.env['KEEP'] === '1') {
  line('남김', `${created.id} (KEEP=1)`);
} else {
  await app.request(`/models/${created.id}`, { method: 'DELETE' });
  line('정리', '점검용 모델과 시계열을 지웠습니다 (남기려면 KEEP=1)');
}
process.exit(0);
