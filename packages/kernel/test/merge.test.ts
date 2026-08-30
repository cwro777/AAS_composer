/**
 * 같은 뜻의 서브모델 합치기.
 *
 * 지키려는 것:
 *  1. **무엇을 잃는지 먼저 센다.** 합치기가 조용히 요소를 지우면 안 된다.
 *  2. 이름이 겹치는 자식은 옮길 수 없다 — 형제 idShort는 유일해야 한다.
 *  3. 문서를 바꾸지 않는다. 계획만 만든다.
 *  4. 남기는 쪽의 필드는 건드리지 않는다. 어느 쪽이 옳은지 우리가 모른다.
 */

import { describe, expect, it } from 'vitest';

import { type AasDoc, type Cmd, apply, childrenOf, emptyDoc, newNode, undoAll, validate } from '../src/index.js';
import { planMerge } from '../src/merge.js';

const SEM = 'https://admin-shell.io/idta/TimeSeries/1/1/Submodel';

/** 같은 semanticId의 서브모델 둘. 자식은 인자로 준다. */
function build(aKids: string[], bKids: string[]): AasDoc {
  let doc = emptyDoc();
  let seq = 0;
  const push = (cmd: Cmd): void => {
    const r = apply(doc, cmd);
    if (r.rejected) throw new Error(JSON.stringify(r.rejected));
    doc = r.doc;
  };

  push({
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode('s1', 'shell', { idShort: 'Asset', identifier: 'https://bnb.co.kr/ids/aas/a' }),
  });
  for (const [i, kids] of [aKids, bKids].entries()) {
    const sm = `m${i + 1}`;
    push({
      t: 'insert',
      parent: 's1',
      index: i,
      node: newNode(sm, 'submodel', {
        idShort: i === 0 ? 'TimeSeries' : 'TimeSeries_2',
        identifier: `https://bnb.co.kr/ids/sm/timeseries${i === 0 ? '' : '-2'}`,
        semanticId: SEM,
      }),
    });
    for (const k of kids) {
      push({
        t: 'insert',
        parent: sm,
        index: Number.MAX_SAFE_INTEGER,
        node: newNode(`p${++seq}`, 'prop', { idShort: k, semanticId: `urn:c:${k}` }),
      });
    }
  }
  return doc;
}

describe('중복 서브모델을 알아본다', () => {
  it('같은 셸 아래 같은 semanticId면 뒤엣것을 지적한다', () => {
    const issues = validate(build(['A'], ['B'])).filter((i) => i.code === 'POL-STRUCT-004');
    expect(issues).toHaveLength(1);
    /* 첫 번째는 남길 쪽이므로 지적하지 않는다 */
    expect(issues[0]!.node).toBe('m2');
    expect(issues[0]!.message.ko).toContain('TimeSeries');
  });

  it('semanticId가 다르면 지적하지 않는다', () => {
    const doc = apply(build(['A'], ['B']), {
      t: 'set',
      node: 'm2',
      path: 'semanticId',
      value: 'urn:other',
    }).doc;
    expect(validate(doc).some((i) => i.code === 'POL-STRUCT-004')).toBe(false);
  });

  it('셸이 다르면 각자 하나씩이다', () => {
    let doc = build(['A'], ['B']);
    doc = apply(doc, {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('s2', 'shell', { idShort: 'B', identifier: 'https://bnb.co.kr/ids/aas/b' }),
    }).doc;
    doc = apply(doc, { t: 'move', node: 'm2', parent: 's2', index: 0 }).doc;
    expect(validate(doc).some((i) => i.code === 'POL-STRUCT-004')).toBe(false);
  });
});

describe('합치기 계획', () => {
  it('이름이 겹치지 않으면 전부 옮긴다', () => {
    const doc = build(['Metadata'], ['Segments']);
    const plan = planMerge(doc, 'm1', 'm2')!;
    expect(plan.movable).toHaveLength(1);
    expect(plan.conflicts).toEqual([]);
    /* 사라지는 것은 빈 껍데기가 된 서브모델 하나뿐 */
    expect(plan.lost).toBe(1);

    const after = apply(doc, { t: 'batch', label: '합치기', cmds: plan.cmds }).doc;
    expect(after.nodes['m2']).toBeUndefined();
    expect(childrenOf(after, 'm1').map((c) => after.nodes[c]!.idShort)).toEqual([
      'Metadata',
      'Segments',
    ]);
  });

  it('이름이 겹치면 옮기지 못하고, 사라지는 수를 센다', () => {
    const doc = build(['Metadata', 'Segments'], ['Metadata', 'Extra']);
    const plan = planMerge(doc, 'm1', 'm2')!;
    expect(plan.movable.map((n) => doc.nodes[n]!.idShort)).toEqual(['Extra']);
    expect(plan.conflicts.map((c) => c.idShort)).toEqual(['Metadata']);
    /* 서브모델 1 + 옮기지 못한 Metadata 1 */
    expect(plan.lost).toBe(2);
  });

  it('두 번 넣은 그대로면 내용이 같다고 말한다 — 지워도 잃는 것이 없다', () => {
    const same = build(['Metadata', 'Segments'], ['Metadata', 'Segments']);
    /* idShort와 identifier는 다르지만 내용은 같다 */
    expect(planMerge(same, 'm1', 'm2')!.identical).toBe(false);

    /* 이름까지 같게 맞추면 같아진다 */
    let d = apply(same, { t: 'set', node: 'm2', path: 'idShort', value: 'TimeSeries' }).doc;
    d = apply(d, {
      t: 'set',
      node: 'm2',
      path: 'identifier',
      value: 'https://bnb.co.kr/ids/sm/timeseries',
    }).doc;
    expect(planMerge(d, 'm1', 'm2')!.identical).toBe(true);
  });

  it('값이 다르면 같다고 하지 않는다', () => {
    const doc = apply(build(['Metadata'], ['Metadata']), {
      t: 'set',
      node: 'p2',
      path: 'value',
      value: '42',
    }).doc;
    expect(planMerge(doc, 'm1', 'm2')!.identical).toBe(false);
  });

  it('계획은 문서를 바꾸지 않고, 적용은 되돌릴 수 있다', () => {
    const doc = build(['Metadata'], ['Segments']);
    const snapshot = JSON.stringify(doc);
    const plan = planMerge(doc, 'm1', 'm2')!;
    expect(JSON.stringify(doc)).toBe(snapshot);

    const r = apply(doc, { t: 'batch', label: '합치기', cmds: plan.cmds });
    expect(undoAll(r.doc, r.undo)).toEqual(doc);
  });

  it('남기는 쪽의 필드는 건드리지 않는다', () => {
    const doc = build(['Metadata'], ['Segments']);
    const before = doc.nodes['m1'];
    const after = apply(doc, {
      t: 'batch',
      label: '합치기',
      cmds: planMerge(doc, 'm1', 'm2')!.cmds,
    }).doc;
    expect(after.nodes['m1']!.idShort).toBe(before!.idShort);
    expect((after.nodes['m1'] as { identifier: string }).identifier).toBe(
      (before as { identifier: string }).identifier,
    );
  });

  it('합친 뒤에는 중복 경고가 사라진다', () => {
    const doc = build(['Metadata'], ['Segments']);
    const after = apply(doc, {
      t: 'batch',
      label: '합치기',
      cmds: planMerge(doc, 'm1', 'm2')!.cmds,
    }).doc;
    expect(validate(after).some((i) => i.code === 'POL-STRUCT-004')).toBe(false);
  });

  it('같은 노드거나 없는 노드면 계획이 없다', () => {
    const doc = build(['A'], ['B']);
    expect(planMerge(doc, 'm1', 'm1')).toBeNull();
    expect(planMerge(doc, 'm1', 'nope')).toBeNull();
  });
});
