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

/**
 * 사내 정의 템플릿의 개념은 사내 네임스페이스를 따라간다.
 * Operational Data가 bnb.co.kr을 박아 두어, 네임스페이스를 cw1.co.kr로 바꾼 뒤에도
 * 그 서브모델만 옛 도메인으로 개념을 발행했다.
 */
describe('{ns} — 템플릿 개념이 사내 네임스페이스를 따른다', () => {
  const def = getTemplate('local-operational')!;
  const make = (ns: string): { doc: ReturnType<typeof emptyDoc>; sm: NodeId } => {
    const doc = apply(emptyDoc(), instantiate(def, { newId: ids('o'), namespace: ns, assetSlug: 'mx200', shell: null })).doc;
    return { doc, sm: Object.keys(doc.nodes).find((id) => doc.nodes[id]!.t === 'submodel')! };
  };

  it('삽입하면 네임스페이스로 치환된다 — 자리표시가 문서에 남지 않는다', () => {
    const cw1 = make('https://cw1.co.kr/ids');
    expect(cw1.doc.nodes[cw1.sm]!.semanticId).toBe('https://cw1.co.kr/ids/cd/OperationalData/1/0');
    const other = make('https://acme.example/ids/');
    expect(other.doc.nodes[other.sm]!.semanticId).toBe('https://acme.example/ids/cd/OperationalData/1/0');
    expect(JSON.stringify(serialize(cw1.doc))).not.toContain('{ns}');
  });

  it('어느 네임스페이스로 만든 모델이든 적합하다 — 네임스페이스를 바꿔도 경고로 뒤덮이지 않는다', () => {
    for (const ns of ['https://cw1.co.kr/ids', 'https://bnb.co.kr/ids']) {
      const { doc, sm } = make(ns);
      expect(checkConformance(doc, sm)).toEqual([]);
    }
  });

  it('남의 네임스페이스로 발행한 옛 값은 여전히 T-003이다', () => {
    const { doc, sm } = make('https://cw1.co.kr/ids');
    const old = apply(doc, { t: 'set', node: sm, path: 'semanticId', value: 'https://admin-shell.io/idta/OperationalData/1/0' }).doc;
    const issues = checkConformance(old, sm);
    expect(issues.map((i) => i.code)).toEqual(['T-003']);
    /* 메시지는 자리표시가 아니라 이 모델의 네임스페이스로 보인다 */
    expect(issues[0]!.message.ko).toContain('https://cw1.co.kr/ids/cd/OperationalData/1/0');
  });

  it('되돌리기는 서브모델 식별자에서 네임스페이스를 읽어 그 값으로 되돌린다', () => {
    const { doc, sm } = make('https://cw1.co.kr/ids');
    const old = apply(doc, { t: 'set', node: sm, path: 'semanticId', value: 'https://admin-shell.io/idta/OperationalData/1/0' }).doc;
    const fix = conformanceFix(old, checkConformance(old, sm)[0]!, ids('f'))!;
    const fixed = apply(old, { t: 'batch', label: fix.label.ko, cmds: fix.cmds }).doc;
    expect(fixed.nodes[sm]!.semanticId).toBe('https://cw1.co.kr/ids/cd/OperationalData/1/0');
    expect(checkConformance(fixed, sm)).toEqual([]);
  });

  it('식별자에서 네임스페이스를 못 읽으면 되돌리지 않는다 — 추측해서 발행하지 않는다', () => {
    const { doc, sm } = make('https://cw1.co.kr/ids');
    let old = apply(doc, { t: 'set', node: sm, path: 'semanticId', value: 'urn:x:operational' }).doc;
    old = apply(old, { t: 'set', node: sm, path: 'identifier', value: 'urn:uuid:1234' }).doc;
    const issue = checkConformance(old, sm)[0]!;
    expect(issue.message.ko).toContain('<사내 네임스페이스>');
    expect(conformanceFix(old, issue, ids('f'))).toBeNull();
  });
});
