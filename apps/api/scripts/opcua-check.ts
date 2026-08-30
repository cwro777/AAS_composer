/**
 * 살아 있는 OPC UA 서버로 값 수집을 점검한다.
 *
 * P0 실측 설비(IM-150E)는 OPC UA다. 그 픽스처의 AID를 **그대로** 계획으로 읽고,
 * 거기 적힌 browsePath와 똑같은 주소공간을 가진 서버를 띄워 붙인다.
 * 브로커를 흉내 낸 가짜가 아니라 진짜 TranslateBrowsePathsToNodeIds가 도는지 본다.
 *
 * 신호 하나는 **일부러 만들지 않는다** — 없는 주소가 problems에 남고 나머지는
 * 계속 받는지 확인하기 위해서다.
 *
 *   docker compose up -d          # PostgreSQL(5433)만 있으면 된다
 *   pnpm --filter @aas/api exec tsx scripts/opcua-check.ts
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/postgres-js';
import { DataType, OPCUAServer, Variant } from 'node-opcua';
import postgres from 'postgres';

import { apply, parse } from '@aas/kernel';

import { createApp } from '../src/app.js';
import { createCollector } from '../src/collect/collector.js';
import { createOpcuaAdapter } from '../src/collect/opcua.js';
import { createPgSampleStore } from '../src/collect/pg.js';
import { createPgStore } from '../src/db/store.js';
import { planFor } from '../src/collect/plan.js';

const DB = process.env['DATABASE_URL'] ?? 'postgres://aas:aas@localhost:5433/aas';
const FIXTURE = fileURLToPath(
  new URL('../../../packages/kernel/test/fixtures/injection-molding-imm150.json', import.meta.url),
);

const line = (a: string, b: unknown): void => console.log(a.padEnd(26), b);

/* 1. 실측 픽스처에서 계획을 읽는다 — 여기까지는 설비가 없어도 된다 */
let doc = parse(JSON.parse(readFileSync(FIXTURE, 'utf8'))).doc;
const planned = planFor(doc);
const source = planned.sources.find((s) => s.protocol === 'opcua');
if (!source) throw new Error('픽스처에 OPC UA 접점이 없습니다.');
line('접점', `${source.interfaceName} · ${source.base}`);
line('신호', `${source.signals.length}건`);

/* 2. 그 browsePath와 똑같은 주소공간을 가진 서버를 띄운다 */
const server = new OPCUAServer({ port: 4841, resourcePath: '', buildInfo: { productName: 'IM150E-sim' } });
await server.initialize();
const addressSpace = server.engine.addressSpace!;
const ns = addressSpace.registerNamespace('https://bnb.co.kr/opcua/imm150');
line('네임스페이스 색인', `${ns.index} ← AID가 2: 로 적은 것과 같아야 한다`);

/** 마디 하나를 QualifiedName으로 — `2:Barrel` 은 (2, 'Barrel')이다 */
const qname = (seg: string): { namespaceIndex: number; name: string } => {
  const m = /^(\d+):(.+)$/.exec(seg);
  return m ? { namespaceIndex: Number(m[1]), name: m[2]! } : { namespaceIndex: 0, name: seg };
};

const values = new Map<string, number>();
/** 마지막 신호는 만들지 않는다 — 없는 주소가 어떻게 보고되는지 보려고 */
const missing = source.signals.length > 1 ? source.signals[source.signals.length - 1]! : null;

for (const sig of source.signals) {
  if (sig === missing) continue;
  const segs = sig.address.replace(/^\/+/, '').split('/');
  if (segs[0] !== 'Objects') throw new Error(`browsePath가 /Objects로 시작하지 않습니다: ${sig.address}`);

  let parent = addressSpace.rootFolder.objects;
  for (const seg of segs.slice(1, -1)) {
    const q = qname(seg);
    const existing = parent.getChildByName(q.name, q.namespaceIndex);
    parent = existing ?? (ns.addObject({ browseName: q, organizedBy: parent }) as never);
  }
  const leaf = qname(segs[segs.length - 1]!);
  values.set(sig.name, 200);
  ns.addVariable({
    componentOf: parent,
    browseName: leaf,
    dataType: 'Double',
    minimumSamplingInterval: 100,
    value: {
      get: () => new Variant({ dataType: DataType.Double, value: values.get(sig.name) ?? 0 }),
    },
  });
}
await server.start();
const endpoint = server.getEndpointUrl()!;
line('서버', endpoint);
line('일부러 뺀 신호', missing ? `${missing.name} (${missing.address})` : '없음 (신호가 하나뿐)');

/* 3. AID의 base를 이 서버로 바꾼다 — 나머지(browsePath)는 픽스처 그대로다 */
const baseNode = Object.keys(doc.nodes).find(
  (k) => doc.nodes[k]!.idShort === 'base' && String((doc.nodes[k] as { value?: unknown }).value ?? '').startsWith('opc.tcp'),
)!;
doc = apply(doc, { t: 'set', node: baseNode, path: 'value', value: endpoint }).doc;

/* 4. 붙는다 */
const db = drizzle(postgres(DB, { max: 3 }));
const samples = createPgSampleStore(db);
const collector = createCollector({
  adapters: [createOpcuaAdapter({ samplingIntervalMs: 300 })],
  store: samples,
});
const app = createApp(createPgStore(db), { collector, samples });

const created = (await (
  await app.request('/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'OPC UA 점검용 IM-150E', doc }),
  })
).json()) as { id: string };

const started = await app.request(`/collect/${created.id}/start`, { method: 'POST' });
line('수집 시작', `${started.status} ${started.status === 200 ? '(전부 붙음)' : '(일부만)'}`);

/* 5. 설비 쪽 값을 움직인다 */
for (let i = 0; i < 4; i += 1) {
  for (const [k, v] of values) values.set(k, Math.round((v + 5.3) * 10) / 10);
  await new Promise((r) => setTimeout(r, 400));
}
await new Promise((r) => setTimeout(r, 600));

/* 6. 되묻는다 */
const ts = (await (await app.request(`/models/${created.id}/timeseries?limit=6`)).json()) as {
  total: number;
  samples: Array<{ signal: string; numValue: number | null; textValue: string | null; unit: string | null }>;
};
line('시계열 총계', `${ts.total}건`);
for (const s of ts.samples) line(`  ${s.signal}`, `${s.numValue ?? s.textValue} ${s.unit ?? ''}`.trim());

const status = (await (await app.request('/collect/status')).json()) as {
  jobs: Array<{ received: number; problems: string[]; skipped: Array<{ reason: string }> }>;
};
const job = status.jobs[0]!;
line('받은 값', `${job.received}건`);
for (const p of job.problems) line('  문제', p);
for (const s of job.skipped) line('  건너뜀', s.reason);

await app.request(`/collect/${created.id}/stop`, { method: 'POST' });

/* 7. 없는 주소면 어떻게 되는지 — 같은 서버에 틀린 browsePath로 붙어 본다 */
const pathNode = Object.keys(doc.nodes).find((k) => doc.nodes[k]!.idShort === 'uav_browsePath')!;
const wrong = apply(doc, {
  t: 'set',
  node: pathNode,
  path: 'value',
  value: '/Objects/2:IM150E/2:Barrel/2:Zone9/2:Temperature',
}).doc;
const bad = (await (
  await app.request('/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '틀린 주소 점검', doc: wrong }),
  })
).json()) as { id: string };
const badStart = await app.request(`/collect/${bad.id}/start`, { method: 'POST' });
const badStatus = (await badStart.json()) as { skipped: Array<{ reason: string }> };
line('틀린 주소로 시작', `${badStart.status} (일부만 붙거나 하나도 못 붙음)`);
for (const s of badStatus.skipped) line('  건너뜀', s.reason);
await app.request(`/collect/${bad.id}/stop`, { method: 'POST' });

await collector.stopAll();
await server.shutdown();
process.exit(0);
