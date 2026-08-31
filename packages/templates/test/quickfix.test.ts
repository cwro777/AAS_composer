/**
 * 퀵픽스 — 지적만 하는 검증은 결국 무시된다(계획서 04장).
 *
 * T-001(필수 요소 누락)은 템플릿이 답을 알고 있다. 눌러서 채울 수 있어야 한다.
 * 채워 넣은 요소는 `instantiate`가 넣는 것과 **같아야** 한다 — 코드를 공유하는 이유다.
 */

import { describe, expect, it } from 'vitest';

import { type NodeId, apply, childrenOf, emptyDoc, newNode, serialize, verifyEnvironment } from '@aas/kernel';

import { checkConformance, conformanceFix, getTemplate, instantiate } from '../src/index.js';

function ids(prefix: string): () => NodeId {
  let i = 0;
  return () => `${prefix}${++i}`;
}

/** 셸 하나에 Nameplate를 그대로 넣은 문서. 같은 id 순서를 쓰므로 두 번 불러도 같다 */
function withNameplate(): { doc: ReturnType<typeof emptyDoc>; sm: NodeId } {
  const def = getTemplate('idta-02006')!;
  let doc = emptyDoc();
  doc = apply(doc, {
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode('shell', 'shell', {
      idShort: 'A_AAS',
      identifier: 'https://bnb.co.kr/ids/aas/a',
      globalAssetId: 'https://bnb.co.kr/ids/asset/a',
    }),
  }).doc;
  doc = apply(doc, instantiate(def, { newId: ids('q'), namespace: 'https://bnb.co.kr/ids', shell: 'shell' })).doc;

  const sm = Object.keys(doc.nodes).find((id) => doc.nodes[id]!.t === 'submodel')!;
  return { doc, sm };
}

/** Nameplate를 넣고 필수 요소 하나를 지운 문서 */
function withMissingRequired(): { doc: ReturnType<typeof emptyDoc>; sm: NodeId; removed: string } {
  const { doc, sm } = withNameplate();
  /* 필수(1..1)인 OrderCodeOfManufacturer를 지운다 */
  const victim = childrenOf(doc, sm).find((c) => doc.nodes[c]!.idShort === 'OrderCodeOfManufacturer')!;
  return { doc: apply(doc, { t: 'remove', node: victim }).doc, sm, removed: 'OrderCodeOfManufacturer' };
}

describe('T-001 퀵픽스', () => {
  it('필수 요소를 지우면 T-001이 뜬다', () => {
    const { doc, sm, removed } = withMissingRequired();
    const issues = checkConformance(doc, sm);
    expect(issues.map((i) => i.code)).toEqual(['T-001']);
    expect(issues[0]!.path).toContain(removed);
  });

  it('퀵픽스를 적용하면 T-001이 사라진다', () => {
    const { doc, sm } = withMissingRequired();
    const issue = checkConformance(doc, sm)[0]!;
    const fix = conformanceFix(doc, issue, ids('f'))!;
    expect(fix.label.ko).toContain('OrderCodeOfManufacturer');

    const fixed = apply(doc, { t: 'batch', label: 'quickfix', cmds: fix.cmds });
    expect(fixed.rejected).toBeUndefined();
    expect(checkConformance(fixed.doc, sm)).toEqual([]);
  });

  it('채운 요소가 템플릿이 넣는 것과 같다', () => {
    const { doc, sm, removed } = withMissingRequired();
    const issue = checkConformance(doc, sm)[0]!;
    const fixed = apply(doc, {
      t: 'batch',
      label: 'quickfix',
      cmds: conformanceFix(doc, issue, ids('f'))!.cmds,
    }).doc;

    /* 원본(템플릿 그대로)과 비교 — id만 다르고 내용은 같아야 한다 */
    const { doc: fresh } = withNameplate();

    const pick = (d: typeof fresh): unknown => {
      const smId = Object.keys(d.nodes).find((id) => d.nodes[id]!.t === 'submodel')!;
      const n = childrenOf(d, smId)
        .map((c) => d.nodes[c]!)
        .find((c) => c.idShort === removed)!;
      const { id: _id, origin: _origin, ...rest } = n as unknown as Record<string, unknown>;
      return rest;
    };
    expect(pick(fixed)).toEqual(pick(fresh));
  });

  it('제자리에 들어간다 — 목록 끝에 몰리지 않는다', () => {
    const { doc, sm } = withMissingRequired();
    const issue = checkConformance(doc, sm)[0]!;
    const fixed = apply(doc, {
      t: 'batch',
      label: 'quickfix',
      cmds: conformanceFix(doc, issue, ids('f'))!.cmds,
    }).doc;

    const names = childrenOf(fixed, sm).map((c) => fixed.nodes[c]!.idShort);
    /* 템플릿 순서상 ManufacturerProductType 다음, ProductArticleNumber… 앞 */
    const i = names.indexOf('OrderCodeOfManufacturer');
    expect(i).toBeGreaterThan(names.indexOf('ManufacturerProductType'));
    expect(i).toBeLessThan(names.indexOf('ProductArticleNumberOfManufacturer'));
  });

  it('고친 문서가 규격 검증을 통과한다', () => {
    const { doc, sm } = withMissingRequired();
    const issue = checkConformance(doc, sm)[0]!;
    const fixed = apply(doc, {
      t: 'batch',
      label: 'quickfix',
      cmds: conformanceFix(doc, issue, ids('f'))!.cmds,
    }).doc;
    const r = verifyEnvironment(serialize(fixed));
    expect(r.deserializationError).toBeUndefined();
    expect(r.issues.map((i) => i.message.en)).toEqual([]);
  });

  it('T-002에는 퀵픽스를 만들지 않는다 — 어느 쪽이 옳은지 우리가 모른다', () => {
    const { doc, sm } = withMissingRequired();
    const issue = { ...checkConformance(doc, sm)[0]!, code: 'T-002' as const };
    expect(conformanceFix(doc, issue, ids('f'))).toBeNull();
  });
});

describe('T-003 퀵픽스', () => {
  /* Nameplate 2.0의 서브모델 IRI. 3.0에서 zvei → idta로 바뀌었다 */
  const OLD = 'https://admin-shell.io/zvei/nameplate/2/0/Nameplate';
  const NEW = 'https://admin-shell.io/idta/nameplate/3/0/Nameplate';

  /** 서브모델 semanticId만 옛 값으로 바꾼 문서 — 자식은 3.0 그대로다 */
  function withDeviantSemanticId(): { doc: ReturnType<typeof emptyDoc>; sm: NodeId } {
    const { doc, sm } = withNameplate();
    return { doc: apply(doc, { t: 'set', node: sm, path: 'semanticId', value: OLD }).doc, sm };
  }

  it('서브모델 semanticId를 바꾸면 T-003이 뜬다', () => {
    const { doc, sm } = withDeviantSemanticId();
    expect(checkConformance(doc, sm).map((i) => i.code)).toEqual(['T-003']);
  });

  it('메시지가 기대값을 담는다 — 무엇으로 바꿔야 하는지 화면에서 보여야 한다', () => {
    const { doc, sm } = withDeviantSemanticId();
    const issue = checkConformance(doc, sm)[0]!;
    expect(issue.message.ko).toContain(NEW);
    expect(issue.message.en).toContain(NEW);
  });

  it('퀵픽스를 적용하면 T-003이 사라진다', () => {
    const { doc, sm } = withDeviantSemanticId();
    const issue = checkConformance(doc, sm)[0]!;
    const fix = conformanceFix(doc, issue, ids('f'))!;
    expect(fix.label.ko).toBe('템플릿 값으로 되돌리기');

    const fixed = apply(doc, { t: 'batch', label: 'quickfix', cmds: fix.cmds });
    expect(fixed.rejected).toBeUndefined();
    expect(fixed.doc.nodes[sm]!.semanticId).toBe(NEW);
    expect(checkConformance(fixed.doc, sm)).toEqual([]);
  });

  it('자식은 건드리지 않는다 — 개정 이관은 planMigration의 몫이다', () => {
    const { doc, sm } = withDeviantSemanticId();
    const issue = checkConformance(doc, sm)[0]!;
    const fixed = apply(doc, {
      t: 'batch',
      label: 'quickfix',
      cmds: conformanceFix(doc, issue, ids('f'))!.cmds,
    }).doc;

    const semantics = (d: typeof doc): (string | undefined)[] =>
      childrenOf(d, sm).map((c) => d.nodes[c]!.semanticId);
    expect(semantics(fixed)).toEqual(semantics(doc));
  });

  it('이미 템플릿 값이면 고칠 것이 없다', () => {
    const { doc, sm } = withNameplate();
    const issue = { ...checkConformance(withDeviantSemanticId().doc, sm)[0]!, node: sm };
    expect(conformanceFix(doc, issue, ids('f'))).toBeNull();
  });
});
