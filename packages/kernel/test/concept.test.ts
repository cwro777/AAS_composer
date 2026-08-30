/**
 * ConceptDescription 생성 — 단위를 실어 보낸다.
 *
 * 값 칸에 "45.2 C"라고 적으면 안 되는 이유가 여기 있다. 단위는 값이 아니라
 * 개념 정의에 속한다. 그 정의가 문서에 실려야 수신 측이 사전을 다시 조회하지 않는다.
 */

import { describe, expect, it } from 'vitest';

import {
  type ConceptResolver,
  apply,
  attachConceptDescriptions,
  buildConceptDescriptions,
  emptyDoc,
  newNode,
  serialize,
  usedSemanticIds,
  verifyEnvironment,
} from '../src/index.js';

const TEMP = 'https://bnb.co.kr/ids/cd/BarrelTemperature/1/0';
const STATE = 'https://bnb.co.kr/ids/cd/MachineState/1/0';
const UNKNOWN = 'https://bnb.co.kr/ids/cd/Mystery/1/0';

const resolver: ConceptResolver = {
  resolve(id) {
    if (id === TEMP) {
      return {
        preferredName: [
          { language: 'ko', text: '배럴온도' },
          { language: 'en', text: 'Barrel temperature' },
        ],
        definition: [{ language: 'en', text: 'Temperature measured in a barrel heating zone.' }],
        unit: '°C',
        dataType: 'REAL_MEASURE',
      };
    }
    if (id === STATE) {
      return {
        preferredName: [
          { language: 'ko', text: '가동상태' },
          { language: 'en', text: 'Machine state' },
        ],
        definition: [{ language: 'en', text: 'Current operating state of the machine.' }],
        dataType: 'STRING',
      };
    }
    return undefined;
  },
};

function docWith(semanticIds: string[]): ReturnType<typeof emptyDoc> {
  let doc = emptyDoc();
  doc = apply(doc, {
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode('sm', 'submodel', {
      idShort: 'OperationalData',
      identifier: 'https://bnb.co.kr/ids/sm/x/operational',
    }),
  }).doc;
  semanticIds.forEach((s, i) => {
    doc = apply(doc, {
      t: 'insert',
      parent: 'sm',
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(`p${i}`, 'prop', {
        idShort: `P${i}`,
        valueType: 'xs:double',
        value: '1',
        semanticId: s,
      }),
    }).doc;
  });
  return doc;
}

describe('쓰인 semanticId 모으기', () => {
  it('같은 개념을 쓰는 노드를 함께 묶는다', () => {
    const doc = docWith([TEMP, TEMP, STATE]);
    const used = usedSemanticIds(doc);
    expect(used.get(TEMP)).toHaveLength(2);
    expect(used.get(STATE)).toHaveLength(1);
  });
});

describe('ConceptDescription 생성', () => {
  it('단위와 자료형이 실린다', () => {
    const { conceptDescriptions } = buildConceptDescriptions(docWith([TEMP]), resolver);
    expect(conceptDescriptions).toHaveLength(1);
    const cd = conceptDescriptions[0] as Record<string, unknown>;
    expect(cd['id']).toBe(TEMP);
    const spec = (cd['embeddedDataSpecifications'] as Array<Record<string, unknown>>)[0]!;
    const content = spec['dataSpecificationContent'] as Record<string, unknown>;
    expect(content['unit']).toBe('°C');
    expect(content['dataType']).toBe('REAL_MEASURE');
    expect(content['preferredName']).toEqual([
      { language: 'ko', text: '배럴온도' },
      { language: 'en', text: 'Barrel temperature' },
    ]);
  });

  it('중복 없이 개념당 하나만 만든다', () => {
    const { conceptDescriptions } = buildConceptDescriptions(docWith([TEMP, TEMP, TEMP]), resolver);
    expect(conceptDescriptions).toHaveLength(1);
  });

  it('id 사전순이라 골든이 흔들리지 않는다', () => {
    const a = buildConceptDescriptions(docWith([STATE, TEMP]), resolver);
    const b = buildConceptDescriptions(docWith([TEMP, STATE]), resolver);
    expect(a.conceptDescriptions).toEqual(b.conceptDescriptions);
  });

  it('모르는 개념은 조용히 빠지지 않고 목록에 남는다', () => {
    const r = buildConceptDescriptions(docWith([TEMP, UNKNOWN]), resolver);
    expect(r.conceptDescriptions).toHaveLength(1);
    expect(r.unresolved.map((i) => i.code)).toEqual(['CD-001']);
    expect(r.unresolved[0]!.path).toBe(UNKNOWN);
    expect(r.unresolved[0]!.node).toBe('p1');
  });

  it('영문 표제어가 없으면 만들지 않고 이유를 남긴다 (AASc-3a-002)', () => {
    const koOnly: ConceptResolver = {
      resolve: () => ({
        preferredName: [{ language: 'ko', text: '배럴온도' }],
        definition: [{ language: 'en', text: 'x' }],
        unit: '°C',
      }),
    };
    const r = buildConceptDescriptions(docWith([TEMP]), koOnly);
    expect(r.conceptDescriptions).toEqual([]);
    expect(r.unresolved[0]!.message.ko).toContain('AASc-3a-002');
  });

  it('영문 정의가 없으면 만들지 않는다 — 지어내지 않는다 (AASc-3a-008)', () => {
    const noDef: ConceptResolver = {
      resolve: () => ({ preferredName: [{ language: 'en', text: 'Barrel temperature' }], unit: '°C' }),
    };
    const r = buildConceptDescriptions(docWith([TEMP]), noDef);
    expect(r.conceptDescriptions).toEqual([]);
    expect(r.unresolved[0]!.message.ko).toContain('AASc-3a-008');
  });
});

describe('Environment에 붙이기', () => {
  it('붙인 결과가 규격 검증을 통과한다', () => {
    const doc = docWith([TEMP, STATE]);
    const { conceptDescriptions } = buildConceptDescriptions(doc, resolver);
    const env = attachConceptDescriptions(serialize(doc), conceptDescriptions);
    expect((env['conceptDescriptions'] as unknown[]).length).toBe(2);

    const r = verifyEnvironment(env);
    expect(r.deserializationError).toBeUndefined();
    expect(r.issues.map((i) => `${i.code} ${i.path}: ${i.message.en}`)).toEqual([]);
  });

  it('빈 배열은 붙이지 않는다 — 규격 위반이다', () => {
    const env = serialize(docWith([UNKNOWN]));
    expect(attachConceptDescriptions(env, [])).not.toHaveProperty('conceptDescriptions');
  });
});
