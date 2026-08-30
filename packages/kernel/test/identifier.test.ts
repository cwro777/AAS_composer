/**
 * 식별자 고쳐 쓰기.
 *
 * 지키려는 것:
 *  1. 식별자를 바꾸면 **그것을 가리키던 참조도 같이 바뀐다.** 아니면 문서가 조용히 깨진다.
 *  2. 한 번의 batch이므로 실행취소가 원문서로 정확히 돌아온다.
 *  3. 고치자마자 다른 검증(중복)이 뜨지 않는다.
 *  4. 해석하지 못한 raw는 건드리지 않되, 남아 있으면 그 사실을 알 수 있다.
 */

import { describe, expect, it } from 'vitest';

import { apply, emptyDoc, newNode, undoAll } from '../src/index.js';
import {
  identifierIsReferencedInRaw,
  mintIdentifier,
  renameIdentifier,
  slugify,
  suggestIdentifier,
  uniqueIdentifier,
} from '../src/identifier.js';
import type { AasDoc, Cmd } from '../src/index.js';

const NS = 'https://bnb.co.kr/ids';
const OLD_SM = 'urn:example:sm:technical-data';

function build(): AasDoc {
  let doc = emptyDoc();
  const push = (cmd: Cmd): void => {
    const r = apply(doc, cmd);
    if (r.rejected) throw new Error(JSON.stringify(r.rejected));
    doc = r.doc;
  };

  push({
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode('s1', 'shell', {
      idShort: 'IMM150_AAS',
      identifier: 'urn:example:aas:imm150',
      globalAssetId: 'urn:example:asset:imm150',
    }),
  });
  push({
    t: 'insert',
    parent: 's1',
    index: 0,
    node: newNode('m1', 'submodel', { idShort: 'TechnicalData', identifier: OLD_SM }),
  });
  /* 이 서브모델을 가리키는 참조 — 이름을 바꾸면 같이 고쳐져야 한다 */
  push({
    t: 'insert',
    parent: 'm1',
    index: 0,
    node: newNode('r1', 'rel', {
      idShort: 'Link',
      first: { type: 'ModelReference', keys: [{ type: 'Submodel', value: OLD_SM }] },
      second: { type: 'ModelReference', keys: [{ type: 'Submodel', value: 'urn:other' }] },
    }),
  });
  push({ t: 'insert', parent: 'm1', index: 1, node: newNode('e1', 'ref', { idShort: 'Pointer' }) });
  /* ReferenceElement의 value는 newNode가 받지 않는다 — 실제 경로대로 명령으로 넣는다 */
  push({
    t: 'set',
    node: 'e1',
    path: 'value',
    value: { type: 'ModelReference', keys: [{ type: 'Submodel', value: OLD_SM }] },
  });
  return doc;
}

describe('slugify', () => {
  it('낙타 표기를 마디로 나눈다', () => {
    expect(slugify('RatedPower')).toBe('rated-power');
    expect(slugify('IMM150_AAS')).toBe('imm150-aas');
    expect(slugify('  ')).toBe('');
  });
});

describe('식별자 제안', () => {
  const doc = build();

  it('종류마다 정해진 마디를 쓴다', () => {
    expect(suggestIdentifier(doc, 's1', NS)).toBe(`${NS}/aas/imm150-aas`);
    expect(suggestIdentifier(doc, 'm1', NS)).toBe(`${NS}/sm/technical-data`);
  });

  it('끝의 슬래시를 두 번 넣지 않는다', () => {
    expect(suggestIdentifier(doc, 'm1', `${NS}/`)).toBe(`${NS}/sm/technical-data`);
  });

  it('이미 쓰이는 값이면 번호를 붙인다 — 고치자마자 중복이 되면 안 된다', () => {
    const taken = apply(doc, {
      t: 'set',
      node: 's1',
      path: 'identifier',
      value: `${NS}/sm/technical-data`,
    }).doc;
    expect(suggestIdentifier(taken, 'm1', NS)).toBe(`${NS}/sm/technical-data-2`);
  });

  it('Identifiable이 아니면 제안하지 않는다', () => {
    expect(suggestIdentifier(doc, 'r1', NS)).toBeNull();
  });
});

describe('전역 유일성', () => {
  const doc = build();

  it('겹치지 않으면 그대로 둔다', () => {
    expect(uniqueIdentifier(doc, `${NS}/sm/new-thing`)).toBe(`${NS}/sm/new-thing`);
  });

  it('겹치면 번호를 붙인다', () => {
    expect(uniqueIdentifier(doc, OLD_SM)).toBe(`${OLD_SM}-2`);
  });

  it('자기 자신은 충돌로 세지 않는다', () => {
    expect(uniqueIdentifier(doc, OLD_SM, 'm1')).toBe(OLD_SM);
  });

  it('발급은 종류에 맞는 마디를 쓰고 문서 전체에서 유일하다', () => {
    expect(mintIdentifier(doc, 'submodel', 'MySubmodel', NS)).toBe(`${NS}/sm/my-submodel`);
    const twice = apply(doc, {
      t: 'set',
      node: 'm1',
      path: 'identifier',
      value: `${NS}/sm/my-submodel`,
    }).doc;
    expect(mintIdentifier(twice, 'submodel', 'MySubmodel', NS)).toBe(`${NS}/sm/my-submodel-2`);
  });

  it('유일성 범위는 형제가 아니라 모델 전체다', () => {
    /**
     * 이것이 POL-ID-002의 원인이었다 — 이름을 형제 안에서만 겹치지 않게 하고
     * 거기서 식별자를 파생시키면, 다른 셸 아래의 서브모델과 그대로 부딪힌다.
     */
    let d = apply(doc, {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('s2', 'shell', { idShort: 'Other', identifier: `${NS}/aas/other` }),
    }).doc;

    const first = mintIdentifier(d, 'submodel', 'MySubmodel', NS)!;
    expect(first).toBe(`${NS}/sm/my-submodel`);

    /* 첫 번째를 다른 셸 아래에 넣는다 — 형제가 아니다 */
    d = apply(d, {
      t: 'insert',
      parent: 's2',
      index: 0,
      node: newNode('m2', 'submodel', { idShort: 'MySubmodel', identifier: first }),
    }).doc;

    expect(mintIdentifier(d, 'submodel', 'MySubmodel', NS)).toBe(`${NS}/sm/my-submodel-2`);
  });

  it('이름이나 접두어가 없으면 발급하지 않는다', () => {
    expect(mintIdentifier(doc, 'submodel', '', NS)).toBeNull();
    expect(mintIdentifier(doc, 'submodel', 'X', '')).toBeNull();
  });
});

describe('식별자 바꾸기', () => {
  const doc = build();
  const next = `${NS}/sm/technical-data`;

  it('가리키던 참조를 함께 고친다', () => {
    const cmds = renameIdentifier(doc, 'm1', next);
    const r = apply(doc, { t: 'batch', label: '식별자', cmds });
    expect(r.rejected).toBeUndefined();

    expect((r.doc.nodes['m1'] as { identifier: string }).identifier).toBe(next);
    const rel = r.doc.nodes['r1'] as { first: { keys: Array<{ value: string }> } };
    expect(rel.first.keys[0]!.value).toBe(next);
    const ref = r.doc.nodes['e1'] as { value: { keys: Array<{ value: string }> } };
    expect(ref.value.keys[0]!.value).toBe(next);
  });

  it('상관없는 참조는 건드리지 않는다', () => {
    const cmds = renameIdentifier(doc, 'm1', next);
    const r = apply(doc, { t: 'batch', label: '식별자', cmds });
    const rel = r.doc.nodes['r1'] as { second: { keys: Array<{ value: string }> } };
    expect(rel.second.keys[0]!.value).toBe('urn:other');
  });

  it('실행취소가 원문서로 돌아온다', () => {
    const cmds = renameIdentifier(doc, 'm1', next);
    const r = apply(doc, { t: 'batch', label: '식별자', cmds });
    expect(undoAll(r.doc, r.undo)).toEqual(doc);
  });

  it('바꿀 것이 없으면 명령을 만들지 않는다', () => {
    expect(renameIdentifier(doc, 'm1', OLD_SM)).toEqual([]);
    expect(renameIdentifier(doc, 'm1', '')).toEqual([]);
    expect(renameIdentifier(doc, 'r1', next)).toEqual([]);
  });
});

describe('해석하지 못한 raw', () => {
  it('raw에 남은 옛 식별자를 알려 준다 — 문자열 치환으로 헤집지 않는다', () => {
    const doc = apply(build(), {
      t: 'set',
      node: 'e1',
      path: 'raw.somethingWeDoNotParse',
      value: { ref: OLD_SM },
    }).doc;

    const cmds = renameIdentifier(doc, 'm1', `${NS}/sm/technical-data`);
    const after = apply(doc, { t: 'batch', label: '식별자', cmds }).doc;

    /* raw는 그대로다 */
    expect(JSON.stringify(after.nodes['e1']!.raw)).toContain(OLD_SM);
    expect(identifierIsReferencedInRaw(after, OLD_SM)).toBe(true);
  });

  it('raw가 없으면 false', () => {
    expect(identifierIsReferencedInRaw(build(), OLD_SM)).toBe(false);
  });
});
