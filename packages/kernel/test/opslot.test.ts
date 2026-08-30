/**
 * Operation 자식의 슬롯과 순서.
 *
 * JSON이 Operation의 자식을 input·output·inoutput 세 배열로 나눠 담으므로, 문서 쪽
 * 순서를 슬롯 그룹(in → out → inout)으로 정규화한다. 그 정렬 때문에 **역명령이
 * 순서를 되돌리지 못하는 구멍**이 있었다. 속성 테스트가 잡았고, 여기서 못 박는다.
 *
 * 핵심: 정렬이 안정적이므로 자리는 (슬롯, 색인) 두 가지로 결정된다.
 * 되돌릴 때 **슬롯을 먼저 맞추지 않으면** 중간 상태의 기본 슬롯('in')으로 자리가
 * 매겨지고, 뒤늦게 슬롯을 고쳐도 그룹 안 상대 순서는 어긋난 채 남는다.
 */

import { describe, expect, it } from 'vitest';

import { type AasDoc, type Cmd, type OpSlot, apply, emptyDoc, newNode, undoAll } from '../src/index.js';

/** Operation 하나에 주어진 슬롯의 자식들 */
function build(slots: OpSlot[]): AasDoc {
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
    node: newNode('sm', 'submodel', { idShort: 'SM', identifier: 'https://bnb.co.kr/ids/sm/x' }),
  });
  push({ t: 'insert', parent: 'sm', index: 0, node: newNode('op', 'op', { idShort: 'Op' }) });
  slots.forEach((opSlot, i) => {
    push({
      t: 'insert',
      parent: 'op',
      index: i,
      node: newNode(`a${i + 1}`, 'prop', { idShort: `A${i + 1}`, opSlot }),
    });
  });
  push({ t: 'insert', parent: 'sm', index: 1, node: newNode('coll', 'smc', { idShort: 'C' }) });
  return doc;
}

const roundTrips = (doc: AasDoc, cmd: Cmd): void => {
  const r = apply(doc, cmd);
  expect(r.rejected).toBeUndefined();
  expect(undoAll(r.doc, r.undo)).toEqual(doc);
};

describe('슬롯 그룹 정렬', () => {
  it('자식을 슬롯 순서로 정규화한다', () => {
    const doc = build(['inout', 'in', 'out']);
    /* a2(in) → a3(out) → a1(inout) */
    expect(doc.order['op']).toEqual(['a2', 'a3', 'a1']);
  });
});

describe('되돌리기가 순서까지 복구한다', () => {
  it('Operation 밖으로 옮겼다 되돌리면 형제 순서가 그대로다', () => {
    /* 반례: [out, inout, inout]에서 마지막을 빼내면 되돌릴 때 둘이 뒤바뀌었다 */
    roundTrips(build(['out', 'inout', 'inout']), {
      t: 'move',
      node: 'a3',
      parent: 'coll',
      index: 0,
    });
  });

  it('앞쪽 것을 빼내도 마찬가지다', () => {
    roundTrips(build(['inout', 'inout', 'out']), {
      t: 'move',
      node: 'a1',
      parent: 'coll',
      index: 0,
    });
  });

  it('슬롯을 바꿨다 되돌리면 자리가 돌아온다', () => {
    /* 값만 되돌리면 안 된다 — 정렬이 안정적이라 옮겨진 상대 순서가 남는다 */
    roundTrips(build(['out', 'inout', 'inout']), {
      t: 'set',
      node: 'a3',
      path: 'opSlot',
      value: 'in',
    });
  });

  it('뒤엣것을 앞 그룹으로 보냈다 되돌려도 순서가 남지 않는다', () => {
    roundTrips(build(['out', 'inout', 'inout']), {
      t: 'set',
      node: 'a2',
      path: 'opSlot',
      value: 'in',
    });
  });

  it('Operation 안에서 자리만 옮겨도 복구된다', () => {
    roundTrips(build(['inout', 'inout', 'inout']), {
      t: 'move',
      node: 'a3',
      parent: 'op',
      index: 0,
    });
  });

  it('밖에서 안으로 넣었다 되돌리면 슬롯이 다시 사라진다', () => {
    const doc = build(['in']);
    const moved = apply(doc, { t: 'move', node: 'coll', parent: 'op', index: 0 });
    expect(moved.rejected).toBeUndefined();
    /* 들어가면 기본 슬롯이 붙는다 */
    expect(moved.doc.nodes['coll']!.opSlot).toBe('in');
    expect(undoAll(moved.doc, moved.undo)).toEqual(doc);
  });
});
