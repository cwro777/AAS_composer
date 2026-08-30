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

/** Nameplate를 넣고 필수 요소 하나를 지운 문서 */
function withMissingRequired(): { doc: ReturnType<typeof emptyDoc>; sm: NodeId; removed: string } {
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
  /* 필수(1..1)인 OrderCodeOfManufacturer를 지운다 */
  const victim = childrenOf(doc, sm).find((c) => doc.nodes[c]!.idShort === 'OrderCodeOfManufacturer')!;
  doc = apply(doc, { t: 'remove', node: victim }).doc;
  return { doc, sm, removed: 'OrderCodeOfManufacturer' };
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
    const def = getTemplate('idta-02006')!;
    let fresh = emptyDoc();
    fresh = apply(fresh, {
      t: 'insert',
      parent: null,
      index: 0,
      node: newNode('shell', 'shell', {
        idShort: 'A_AAS',
        identifier: 'https://bnb.co.kr/ids/aas/a',
        globalAssetId: 'https://bnb.co.kr/ids/asset/a',
      }),
    }).doc;
    fresh = apply(fresh, instantiate(def, { newId: ids('q'), namespace: 'https://bnb.co.kr/ids', shell: 'shell' })).doc;

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

  it('T-002·T-003에는 퀵픽스를 만들지 않는다', () => {
    const { doc, sm } = withMissingRequired();
    const issue = { ...checkConformance(doc, sm)[0]!, code: 'T-002' as const };
    expect(conformanceFix(doc, issue, ids('f'))).toBeNull();
  });
});
