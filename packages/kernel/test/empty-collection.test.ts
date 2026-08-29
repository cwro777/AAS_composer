/**
 * 빈 컬렉션 회귀 —  `value: []`는 규격 위반이다.
 *
 * AAS V3.0은 value를 "설정하지 않거나 최소 1개"로 규정한다. 빈 배열을 내보내면
 * aas-core3.0이 "Value must be either not set or have at least one item."으로 거절한다.
 * Asset Interfaces Description의 security 목록(자식이 인스턴스 참조라 삽입 시점에는 비어 있다)에서
 * 실제로 터졌다.
 */

import { describe, expect, it } from 'vitest';

import { apply, emptyDoc, newNode, parse, serialize, verifyEnvironment } from '../src/index.js';

function docWith(kind: 'smc' | 'sml'): ReturnType<typeof emptyDoc> {
  let doc = emptyDoc();
  doc = apply(doc, {
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode('sm1', 'submodel', {
      idShort: 'EmptyHolder',
      identifier: 'https://bnb.co.kr/ids/sm/empty/1',
    }),
  }).doc;
  doc = apply(doc, {
    t: 'insert',
    parent: 'sm1',
    index: 0,
    node: newNode(
      'c1',
      kind,
      kind === 'sml'
        ? { idShort: 'security', typeValueListElement: 'ReferenceElement' }
        : { idShort: 'group' },
    ),
  }).doc;
  return doc;
}

describe('MultiLanguageProperty도 마찬가지다', () => {
  /* 언어 칸만 만들고 아직 텍스트를 안 넣은 상태 — 편집 중에 늘 나온다 */
  const docWithEmptyMlp = (): ReturnType<typeof emptyDoc> => {
    let doc = emptyDoc();
    doc = apply(doc, {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('sm1', 'submodel', {
        idShort: 'Holder',
        identifier: 'https://bnb.co.kr/ids/sm/mlp/1',
      }),
    }).doc;
    doc = apply(doc, {
      t: 'insert',
      parent: 'sm1',
      index: 0,
      node: newNode('m1', 'mlp', { idShort: 'ManufacturerName', langs: [{ language: 'ko', text: '' }] }),
    }).doc;
    return doc;
  };

  it('텍스트가 없으면 value 키가 없다', () => {
    const env = serialize(docWithEmptyMlp()) as Record<string, unknown>;
    const el = (
      (env['submodels'] as Array<Record<string, unknown>>)[0]!['submodelElements'] as Array<
        Record<string, unknown>
      >
    )[0]!;
    expect(el).not.toHaveProperty('value');
  });

  it('aas-core3.0 위반 0건', () => {
    const r = verifyEnvironment(serialize(docWithEmptyMlp()));
    expect(r.deserializationError).toBeUndefined();
    expect(r.issues.map((i) => i.message.en)).toEqual([]);
  });
});

describe('빈 컬렉션은 value를 내보내지 않는다', () => {
  for (const kind of ['smc', 'sml'] as const) {
    it(`${kind}: 자식이 없으면 value 키 자체가 없다`, () => {
      const env = serialize(docWith(kind)) as Record<string, unknown>;
      const submodels = env['submodels'] as Array<Record<string, unknown>>;
      const el = (submodels[0]!['submodelElements'] as Array<Record<string, unknown>>)[0]!;
      expect(el).not.toHaveProperty('value');
    });

    it(`${kind}: aas-core3.0 위반 0건`, () => {
      const r = verifyEnvironment(serialize(docWith(kind)));
      expect(r.deserializationError).toBeUndefined();
      expect(r.issues.map((i) => i.message.en)).toEqual([]);
    });

    it(`${kind}: 왕복해도 빈 컬렉션으로 남는다`, () => {
      const env = serialize(docWith(kind));
      const back = parse(env).doc;
      const again = serialize(back) as Record<string, unknown>;
      expect(again).toEqual(env);
      const el = (
        (again['submodels'] as Array<Record<string, unknown>>)[0]![
          'submodelElements'
        ] as Array<Record<string, unknown>>
      )[0]!;
      expect(el).not.toHaveProperty('value');
    });
  }
});
