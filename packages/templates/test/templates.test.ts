/**
 * P1 완료 기준 ③ — 템플릿 6종이 aas-core3.0 위반 0건.
 * 골든 스냅샷도 여기서 잡는다. 실패를 스냅샷 갱신으로 넘기지 말 것 (`pnpm golden:update`는 별도 명령).
 */

import { describe, expect, it } from 'vitest';

import {
  type Cmd,
  apply,
  canonicalize,
  emptyDoc,
  newNode,
  parse,
  serialize,
  validate,
  verifyEnvironment,
} from '@aas/kernel';
import {
  checkConformance,
  instantiate,
  listTemplates,
  unverifiedOf,
} from '../src/index.js';

function ids(prefix: string): () => string {
  let i = 0;
  return () => `${prefix}${++i}`;
}

function docWithShell(): { doc: ReturnType<typeof emptyDoc>; shell: string } {
  const shell = newNode('shell1', 'shell', {
    idShort: 'MX200_Line1_AAS',
    identifier: 'https://bnb.co.kr/ids/aas/mx200-line1-001',
    globalAssetId: 'https://bnb.co.kr/ids/asset/mx200-line1-001',
    assetKind: 'Instance',
  });
  const r = apply(emptyDoc(), { t: 'insert', parent: null, index: 0, node: shell });
  return { doc: r.doc, shell: 'shell1' };
}

describe('IDTA 템플릿', () => {
  const templates = listTemplates();

  it('9종이 등록되어 있다', () => {
    expect(templates.map((t) => t.id)).toEqual([
      'idta-02006',
      'idta-02003',
      'idta-02004',
      'idta-02008',
      'idta-02023',
      'local-operational',
      'idta-02011',
      'idta-02017-mqtt',
      'idta-02017-opcua',
    ]);
  });

  for (const def of templates) {
    describe(`${def.name} (${def.idtaNumber} v${def.version})`, () => {
      const { doc: base, shell } = docWithShell();
      const cmd: Cmd = instantiate(def, {
        newId: ids('t'),
        namespace: 'https://bnb.co.kr/ids',
        assetSlug: 'mx200-line1-001',
        shell,
      });
      const applied = apply(base, cmd);

      it('삽입이 거부되지 않는다', () => {
        expect(applied.rejected).toBeUndefined();
      });

      it('규격 검증 위반 0건 (aas-core3.0)', () => {
        const env = serialize(applied.doc);
        const r = verifyEnvironment(env);
        expect(r.deserializationError).toBeUndefined();
        expect(r.issues.map((i) => `${i.code} ${i.path}: ${i.message.en}`)).toEqual([]);
      });

      it('사내 정책(L2) 오류 0건', () => {
        const errors = validate(applied.doc, { iriPrefix: 'https://bnb.co.kr/ids' }).filter(
          (i) => i.severity === 'error',
        );
        expect(errors.map((e) => `${e.code} ${e.path}`)).toEqual([]);
      });

      it('자기 템플릿에 대해 T-001·T-002 위반 0건', () => {
        const smId = Object.keys(applied.doc.nodes).find(
          (id) => applied.doc.nodes[id]!.t === 'submodel',
        )!;
        expect(checkConformance(applied.doc, smId)).toEqual([]);
      });

      it('무손실 왕복', () => {
        const env = serialize(applied.doc);
        const again = serialize(parse(env).doc);
        expect(canonicalize(again as never)).toEqual(canonicalize(env as never));
      });

      it('출력 JSON 골든', () => {
        expect(canonicalize(serialize(applied.doc) as never)).toMatchSnapshot();
      });
    });
  }

  it('미확인 semanticId가 목록으로 드러난다', () => {
    const report = Object.fromEntries(
      templates.map((d) => [d.id, unverifiedOf(d).map((u) => u.path)]),
    );
    /* 확인하지 못한 값을 조용히 넘기지 않는다 — 목록 자체를 골든으로 잡는다. */
    expect(report).toMatchSnapshot();
  });
});

describe('AASd-120 — List 직속 자식은 idShort를 출력하지 않는다', () => {
  it('Handover Documentation의 Document에 idShort가 없다', () => {
    const { doc: base, shell } = docWithShell();
    const def = listTemplates().find((d) => d.id === 'idta-02004')!;
    const applied = apply(base, instantiate(def, { newId: ids('h'), shell }));
    const env = serialize(applied.doc) as Record<string, unknown>;
    const submodels = env['submodels'] as Array<Record<string, unknown>>;
    const documents = (submodels[0]!['submodelElements'] as Array<Record<string, unknown>>)[0]!;
    const first = (documents['value'] as Array<Record<string, unknown>>)[0]!;
    expect(documents['idShort']).toBe('Documents');
    expect(first['idShort']).toBeUndefined();
    expect(first['modelType']).toBe('SubmodelElementCollection');
  });
});
