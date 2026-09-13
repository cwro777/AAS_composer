/**
 * 네임스페이스 옮기기.
 *
 * 지키려는 것:
 *  1. 옛 접두어 아래의 우리 이름(식별자·자산·개념)이 전부 따라간다 — 하나라도 빠지면 옛 도메인으로 나간다.
 *  2. 식별자를 가리키던 참조도 따라간다.
 *  3. **표준 식별자는 그대로다.** admin-shell.io·IEC CDD·eCl@ss는 우리 이름이 아니다.
 *  4. 접두어는 마디 경계에서만 걸린다.
 *  5. 계획은 문서를 바꾸지 않고, 적용은 batch 하나라 되돌리면 원문서다.
 */

import { describe, expect, it } from 'vitest';

import {
  type AasDoc,
  type Cmd,
  apply,
  canonicalize,
  emptyDoc,
  namespacesInDoc,
  newNode,
  planNamespaceMove,
  undoAll,
} from '../src/index.js';

const OLD = 'https://cw.co.kr/ids';
const NEW = 'https://cw1.co.kr/ids';
/* IDTA 02008 1.1 공식 Template JSON에 실재하는 IRI */
const STD_TIME = 'https://admin-shell.io/idta/TimeSeries/Segment/StartTime/1/1';
const STD_CDD = '0112/2///61987#ABA951#009';

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
      idShort: 'MX200_AAS',
      identifier: `${OLD}/aas/mx200-aas`,
      globalAssetId: `${OLD}/asset/mx200-aas`,
    }),
  });
  push({
    t: 'insert',
    parent: 's1',
    index: 0,
    node: newNode('m1', 'submodel', {
      idShort: 'OperationalData',
      identifier: `${OLD}/sm/mx200/operational`,
      semanticId: `${OLD}/cd/OperationalData/1/0`,
      supplementalSemanticIds: [STD_CDD, `${OLD}/cd/OperationalDataAlt/1/0`],
      qualifiers: [{ type: 'Cardinality', valueType: 'xs:string', value: 'One', semanticId: `${OLD}/cd/Card/1/0` }],
    }),
  });
  push({
    t: 'insert',
    parent: 'm1',
    index: 0,
    node: newNode('p1', 'prop', { idShort: 'ToolWearRate', valueType: 'xs:double', semanticId: `${OLD}/cd/ToolWearRate/1/0` }),
  });
  push({
    t: 'insert',
    parent: 'm1',
    index: 1,
    node: newNode('p2', 'prop', { idShort: 'Timestamp', valueType: 'xs:dateTime', semanticId: STD_TIME }),
  });
  push({
    t: 'insert',
    parent: 'm1',
    index: 2,
    node: newNode('p3', 'prop', { idShort: 'SerialNumber', valueType: 'xs:string', semanticId: STD_CDD }),
  });
  /* 마디 경계 — ids2는 ids 아래가 아니다 */
  push({
    t: 'insert',
    parent: 'm1',
    index: 3,
    node: newNode('p4', 'prop', { idShort: 'Other', valueType: 'xs:string', semanticId: 'https://cw.co.kr/ids2/cd/Other/1/0' }),
  });
  /* 서브모델을 가리키는 참조 — 식별자와 함께 따라가야 한다 */
  push({
    t: 'insert',
    parent: 'm1',
    index: 4,
    node: newNode('r1', 'rel', {
      idShort: 'Link',
      first: { type: 'ModelReference', keys: [{ type: 'Submodel', value: `${OLD}/sm/mx200/operational` }] },
      second: { type: 'ModelReference', keys: [{ type: 'Submodel', value: 'urn:other' }] },
    }),
  });
  return doc;
}

describe('네임스페이스 옮기기', () => {
  it('식별자·자산·개념(보조·Qualifier 포함)이 모두 따라간다', () => {
    const doc = build();
    const plan = planNamespaceMove(doc, OLD, `${NEW}/`);
    expect(plan.ok).toBe(true);
    const next = apply(doc, plan.cmds).doc;

    expect((next.nodes['s1'] as { identifier?: string }).identifier).toBe(`${NEW}/aas/mx200-aas`);
    expect((next.nodes['s1'] as { globalAssetId?: string }).globalAssetId).toBe(`${NEW}/asset/mx200-aas`);
    expect((next.nodes['m1'] as { identifier?: string }).identifier).toBe(`${NEW}/sm/mx200/operational`);
    expect(next.nodes['m1']!.semanticId).toBe(`${NEW}/cd/OperationalData/1/0`);
    expect(next.nodes['m1']!.supplementalSemanticIds).toEqual([STD_CDD, `${NEW}/cd/OperationalDataAlt/1/0`]);
    expect(next.nodes['m1']!.qualifiers?.[0]?.semanticId).toBe(`${NEW}/cd/Card/1/0`);
    expect(next.nodes['p1']!.semanticId).toBe(`${NEW}/cd/ToolWearRate/1/0`);
    expect(plan.references).toBe(1);
    expect((next.nodes['r1'] as { first?: { keys: Array<{ value: string }> } }).first?.keys[0]?.value).toBe(
      `${NEW}/sm/mx200/operational`,
    );
  });

  it('표준 식별자와 마디가 다른 접두어는 건드리지 않는다', () => {
    const doc = build();
    const next = apply(doc, planNamespaceMove(doc, OLD, NEW).cmds).doc;
    expect(next.nodes['p2']!.semanticId).toBe(STD_TIME);
    expect(next.nodes['p3']!.semanticId).toBe(STD_CDD);
    expect(next.nodes['p4']!.semanticId).toBe('https://cw.co.kr/ids2/cd/Other/1/0');
  });

  it('계획은 문서를 바꾸지 않고, 적용 뒤 되돌리면 원문서다', () => {
    const doc = build();
    const before = JSON.stringify(canonicalize(doc as never));
    const plan = planNamespaceMove(doc, OLD, NEW);
    expect(JSON.stringify(canonicalize(doc as never))).toBe(before);

    const r = apply(doc, plan.cmds);
    expect(JSON.stringify(canonicalize(undoAll(r.doc, r.undo) as never))).toBe(before);
  });

  it('미리보기가 바뀌는 것을 빠짐없이 보인다', () => {
    const plan = planNamespaceMove(build(), OLD, NEW);
    const fields = plan.steps.map((s) => `${s.kind}:${s.field}`).sort();
    expect(fields).toEqual(
      [
        'asset:globalAssetId',
        'concept:qualifiers[0].semanticId',
        'concept:semanticId',
        'concept:semanticId',
        'concept:supplementalSemanticIds[1]',
        'identifier:identifier',
        'identifier:identifier',
      ].sort(),
    );
  });

  it('옮긴 식별자가 이미 쓰이면 번호를 붙인다 — 중복을 만들지 않는다', () => {
    let doc = build();
    doc = apply(doc, {
      t: 'insert',
      parent: null,
      index: 1,
      node: newNode('m9', 'submodel', { idShort: 'Existing', identifier: `${NEW}/sm/mx200/operational` }),
    }).doc;
    const next = apply(doc, planNamespaceMove(doc, OLD, NEW).cmds).doc;
    expect((next.nodes['m1'] as { identifier?: string }).identifier).toBe(`${NEW}/sm/mx200/operational-2`);
  });

  it.each([
    ['', NEW, 'NS-EMPTY'],
    ['cw', NEW, 'NS-NOT-IRI'],
    [NEW, `${NEW}/`, 'NS-SAME'],
    ['https://cw1.co.kr', NEW, 'NS-NESTED'],
    ['https://admin-shell.io/idta', NEW, 'NS-STANDARD'],
    ['https://cw1.co.kr/idta', 'https://admin-shell.io/idta', 'NS-STANDARD'],
  ])('거절한다: %s → %s (%s)', (from, to, code) => {
    const plan = planNamespaceMove(build(), from, to);
    expect(plan.ok).toBe(false);
    expect(plan.rejection?.code).toBe(code);
    expect(plan.cmds).toEqual({ t: 'batch', label: 'namespace-move', cmds: [] });
  });

  it('raw 안의 옛 접두어는 옮기지 않고 알린다', () => {
    const doc = { ...build(), raw: { conceptDescriptions: [{ id: `${OLD}/cd/ToolWearRate/1/0` }] } };
    const plan = planNamespaceMove(doc, OLD, NEW);
    expect(plan.rawMentions).toBe(true);
  });

  it('문서에 쓰인 사내 네임스페이스 후보를 뽑는다 — 표준은 빼고', () => {
    const found = namespacesInDoc(build());
    expect(found[0]).toEqual({ prefix: OLD, count: 7 });
    expect(found.map((f) => f.prefix)).toContain('https://cw.co.kr/ids2');
    expect(found.map((f) => f.prefix).some((p) => p.includes('admin-shell.io'))).toBe(false);
  });
});
