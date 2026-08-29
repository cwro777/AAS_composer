/**
 * P1 완료 기준 ①② — 무손실 왕복과 명령 되돌리기.
 *
 *   ∀ doc: parse(serialize(doc)).doc ≡ doc                                구조 동등
 *   ∀ env: canonicalize(serialize(parse(env).doc)) ≡ canonicalize(env)     의미 동등
 *   ∀ cmd: apply → undo 가 원문서로 복귀
 */

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  type AasDoc,
  type Cmd,
  apply,
  canonicalJson,
  canonicalize,
  emptyDoc,
  newNode,
  parse,
  serialize,
  undoAll,
} from '../src/index.js';
import { cmdArbitrary, docArbitrary } from './arbitrary.js';

/**
 * 문서 구조 동등 — NodeId는 파싱에서 새로 부여되므로 비교 대상이 아니다.
 * 트리를 위치 기준으로 펼쳐 비교한다.
 */
function shape(doc: AasDoc): unknown {
  const walk = (id: string): unknown => {
    const n = doc.nodes[id]!;
    const { id: _id, raw, ...rest } = n as unknown as Record<string, unknown> & { id: string };
    return {
      ...rest,
      ...(raw ? { raw } : {}),
      children: (doc.order[id] ?? []).map(walk),
    };
  };
  return doc.roots.map(walk);
}

describe('직렬화 계약', () => {
  it('임의 문서 100건에 대해 parse(serialize(doc)) ≡ doc', () => {
    fc.assert(
      fc.property(docArbitrary, (doc) => {
        const env = serialize(doc);
        const back = parse(env).doc;
        expect(canonicalJson(shape(back) as never)).toBe(canonicalJson(shape(doc) as never));
      }),
      { numRuns: 100 },
    );
  });

  it('임의 문서 100건에 대해 serialize가 의미 동등을 유지한다', () => {
    fc.assert(
      fc.property(docArbitrary, (doc) => {
        const env = serialize(doc);
        const again = serialize(parse(env).doc);
        expect(canonicalJson(again as never)).toBe(canonicalJson(env as never));
      }),
      { numRuns: 100 },
    );
  });

  it('canonicalize는 키 순서와 빈 배열 차이를 흡수한다', () => {
    const a = { b: 1, a: [], c: { z: '  x  ', y: null } };
    const b = { c: { y: null, z: 'x' }, a: [], b: 1 };
    expect(canonicalJson(a as never)).toBe(canonicalJson(b as never));
  });

  it('canonicalize는 배열 순서를 바꾸지 않는다 — AAS에서 순서는 의미다', () => {
    const a = canonicalize(['x', 'y'] as never);
    const b = canonicalize(['y', 'x'] as never);
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

describe('명령', () => {
  it('임의 명령에 대해 apply → undo가 원문서로 복귀한다', () => {
    fc.assert(
      fc.property(
        docArbitrary.chain((doc) =>
          fc.tuple(fc.constant(doc), fc.array(cmdArbitrary(doc), { minLength: 1, maxLength: 6 })),
        ),
        ([doc, cmds]) => {
          let cur = doc;
          const undos: Cmd[] = [];
          for (const c of cmds) {
            const r = apply(cur, c);
            if (r.rejected) continue; /* 거부는 문서를 바꾸지 않는다 */
            cur = r.doc;
            undos.unshift(...r.undo);
          }
          const back = undoAll(cur, undos);
          expect(canonicalJson(shape(back) as never)).toBe(canonicalJson(shape(doc) as never));
        },
      ),
      { numRuns: 60 },
    );
  });

  it('거부된 명령은 문서를 바꾸지 않는다', () => {
    fc.assert(
      fc.property(
        docArbitrary.chain((doc) => fc.tuple(fc.constant(doc), cmdArbitrary(doc))),
        ([doc, cmd]) => {
          const r = apply(doc, cmd);
          if (r.rejected) expect(r.doc).toBe(doc);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('batch는 전부 아니면 전무다 — 중간에 거부되면 앞의 것도 남지 않는다', () => {
    const shell = newNode('s1', 'shell', {
      idShort: 'A_AAS',
      identifier: 'https://example.com/ids/aas/a',
      globalAssetId: 'https://example.com/ids/asset/a',
    });
    const doc0 = apply(emptyDoc(), { t: 'insert', parent: null, index: 0, node: shell }).doc;

    const ok = newNode('m1', 'submodel', {
      idShort: 'Ok',
      identifier: 'https://example.com/ids/sm/ok',
    });
    const bad = newNode('p1', 'prop', { idShort: 'Nope', valueType: 'xs:string', value: 'x' });

    const r = apply(doc0, {
      t: 'batch',
      label: 'mixed',
      cmds: [
        { t: 'insert', parent: 's1', index: 0, node: ok },
        { t: 'insert', parent: 's1', index: 1, node: bad }, // Shell 안에 Property — 거부
      ],
    });

    expect(r.rejected?.code).toBe('CONTAINMENT');
    expect(r.doc).toBe(doc0);
    expect(Object.keys(r.doc.nodes)).toEqual(['s1']);
  });

  it('List에 다른 종류를 넣으면 LIST_TYPE_MISMATCH로 거부한다 (AASd-108)', () => {
    const sm = newNode('m1', 'submodel', {
      idShort: 'Sm',
      identifier: 'https://example.com/ids/sm/x',
    });
    const list = newNode('l1', 'sml', { idShort: 'Docs', typeValueListElement: 'File' });
    let doc = apply(emptyDoc(), { t: 'insert', parent: null, index: 0, node: sm }).doc;
    doc = apply(doc, { t: 'insert', parent: 'm1', index: 0, node: list }).doc;

    const prop = newNode('p1', 'prop', { idShort: 'X', valueType: 'xs:string', value: '1' });
    const r = apply(doc, { t: 'insert', parent: 'l1', index: 0, node: prop });
    expect(r.rejected).toEqual({ code: 'LIST_TYPE_MISMATCH', expected: 'File', got: 'Property' });
  });

  it('자기 서브트리 안으로 옮기면 CYCLE로 거부한다', () => {
    const sm = newNode('m1', 'submodel', {
      idShort: 'Sm',
      identifier: 'https://example.com/ids/sm/x',
    });
    const c1 = newNode('c1', 'smc', { idShort: 'Outer' });
    const c2 = newNode('c2', 'smc', { idShort: 'Inner' });
    let doc = apply(emptyDoc(), { t: 'insert', parent: null, index: 0, node: sm }).doc;
    doc = apply(doc, { t: 'insert', parent: 'm1', index: 0, node: c1 }).doc;
    doc = apply(doc, { t: 'insert', parent: 'c1', index: 0, node: c2 }).doc;

    expect(apply(doc, { t: 'move', node: 'c1', parent: 'c2', index: 0 }).rejected).toEqual({
      code: 'CYCLE',
    });
  });
});
