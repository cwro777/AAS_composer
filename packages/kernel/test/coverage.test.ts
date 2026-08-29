/**
 * P2 완료 기준 — 노드 15종과 부속 필드를 전부 쓰는 문서가
 * ① 규격 검증(aas-core3.0) 위반 0건이고 ② 무손실로 왕복한다.
 *
 * Package Explorer가 내보낸 실제 AASX의 JSON을 `test/fixtures/`에 넣으면
 * fixtures.test.ts가 자동으로 같은 검사를 돌린다.
 */

import { describe, expect, it } from 'vitest';

import {
  type AasDoc,
  type AasNodeType,
  type Cmd,
  type NodeId,
  MODEL_TYPE,
  apply,
  canonicalize,
  emptyDoc,
  newNode,
  parse,
  serialize,
  validate,
  verifyEnvironment,
} from '../src/index.js';

const NS = 'https://bnb.co.kr/ids';
const modelRef = (kind: string, value: string) =>
  ({ type: 'ModelReference' as const, keys: [{ type: kind, value }] });

function build(): AasDoc {
  let i = 0;
  const id = (): NodeId => `c${++i}`;
  let doc = emptyDoc();
  const cmds: Cmd[] = [];
  const push = (parent: NodeId | null, node: ReturnType<typeof newNode>): NodeId => {
    cmds.push({ t: 'insert', parent, index: Number.MAX_SAFE_INTEGER, node });
    return node.id;
  };

  const shellId = id();
  push(
    null,
    newNode(shellId, 'shell', {
      idShort: 'MX200_Line1_AAS',
      identifier: `${NS}/aas/mx200-line1-001`,
      globalAssetId: `${NS}/asset/mx200-line1-001`,
      assetKind: 'Instance',
      assetType: `${NS}/assettype/cnc-mill`,
      administration: { version: '1', revision: '3', templateId: `${NS}/tpl/machine` },
      derivedFrom: modelRef('AssetAdministrationShell', `${NS}/aas/mx200-type`),
      specificAssetIds: [
        { name: 'PlantEquipmentNo', value: 'F1-L1-007' },
        { name: 'ErpMaterial', value: 'MAT-88231', semanticId: '0173-1#02-AAO676#005' },
      ],
      description: [{ language: 'ko', text: '1공장 1라인 CNC 가공기' }],
    }),
  );

  const smId = id();
  push(
    shellId,
    newNode(smId, 'submodel', {
      idShort: 'FullCoverage',
      identifier: `${NS}/sm/mx200-line1-001/full`,
      kind: 'Instance',
      semanticId: `${NS}/cd/FullCoverage/1/0`,
      administration: { version: '1', revision: '0' },
      qualifiers: [{ type: 'Cardinality', valueType: 'xs:string', value: 'One' }],
      extensions: [{ name: 'internalReviewState', valueType: 'xs:string', value: 'approved' }],
    }),
  );

  /* 값 요소 */
  push(
    smId,
    newNode(id(), 'prop', {
      idShort: 'RatedPower',
      valueType: 'xs:double',
      value: '15.0',
      semanticId: '0173-1#02-AAF018#003',
      qualifiers: [
        { type: 'Unit', valueType: 'xs:string', value: 'kW', kind: 'ValueQualifier' },
      ],
    }),
  );
  push(
    smId,
    newNode(id(), 'mlp', {
      idShort: 'OperatorNote',
      langs: [
        { language: 'ko', text: '주 1회 점검' },
        { language: 'en', text: 'Inspect weekly' },
      ],
      semanticId: `${NS}/cd/OperatorNote/1/0`,
    }),
  );
  push(
    smId,
    newNode(id(), 'range', {
      idShort: 'AmbientTemperature',
      valueType: 'xs:double',
      min: '5',
      max: '40',
      semanticId: '0173-1#02-BAA120#008',
    }),
  );
  push(
    smId,
    newNode(id(), 'file', {
      idShort: 'Manual',
      contentType: 'application/pdf',
      value: '/aasx/files/mx200_manual.pdf',
      semanticId: '0173-1#02-ABK126#002',
    }),
  );
  push(
    smId,
    newNode(id(), 'blob', {
      idShort: 'CalibrationCert',
      contentType: 'application/octet-stream',
      value: 'QUFTIENhbGlicmF0aW9u',
      semanticId: `${NS}/cd/CalibrationCert/1/0`,
    }),
  );
  push(
    smId,
    newNode(id(), 'ref', {
      idShort: 'RelatedShell',
      semanticId: `${NS}/cd/RelatedShell/1/0`,
    }),
  );

  /* 컨테이너 */
  const smcId = id();
  push(smId, newNode(smcId, 'smc', { idShort: 'ProcessQuality', semanticId: `${NS}/cd/ProcessQuality/1/0` }));
  push(
    smcId,
    newNode(id(), 'prop', {
      idShort: 'ToolWearRate',
      valueType: 'xs:double',
      value: '0.34',
      semanticId: `${NS}/cd/ToolWearRate/1/0`,
    }),
  );

  const smlId = id();
  push(
    smId,
    newNode(smlId, 'sml', {
      idShort: 'Phases',
      typeValueListElement: 'Property',
      valueTypeListElement: 'xs:string',
      semanticIdListElement: `${NS}/cd/Phase/1/0`,
      semanticId: `${NS}/cd/Phases/1/0`,
    }),
  );
  push(smlId, newNode(id(), 'prop', { idShort: 'ignored', valueType: 'xs:string', value: 'A3' }));
  push(smlId, newNode(id(), 'prop', { idShort: 'ignored', valueType: 'xs:string', value: 'A4' }));

  /* BoM — Entity와 관계 */
  const entId = id();
  push(
    smId,
    newNode(entId, 'entity', {
      idShort: 'Spindle',
      entityType: 'SelfManagedEntity',
      globalAssetId: `${NS}/asset/spindle-9912`,
      semanticId: `${NS}/cd/Component/1/0`,
    }),
  );
  push(
    entId,
    newNode(id(), 'prop', {
      idShort: 'MaxSpeed',
      valueType: 'xs:double',
      value: '12000',
      semanticId: '0173-1#02-BAF161#004',
    }),
  );

  push(
    smId,
    newNode(id(), 'rel', {
      idShort: 'SpindleIsPartOfMachine',
      first: modelRef('Submodel', `${NS}/sm/mx200-line1-001/full`),
      second: modelRef('Submodel', `${NS}/sm/mx200-line1-001/full`),
      semanticId: `${NS}/cd/IsPartOf/1/0`,
    }),
  );

  const annId = id();
  push(
    smId,
    newNode(annId, 'annrel', {
      idShort: 'ToolMount',
      first: modelRef('Submodel', `${NS}/sm/mx200-line1-001/full`),
      second: modelRef('Submodel', `${NS}/sm/mx200-line1-001/full`),
      semanticId: `${NS}/cd/ToolMount/1/0`,
    }),
  );
  push(
    annId,
    newNode(id(), 'prop', {
      idShort: 'TorqueNm',
      valueType: 'xs:double',
      value: '85',
      semanticId: `${NS}/cd/TorqueNm/1/0`,
    }),
  );

  /* Operation — 세 슬롯 모두 */
  const opId = id();
  push(smId, newNode(opId, 'op', { idShort: 'StartCycle', semanticId: `${NS}/cd/StartCycle/1/0` }));
  push(
    opId,
    newNode(id(), 'prop', {
      idShort: 'ProgramNo',
      valueType: 'xs:string',
      value: 'O1234',
      opSlot: 'in',
      semanticId: `${NS}/cd/ProgramNo/1/0`,
    }),
  );
  push(
    opId,
    newNode(id(), 'prop', {
      idShort: 'CycleId',
      valueType: 'xs:string',
      value: '',
      opSlot: 'out',
      semanticId: `${NS}/cd/CycleId/1/0`,
    }),
  );
  push(
    opId,
    newNode(id(), 'prop', {
      idShort: 'Overrides',
      valueType: 'xs:string',
      value: '',
      opSlot: 'inout',
      semanticId: `${NS}/cd/Overrides/1/0`,
    }),
  );

  push(smId, newNode(id(), 'cap', { idShort: 'Milling', semanticId: `${NS}/cd/Milling/1/0` }));

  const r = apply(doc, { t: 'batch', label: 'coverage', cmds });
  if (r.rejected) throw new Error(`fixture rejected: ${JSON.stringify(r.rejected)}`);
  doc = r.doc;
  return doc;
}

describe('P2 메타모델 커버리지', () => {
  const doc = build();
  const env = serialize(doc);

  it('노드 15종이 모두 등장한다', () => {
    const used = new Set(Object.values(doc.nodes).map((n) => n.t as AasNodeType));
    expect([...used].sort()).toEqual(Object.keys(MODEL_TYPE).sort());
  });

  it('규격 검증(aas-core3.0) 위반 0건', () => {
    const r = verifyEnvironment(env);
    expect(r.deserializationError).toBeUndefined();
    expect(r.issues.map((i) => `${i.code} ${i.path}: ${i.message.en}`)).toEqual([]);
  });

  it('사내 정책(L2) 오류 0건', () => {
    const errors = validate(doc, { iriPrefix: NS }).filter((i) => i.severity === 'error');
    expect(errors.map((e) => `${e.code} ${e.path}`)).toEqual([]);
  });

  it('무손실 왕복', () => {
    const again = serialize(parse(env).doc);
    expect(canonicalize(again as never)).toEqual(canonicalize(env as never));
  });

  it('Operation의 세 변수 슬롯이 보존된다', () => {
    const sm = (env['submodels'] as Array<Record<string, unknown>>)[0]!;
    const els = sm['submodelElements'] as Array<Record<string, unknown>>;
    const op = els.find((e) => e['idShort'] === 'StartCycle')!;
    expect((op['inputVariables'] as unknown[]).length).toBe(1);
    expect((op['outputVariables'] as unknown[]).length).toBe(1);
    expect((op['inoutputVariables'] as unknown[]).length).toBe(1);

    const back = parse(env).doc;
    const opNode = Object.entries(back.nodes).find(([, n]) => n.t === 'op')!;
    const slots = (back.order[opNode[0]] ?? []).map((c) => back.nodes[c]!.opSlot);
    expect(slots).toEqual(['in', 'out', 'inout']);
  });

  it('Entity의 statements와 AnnotatedRelationship의 annotations가 구분된다', () => {
    const sm = (env['submodels'] as Array<Record<string, unknown>>)[0]!;
    const els = sm['submodelElements'] as Array<Record<string, unknown>>;
    expect((els.find((e) => e['idShort'] === 'Spindle')!['statements'] as unknown[]).length).toBe(1);
    expect((els.find((e) => e['idShort'] === 'ToolMount')!['annotations'] as unknown[]).length).toBe(1);
  });

  it('AnnotatedRelationship에 컨테이너를 넣으면 거부한다 (annotations는 DataElement만)', () => {
    const annId = Object.keys(doc.nodes).find((k) => doc.nodes[k]!.t === 'annrel')!;
    const r = apply(doc, {
      t: 'insert',
      parent: annId,
      index: 0,
      node: newNode('bad1', 'smc', { idShort: 'Nope' }),
    });
    expect(r.rejected).toEqual({ code: 'CONTAINMENT', parent: 'annrel', child: 'smc' });
  });

  it('Operation 밖으로 옮기면 opSlot이 사라지고, 되돌리면 복구된다', () => {
    const opId = Object.keys(doc.nodes).find((k) => doc.nodes[k]!.t === 'op')!;
    const child = doc.order[opId]![1]!; // out 슬롯
    const smId = Object.keys(doc.nodes).find((k) => doc.nodes[k]!.t === 'submodel')!;
    expect(doc.nodes[child]!.opSlot).toBe('out');

    const moved = apply(doc, { t: 'move', node: child, parent: smId, index: 0 });
    expect(moved.rejected).toBeUndefined();
    expect(moved.doc.nodes[child]!.opSlot).toBeUndefined();

    let back = moved.doc;
    for (const u of moved.undo) back = apply(back, u).doc;
    expect(back.nodes[child]!.opSlot).toBe('out');
  });

  it('출력 JSON 골든', () => {
    expect(canonicalize(env as never)).toMatchSnapshot();
  });
});
