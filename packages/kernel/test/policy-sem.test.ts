/**
 * POL-SEM-001 — semanticId가 없다.
 *
 * 목록 직속 자식은 idShort가 비어 있는 것이 정상이다(AASd-120). 그 자식을 두고
 * “(이름 없음)에 semanticId가 없습니다”라고 하면 어디를 고쳐야 하는지 알 수 없다 —
 * 고칠 자리는 자식이 아니라 **목록의 semanticIdListElement**다.
 */

import { describe, expect, it } from 'vitest';

import { type AasDoc, type Cmd, apply, emptyDoc, newNode, validate } from '../src/index.js';

function build(patch: Cmd[] = []): AasDoc {
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
    node: newNode('m1', 'submodel', {
      idShort: 'MySubmodel',
      identifier: 'https://bnb.co.kr/ids/sm/my-submodel',
    }),
  });
  push({
    t: 'insert',
    parent: 'm1',
    index: 0,
    node: newNode('l1', 'sml', { idShort: 'MyList', typeValueListElement: 'Property' }),
  });
  push({ t: 'insert', parent: 'l1', index: 0, node: newNode('p1', 'prop', { idShort: 'Item' }) });
  push({ t: 'insert', parent: 'm1', index: 1, node: newNode('p2', 'prop', { idShort: 'MyProperty' }) });
  for (const c of patch) push(c);
  return doc;
}

const semIssues = (doc: AasDoc): ReturnType<typeof validate> =>
  validate(doc).filter((i) => i.code === 'POL-SEM-001');

describe('전역 식별자 중복 (POL-ID-002)', () => {
  it('누구와 겹치는지 말한다 — 이름이 달라도 식별자는 같을 수 있다', () => {
    let doc = build();
    doc = apply(doc, {
      t: 'insert',
      parent: null,
      index: 1,
      node: newNode('m2', 'submodel', {
        idShort: 'MySubmodel1',
        identifier: 'https://bnb.co.kr/ids/sm/my-submodel',
      }),
    }).doc;

    const dup = validate(doc).find((i) => i.code === 'POL-ID-002')!;
    expect(dup.severity).toBe('error');
    /* 상대를 알려 주지 않으면 어디를 봐야 하는지 알 수 없다 */
    expect(dup.message.ko).toContain('MySubmodel');
    expect(dup.message.ko).toContain('idShort가 달라도');
  });

  it('식별자가 다르면 이름이 같아도 지적하지 않는다', () => {
    let doc = build();
    doc = apply(doc, {
      t: 'insert',
      parent: null,
      index: 1,
      node: newNode('m2', 'submodel', {
        idShort: 'MySubmodel',
        identifier: 'https://bnb.co.kr/ids/sm/my-submodel-2',
      }),
    }).doc;
    expect(validate(doc).some((i) => i.code === 'POL-ID-002')).toBe(false);
  });
});

describe('목록 항목의 의미', () => {
  it('목록 자식의 경고는 목록 이름으로 말한다 — “(이름 없음)”이 아니다', () => {
    const doc = build();
    const child = semIssues(doc).find((i) => i.node === 'p1')!;
    expect(child.message.ko).toContain('MyList의 항목');
    expect(child.message.ko).toContain('semanticIdListElement');
    expect(child.message.ko).not.toContain('이름 없음');
  });

  it('목록에 semanticIdListElement가 있으면 자식은 지적하지 않는다', () => {
    const doc = build([
      {
        t: 'set',
        node: 'l1',
        path: 'semanticIdListElement',
        value: 'https://bnb.co.kr/ids/cd/MyList/Element/1/0',
      },
    ]);
    expect(semIssues(doc).some((i) => i.node === 'p1')).toBe(false);
    /* 목록 자신의 semanticId는 여전히 따로 필요하다 */
    expect(semIssues(doc).some((i) => i.node === 'l1')).toBe(true);
  });

  it('목록 밖의 요소는 자기 이름으로 말한다', () => {
    const doc = build();
    const own = semIssues(doc).find((i) => i.node === 'p2')!;
    expect(own.message.ko).toContain('MyProperty에 semanticId가 없습니다');
  });

  it('semanticId를 채우면 사라진다', () => {
    const doc = build([
      { t: 'set', node: 'p2', path: 'semanticId', value: 'https://bnb.co.kr/ids/cd/MyProperty/1/0' },
    ]);
    expect(semIssues(doc).some((i) => i.node === 'p2')).toBe(false);
  });

  it('Shell은 semanticId를 요구하지 않는다', () => {
    const doc = apply(build(), {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('s1', 'shell', { idShort: 'A', identifier: 'https://bnb.co.kr/ids/aas/a' }),
    }).doc;
    expect(semIssues(doc).some((i) => i.node === 's1')).toBe(false);
  });
});
