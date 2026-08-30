/**
 * 값 수집.
 *
 * 지키려는 것:
 *  1. **AID가 곧 설정 파일이다** — 실측 픽스처에서 접점이 그대로 읽힌다.
 *  2. 읽지 못한 것은 조용히 넘기지 않는다.
 *  3. 어댑터가 없는 프로토콜은 없다고 말한다. 있는 척하지 않는다.
 *  4. AAS에는 마지막 값 한 벌, 이력은 시계열로.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { parse } from '@aas/kernel';
import { getTemplate, instantiate } from '@aas/templates';
import { apply, emptyDoc, newNode } from '@aas/kernel';

import {
  type SourceAdapter,
  type StoredSample,
  createCollector,
  createMemorySampleStore,
} from '../src/collect/collector.js';
import { readPayload, topicOf } from '../src/collect/mqtt.js';
import { isNodeId, rawOf, relativePathOf } from '../src/collect/opcua.js';
import { planFor } from '../src/collect/plan.js';

const FIXTURE = fileURLToPath(
  new URL('../../../packages/kernel/test/fixtures/injection-molding-imm150.json', import.meta.url),
);

describe('AID에서 수집 계획을 읽는다', () => {
  const doc = parse(JSON.parse(readFileSync(FIXTURE, 'utf8'))).doc;
  const plan = planFor(doc);

  it('사출성형기 픽스처에서 OPC UA 접점이 나온다', () => {
    expect(plan.sources).toHaveLength(1);
    const s = plan.sources[0]!;
    expect(s.protocol).toBe('opcua');
    expect(s.base).toBe('opc.tcp://10.20.30.40:4840');
    expect(s.interfaceName).toBe('InterfaceOPCUA');
  });

  it('신호의 주소는 browsePath다 — OPC UA는 href가 아니라 그쪽이다', () => {
    const sig = plan.sources[0]!.signals[0]!;
    expect(sig.name).toBe('BarrelTemperatureZone1');
    expect(sig.address).toBe('/Objects/2:IM150E/2:Barrel/2:Zone1/2:Temperature');
    expect(sig.unit).toBe('CEL');
    expect(sig.key).toBe('barrelTemperatureZone1');
  });

  it('AID가 없으면 그렇게 말한다', () => {
    const bare = apply(emptyDoc(), {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('n1', 'submodel', { idShort: 'X', identifier: 'https://bnb.co.kr/ids/sm/x' }),
    }).doc;
    const p = planFor(bare);
    expect(p.sources).toEqual([]);
    expect(p.problems[0]).toContain('Asset Interfaces Description');
  });

  it('MQTT 템플릿에서는 href가 토픽을 담는다', () => {
    const def = getTemplate('idta-02017-mqtt')!;
    let i = 0;
    const doc2 = apply(emptyDoc(), instantiate(def, { newId: () => `m${++i}`, shell: null })).doc;
    const p = planFor(doc2);
    expect(p.sources[0]!.protocol).toBe('mqtt');
    expect(p.sources[0]!.base).toBe('mqtt://broker.example.com:1883');
    expect(p.sources[0]!.signals[0]!.address).toContain('machine/mx200/spindleTemperature');
  });
});

describe('MQTT 페이로드 읽기', () => {
  it('href에서 토픽만 뽑는다', () => {
    expect(topicOf('mqtt://broker:1883/machine/mx200/temp', 'mqtt://broker:1883')).toBe(
      'machine/mx200/temp',
    );
    expect(topicOf('machine/mx200/temp', 'mqtt://broker:1883')).toBe('machine/mx200/temp');
  });

  it('평문은 그대로', () => {
    expect(readPayload('235.4', null)).toBe('235.4');
  });

  it('JSON이면 key → value → v 순으로 찾는다', () => {
    expect(readPayload('{"value": 235.4}', null)).toBe('235.4');
    expect(readPayload('{"temp": 12, "value": 9}', 'temp')).toBe('12');
  });

  it('해석하지 못한 페이로드를 0으로 만들지 않는다', () => {
    /* 값이 없는 것과 0은 다르다 */
    expect(readPayload('', null)).toBe('');
    expect(readPayload('not json {', null)).toBe('not json {');
  });
});

describe('OPC UA 주소 읽기', () => {
  it('NodeId 표기를 알아본다 — browsePath로 착각하지 않는다', () => {
    expect(isNodeId('ns=2;i=1234')).toBe(true);
    expect(isNodeId('ns=2;s=Barrel.Zone1')).toBe(true);
    expect(isNodeId('i=2258')).toBe(true);
    expect(isNodeId('/Objects/2:IM150E/2:Barrel')).toBe(false);
  });

  it('browsePath는 앞 슬래시만 맞추고 마디 이름은 건드리지 않는다', () => {
    /* 2: 를 우리가 바꾸면 다른 네임스페이스의 노드를 가리키게 된다 */
    expect(relativePathOf('Objects/2:IM150E/2:Barrel')).toBe('/Objects/2:IM150E/2:Barrel');
    expect(relativePathOf(' /Objects//2:IM150E ')).toBe('/Objects/2:IM150E');
  });

  const dv = (
    value: unknown,
    status = 0,
  ): Parameters<typeof rawOf>[0] =>
    ({ statusCode: { value: status, name: 'BadNodeIdUnknown' }, value: { value } }) as never;

  it('Good이면 값을 문자열로 준다', () => {
    expect(rawOf(dv(235.4))).toEqual({ raw: '235.4' });
    expect(rawOf(dv(false))).toEqual({ raw: 'false' });
  });

  it('Bad 상태는 값이 아니다 — 0으로도 빈 문자열로도 만들지 않는다', () => {
    const r = rawOf(dv(0, 0x80340000));
    expect(r).toHaveProperty('problem');
    expect((r as { problem: string }).problem).toContain('BadNodeIdUnknown');
  });

  it('값이 비어 있으면 문제로 남긴다', () => {
    expect(rawOf(dv(null))).toHaveProperty('problem');
  });

  it('배열 값은 첫 원소만 취하지 않고 통째로 보존한다', () => {
    expect(rawOf(dv([1, 2, 3]))).toEqual({ raw: '[1,2,3]' });
  });
});

describe('수집기', () => {
  const doc = parse(JSON.parse(readFileSync(FIXTURE, 'utf8'))).doc;
  const plan = planFor(doc);

  /** 값을 밀어 넣을 수 있는 가짜 어댑터 */
  function fakeAdapter(protocol: 'opcua' | 'mqtt'): {
    adapter: SourceAdapter;
    push: (signal: string, raw: string) => void;
    trouble: (reason: string) => void;
    stopped: () => number;
  } {
    let emit: ((s: { signal: string; node: string; raw: string; at: Date }) => void) | null = null;
    let complain: ((reason: string) => void) | undefined;
    let nodeOf = new Map<string, string>();
    let stops = 0;
    return {
      adapter: {
        protocol,
        async start(source, onSample, onProblem) {
          emit = onSample;
          complain = onProblem;
          nodeOf = new Map(source.signals.map((s) => [s.name, s.node]));
          return async () => {
            stops += 1;
          };
        },
      },
      push: (signal, raw) =>
        emit?.({ signal, node: nodeOf.get(signal) ?? '', raw, at: new Date('2026-08-30T09:00:00Z') }),
      trouble: (reason) => complain?.(reason),
      stopped: () => stops,
    };
  }

  it('받은 값이 시계열에 쌓이고 마지막 값이 따로 전달된다', async () => {
    const fake = fakeAdapter('opcua');
    const store = createMemorySampleStore();
    const latest: StoredSample[] = [];
    const collector = createCollector({
      adapters: [fake.adapter],
      store,
      onLatest: (_, s) => latest.push(s),
    });

    await collector.start('model-1', plan);
    fake.push('BarrelTemperatureZone1', '235.4');
    fake.push('BarrelTemperatureZone1', '241.2');
    await new Promise((r) => setTimeout(r, 10));

    expect(await store.count('model-1')).toBe(2);
    const rows = await store.recent('model-1');
    expect(rows[0]!.numValue).toBe(241.2);
    expect(rows[0]!.unit).toBe('CEL');
    expect(rows[0]!.semanticId).toContain('PropertyDefinition');
    /* AAS에는 마지막 값 한 벌만 — 되쓸 노드를 알고 있다 */
    expect(latest[latest.length - 1]!.node).toBe(plan.sources[0]!.signals[0]!.node);
  });

  it('숫자가 아니면 문자열로 담는다 — 0으로 바꾸지 않는다', async () => {
    const fake = fakeAdapter('opcua');
    const store = createMemorySampleStore();
    const collector = createCollector({ adapters: [fake.adapter], store });
    await collector.start('model-2', plan);
    fake.push('BarrelTemperatureZone1', 'Fault');
    await new Promise((r) => setTimeout(r, 10));
    const [row] = await store.recent('model-2');
    expect(row!.numValue).toBeNull();
    expect(row!.textValue).toBe('Fault');
  });

  it('어댑터가 없는 프로토콜은 건너뛰고 그 사실을 남긴다', async () => {
    const store = createMemorySampleStore();
    const collector = createCollector({ adapters: [], store });
    const status = await collector.start('model-3', plan);
    expect(status.sources).toHaveLength(0);
    expect(status.skipped[0]!.reason).toContain('opcua 어댑터가 없습니다');
  });

  it('접점 하나가 죽어도 나머지는 계속 받는다', async () => {
    const dying: SourceAdapter = {
      protocol: 'opcua',
      async start() {
        throw new Error('ECONNREFUSED');
      },
    };
    const collector = createCollector({ adapters: [dying], store: createMemorySampleStore() });
    const status = await collector.start('model-4', plan);
    expect(status.skipped[0]!.reason).toContain('ECONNREFUSED');
  });

  it('값이 되지 못한 것은 시계열이 아니라 problems로 간다', async () => {
    const fake = fakeAdapter('opcua');
    const store = createMemorySampleStore();
    const collector = createCollector({ adapters: [fake.adapter], store });
    await collector.start('model-6', plan);

    fake.trouble('BarrelTemperatureZone1: 상태 코드 BadNodeIdUnknown');
    fake.trouble('BarrelTemperatureZone1: 상태 코드 BadNodeIdUnknown'); // 같은 사유는 쌓지 않는다
    await new Promise((r) => setTimeout(r, 10));

    expect(await store.count('model-6')).toBe(0);
    const [status] = collector.status('model-6');
    expect(status!.problems).toHaveLength(1);
    expect(status!.problems[0]).toContain('BadNodeIdUnknown');
    expect(status!.problems[0]).toContain(plan.sources[0]!.interfaceName);
  });

  it('멈추면 어댑터도 끊는다', async () => {
    const fake = fakeAdapter('opcua');
    const collector = createCollector({ adapters: [fake.adapter], store: createMemorySampleStore() });
    await collector.start('model-5', plan);
    expect(collector.status('model-5')).toHaveLength(1);
    expect(await collector.stop('model-5')).toBe(true);
    expect(fake.stopped()).toBe(1);
    expect(collector.status('model-5')).toHaveLength(0);
  });
});
