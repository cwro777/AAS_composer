/**
 * ConceptDescription 생성 — 단위를 실어 보낸다.
 *
 * 값 칸에 "45.2 C"라고 적으면 안 되는 이유가 여기 있다. 단위는 값이 아니라
 * 개념 정의에 속한다. 그 정의가 문서에 실려야 수신 측이 사전을 다시 조회하지 않는다.
 */

import { describe, expect, it } from 'vitest';

import {
  type ConceptResolver,
  type Json,
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

  /**
   * 불러온 파일의 개념은 `raw`로 보존돼 serialize()가 그대로 내놓는다.
   * 통째로 갈아끼우면 남의 개념이 사라지고, 합치지 않으면 옛 결함이 계속 나간다.
   */
  describe('불러온 파일의 개념과 합친다', () => {
    const cd = (id: string, content: Record<string, Json>): Json => ({
      modelType: 'ConceptDescription',
      id,
      embeddedDataSpecifications: [
        {
          dataSpecification: {
            type: 'ExternalReference',
            keys: [{ type: 'GlobalReference', value: 'https://admin-shell.io/aas/3/0/DataSpecificationIec61360' }],
          },
          dataSpecificationContent: {
            modelType: 'DataSpecificationIec61360',
            preferredName: [{ language: 'en', text: 'x' }],
            definition: [{ language: 'en', text: 'x' }],
            ...content,
          },
        },
      ],
    });
    const OTHER = 'https://example.com/cd/Foreign/1/0';

    it('같은 id는 새로 만든 쪽이 이기고, 모르는 id는 자리를 지킨다', () => {
      const doc = docWith([TEMP]);
      const stale = cd(TEMP, { dataType: 'REAL_MEASURE' }); /* 옛 내보내기 — 단위 없음 */
      const foreign = cd(OTHER, { dataType: 'STRING' });
      const env = { ...serialize(doc), conceptDescriptions: [stale, foreign] };

      const { conceptDescriptions } = buildConceptDescriptions(doc, resolver);
      const out = attachConceptDescriptions(env, conceptDescriptions)['conceptDescriptions'] as Array<
        Record<string, unknown>
      >;

      expect(out.map((c) => c['id'])).toEqual([TEMP, OTHER]);
      expect(out[0]).toEqual(conceptDescriptions[0]);
      expect(out[1]).toBe(foreign);
    });

    it('옛 파일의 단위 없는 측정형이 용어집으로 바로잡혀 규격을 통과한다 (AASc-3a-009)', () => {
      const doc = docWith([TEMP]);
      const env = { ...serialize(doc), conceptDescriptions: [cd(TEMP, { dataType: 'REAL_MEASURE' })] };
      expect(verifyEnvironment(env).issues.length).toBeGreaterThan(0);

      const { conceptDescriptions } = buildConceptDescriptions(doc, resolver);
      const r = verifyEnvironment(attachConceptDescriptions(env, conceptDescriptions));
      expect(r.issues.map((i) => `${i.code} ${i.path}`)).toEqual([]);
    });

    it('만든 것이 없어도 불러온 개념은 남는다', () => {
      const foreign = cd(OTHER, { dataType: 'STRING' });
      const env = { ...serialize(docWith([UNKNOWN])), conceptDescriptions: [foreign] };
      expect(attachConceptDescriptions(env, [])['conceptDescriptions']).toEqual([foreign]);
    });
  });

  /**
   * 사람이 `개념 등록`에서 자료형만 고르고 단위를 비워 두면 여기로 온다.
   * 자료형을 그대로 실으면 AASc-3a-009 위반이라 받는 쪽이 **파일 전체를 거부한다.**
   */
  describe('AASc-3a-009 — 측정형에는 단위가 있어야 한다', () => {
    const NOUNIT = 'https://bnb.co.kr/ids/cd/ToolWearRate/1/0';
    const noUnit: ConceptResolver = {
      resolve: (id) =>
        id === NOUNIT
          ? {
              preferredName: [{ language: 'en', text: 'Tool wear rate' }],
              definition: [{ language: 'en', text: 'Wear of the tool per 1000 shots.' }],
              dataType: 'REAL_MEASURE',
            }
          : undefined,
    };

    it('단위를 모르면 자료형을 빼고 내보내 규격을 지킨다', () => {
      const doc = docWith([NOUNIT]);
      const { conceptDescriptions } = buildConceptDescriptions(doc, noUnit);
      expect(conceptDescriptions).toHaveLength(1);

      const spec = (
        (conceptDescriptions[0] as Record<string, unknown>)[
          'embeddedDataSpecifications'
        ] as Array<Record<string, unknown>>
      )[0]!;
      const content = spec['dataSpecificationContent'] as Record<string, unknown>;
      expect(content).not.toHaveProperty('dataType');
      expect(content['definition']).toBeDefined();

      const r = verifyEnvironment(attachConceptDescriptions(serialize(doc), conceptDescriptions));
      expect(r.issues.map((i) => i.code)).toEqual([]);
    });

    it('무엇을 뺐는지 말한다 — 조용히 빼지 않는다', () => {
      const { unresolved } = buildConceptDescriptions(docWith([NOUNIT]), noUnit);
      expect(unresolved.map((i) => i.code)).toEqual(['CD-002']);
      expect(unresolved[0]!.message.ko).toContain('단위');
    });

    it('단위가 있으면 자료형을 그대로 싣는다', () => {
      const { conceptDescriptions, unresolved } = buildConceptDescriptions(
        docWith([TEMP]),
        resolver,
      );
      const spec = (
        (conceptDescriptions[0] as Record<string, unknown>)[
          'embeddedDataSpecifications'
        ] as Array<Record<string, unknown>>
      )[0]!;
      const content = spec['dataSpecificationContent'] as Record<string, unknown>;
      expect(content['dataType']).toBe('REAL_MEASURE');
      expect(content['unit']).toBe('°C');
      expect(unresolved).toEqual([]);
    });
  });
});
