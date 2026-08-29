/**
 * 템플릿 개정 마이그레이션 — Nameplate 2.0 → 3.0.
 *
 * 계획을 세우는 것과 적용하는 것을 분리한다. planMigration은 문서를 바꾸지 않는다.
 * 매핑 값은 IDTA 공식 Template JSON 두 버전을 기계로 대조해 만든 것이다.
 */

import { describe, expect, it } from 'vitest';

import { apply, emptyDoc, newNode, serialize, verifyEnvironment } from '@aas/kernel';
import type { AasDoc } from '@aas/kernel';

import { getMigration, migrationsFor, planMigration } from '../src/index.js';

const def = getMigration('nameplate-2-0__3-0')!;

/** 2.0 값으로 채운 명판 — 실제로 남아 있을 법한 모양 */
function nameplate20(): { doc: AasDoc; sm: string } {
  let doc = emptyDoc();
  doc = apply(doc, {
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode('sm', 'submodel', {
      idShort: 'Nameplate',
      identifier: 'https://bnb.co.kr/ids/sm/mx200/nameplate',
      semanticId: 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate',
      origin: { templateId: 'idta-02006', version: '2.0' },
    }),
  }).doc;

  const put = (id: string, idShort: string, semanticId: string, value: string): void => {
    doc = apply(doc, {
      t: 'insert',
      parent: 'sm',
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(id, 'prop', { idShort, semanticId, valueType: 'xs:string', value }),
    }).doc;
  };
  put('n1', 'ManufacturerName', '0173-1#02-AAO677#002', 'ACME Machinery');
  put('n2', 'SerialNumber', '0173-1#02-AAM556#002', 'SN-2026-000187');
  put('n3', 'YearOfConstruction', '0173-1#02-AAP906#001', '2026');
  /* 사내에서 이미 다른 값으로 바꾼 항목 — 마이그레이션이 건드리면 안 된다 */
  put('n4', 'CountryOfOrigin', 'https://bnb.co.kr/ids/cd/CountryOfOrigin/1/0', 'KR');
  /* 3.0에서 사라지는 구조 — 자동 변환하지 않고 사람에게 알려야 한다 */
  doc = apply(doc, {
    t: 'insert',
    parent: 'sm',
    index: Number.MAX_SAFE_INTEGER,
    node: newNode('c1', 'smc', {
      idShort: 'ContactInformation',
      semanticId: 'https://admin-shell.io/zvei/nameplate/1/0/ContactInformations/ContactInformation',
    }),
  }).doc;
  doc = apply(doc, {
    t: 'insert',
    parent: 'c1',
    index: 0,
    node: newNode('c2', 'mlp', { idShort: 'Street', semanticId: '0173-1#02-AAO128#002' }),
  }).doc;

  return { doc, sm: 'sm' };
}

describe('Nameplate 2.0 → 3.0 마이그레이션', () => {
  it('2.0 서브모델에 이 매핑이 걸린다', () => {
    const { doc, sm } = nameplate20();
    expect(migrationsFor(doc, sm).map((m) => m.id)).toEqual(['nameplate-2-0__3-0']);
  });

  it('3.0 서브모델에는 걸리지 않는다', () => {
    let doc = emptyDoc();
    doc = apply(doc, {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('sm', 'submodel', {
        idShort: 'Nameplate',
        identifier: 'https://bnb.co.kr/ids/sm/x/nameplate',
        semanticId: 'https://admin-shell.io/idta/nameplate/3/0/Nameplate',
      }),
    }).doc;
    expect(migrationsFor(doc, 'sm')).toEqual([]);
    expect(planMigration(doc, 'sm', def).applicable).toBe(false);
  });

  it('계획을 세워도 문서는 그대로다', () => {
    const { doc, sm } = nameplate20();
    const before = JSON.stringify(doc);
    planMigration(doc, sm, def);
    expect(JSON.stringify(doc)).toBe(before);
  });

  it('미리보기가 무엇이 바뀌는지 전부 보여준다', () => {
    const { doc, sm } = nameplate20();
    const plan = planMigration(doc, sm, def);
    expect(plan.applicable).toBe(true);
    expect(
      plan.steps.map((s) => `${s.kind} ${s.path}: ${s.before ?? ''} → ${s.after ?? ''}`),
    ).toMatchSnapshot();
  });

  it('사내에서 바꾼 semanticId는 건드리지 않는다', () => {
    const { doc, sm } = nameplate20();
    const plan = planMigration(doc, sm, def);
    const touched = plan.steps.filter((s) => s.path.endsWith('/CountryOfOrigin'));
    /* from 값과 다르므로 주 식별자는 그대로 두고, 보조 식별자만 더한다 */
    expect(touched.map((s) => s.kind)).toEqual(['supplemental']);
  });

  it('3.0에서 사라지는 구조는 자동 변환하지 않고 보고한다', () => {
    const { doc, sm } = nameplate20();
    const plan = planMigration(doc, sm, def);
    expect(plan.manual.map((m) => m.path)).toEqual(['Nameplate/ContactInformation']);
    expect(plan.manual[0]!.note.ko).toContain('IDTA 02002');
    /* 자동으로 지우거나 옮기지 않는다 */
    expect(plan.steps.some((s) => s.path.includes('ContactInformation'))).toBe(false);
  });

  it('적용하면 3.0 값이 되고, 되돌리면 2.0으로 복귀한다', () => {
    const { doc, sm } = nameplate20();
    const plan = planMigration(doc, sm, def);
    const applied = apply(doc, plan.cmds);
    expect(applied.rejected).toBeUndefined();

    expect(applied.doc.nodes[sm]!.semanticId).toBe('https://admin-shell.io/idta/nameplate/3/0/Nameplate');
    expect(applied.doc.nodes['n1']!.semanticId).toBe('0112/2///61987#ABA565#009');
    expect(applied.doc.nodes['n1']!.supplementalSemanticIds).toEqual(['0173-1#02-AAO677#004']);
    expect(applied.doc.nodes[sm]!.origin).toEqual({ templateId: 'idta-02006', version: '3.0' });

    let back = applied.doc;
    for (const u of applied.undo) back = apply(back, u).doc;
    expect(back).toEqual(doc);
  });

  it('적용 후에도 규격 검증을 통과한다', () => {
    const { doc, sm } = nameplate20();
    const applied = apply(doc, planMigration(doc, sm, def).cmds);
    const r = verifyEnvironment(serialize(applied.doc));
    expect(r.deserializationError).toBeUndefined();
    expect(r.issues.map((i) => i.message.en)).toEqual([]);
  });
});
