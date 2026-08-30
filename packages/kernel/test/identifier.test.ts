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
  renameIdentifier,
  slugify,
  suggestIdentifier,
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
