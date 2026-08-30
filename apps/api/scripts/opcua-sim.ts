/**
 * 개발용 OPC UA 시뮬레이터 — 계속 떠 있는다.
 *
 * MQTT 쪽의 `feed-demo.ts`에 대응한다. `opcua-check.ts`는 한 번 확인하고 서버를
 * 내리므로, 화면에서 수집을 켜 보려면 붙어 있을 서버가 따로 필요하다.
 *
 * 주소공간은 **실측 픽스처의 AID가 적어 둔 browsePath 그대로** 만든다.
 * 흉내를 내는 것은 서버뿐이고, 경로·네임스페이스·단위는 실제 모델에서 온다.
 *
 *   pnpm --filter @aas/api exec tsx scripts/opcua-sim.ts
 *   pnpm --filter @aas/api exec tsx scripts/opcua-sim.ts --port 4841
 *
 * Ctrl+C로 멈춘다. 멈추면 운전 화면의 지연이 올라가고 다시 붙지 못한다 —
 * 그것이 이 화면이 보여 주려는 것이다.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { DataType, OPCUAServer, Variant } from 'node-opcua';

import { parse } from '@aas/kernel';

import { planFor } from '../src/collect/plan.js';

const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1]! : fallback;
};

const PORT = Number(arg('port', '4841'));
const FIXTURE = fileURLToPath(
  new URL('../../../packages/kernel/test/fixtures/injection-molding-imm150.json', import.meta.url),
);

const doc = parse(JSON.parse(readFileSync(FIXTURE, 'utf8'))).doc;
const source = planFor(doc).sources.find((s) => s.protocol === 'opcua');
if (!source) throw new Error('픽스처에 OPC UA 접점이 없습니다.');

const server = new OPCUAServer({ port: PORT, resourcePath: '', buildInfo: { productName: 'IM150E-sim' } });
await server.initialize();
const addressSpace = server.engine.addressSpace!;
const ns = addressSpace.registerNamespace('https://bnb.co.kr/opcua/imm150');

/** `2:Barrel` → (2, 'Barrel'). 네임스페이스 번호는 AID가 적은 그대로 쓴다 */
const qname = (seg: string): { namespaceIndex: number; name: string } => {
  const m = /^(\d+):(.+)$/.exec(seg);
  return m ? { namespaceIndex: Number(m[1]), name: m[2]! } : { namespaceIndex: 0, name: seg };
};

const values = new Map<string, number>();

for (const sig of source.signals) {
  const segs = sig.address.replace(/^\/+/, '').split('/');
  if (segs[0] !== 'Objects') {
    console.warn(`[sim] 건너뜀 — /Objects로 시작하지 않습니다: ${sig.address}`);
    continue;
  }
  let parent = addressSpace.rootFolder.objects;
  for (const seg of segs.slice(1, -1)) {
    const q = qname(seg);
    const existing = parent.getChildByName(q.name, q.namespaceIndex);
    parent = existing ?? (ns.addObject({ browseName: q, organizedBy: parent }) as never);
  }
  values.set(sig.name, 235);
  ns.addVariable({
    componentOf: parent,
    browseName: qname(segs[segs.length - 1]!),
    dataType: 'Double',
    minimumSamplingInterval: 100,
    value: { get: () => new Variant({ dataType: DataType.Double, value: values.get(sig.name) ?? 0 }) },
  });
  console.log(`[sim] ${sig.name} ← ${sig.address}${sig.unit ? ` (${sig.unit})` : ''}`);
}

/* 사출 사이클 비슷하게 오르내리고 가끔 튄다 — 차트 축약이 스파이크를 지우지 않는지 보려는 것 */
let t = 0;
const timer = setInterval(() => {
  t += 1;
  for (const k of values.keys()) {
    values.set(k, Math.round((235 + Math.sin(t / 9) * 8 + (t % 37 === 0 ? 24 : 0)) * 10) / 10);
  }
}, 500);

await server.start();
console.log(`[sim] ${server.getEndpointUrl()}`);
console.log('[sim] 운전 화면에서 수집 시작을 누르십시오. Ctrl+C로 멈춥니다.');

const bye = (): void => {
  clearInterval(timer);
  void server.shutdown().then(() => {
    console.log('[sim] 멈췄습니다.');
    process.exit(0);
  });
};
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
