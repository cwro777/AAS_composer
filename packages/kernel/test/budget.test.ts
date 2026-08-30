/**
 * 성능 예산 — 계획서 08장.
 *
 * 에디터가 느려지는 지점은 대부분 커널이다. 문서를 열 때(parse) · 저장할 때(serialize) ·
 * 타이핑할 때(validate + 규격 검증)가 전부 여기를 지난다.
 *
 * 임계값은 관측값의 여유 배수로 잡았다. **회귀를 잡는 것이 목적이지 기록 경신이 아니다** —
 * 예산을 넘으면 기능을 더 얹지 않는다는 규칙(계획서 08장)의 근거로 쓴다.
 * 실패하면 임계값을 올리지 말고 무엇이 느려졌는지 먼저 본다.
 */

import { describe, expect, it } from 'vitest';

import {
  type AasDoc,
  apply,
  emptyDoc,
  newNode,
  parse,
  pathIndex,
  serialize,
  validate,
  verifyEnvironment,
} from '../src/index.js';

/** 컬렉션 40개 × 속성 50개 = 2,000요소 + 서브모델 + 셸 */
function bigDoc(): AasDoc {
  let doc = emptyDoc();
  let n = 0;
  const id = (): string => `b${++n}`;

  const shell = id();
  doc = apply(doc, {
    t: 'insert',
    parent: null,
    index: 0,
    node: newNode(shell, 'shell', {
      idShort: 'Big_AAS',
      identifier: 'https://bnb.co.kr/ids/aas/big',
      globalAssetId: 'https://bnb.co.kr/ids/asset/big',
    }),
  }).doc;

  const sm = id();
  doc = apply(doc, {
    t: 'insert',
    parent: shell,
    index: 0,
    node: newNode(sm, 'submodel', {
      idShort: 'BigSubmodel',
      identifier: 'https://bnb.co.kr/ids/sm/big',
      semanticId: 'https://bnb.co.kr/ids/cd/Big/1/0',
    }),
  }).doc;

  for (let g = 0; g < 40; g++) {
    const group = id();
    doc = apply(doc, {
      t: 'insert',
      parent: sm,
      index: Number.MAX_SAFE_INTEGER,
      node: newNode(group, 'smc', {
        idShort: `Group${g}`,
        semanticId: 'https://bnb.co.kr/ids/cd/Group/1/0',
      }),
    }).doc;
    for (let p = 0; p < 50; p++) {
      doc = apply(doc, {
        t: 'insert',
        parent: group,
        index: Number.MAX_SAFE_INTEGER,
        node: newNode(id(), 'prop', {
          idShort: `Signal${p}`,
          valueType: 'xs:double',
          value: String(p * 1.5),
          semanticId: 'https://bnb.co.kr/ids/cd/Signal/1/0',
        }),
      }).doc;
    }
  }
  return doc;
}

function ms(label: string, fn: () => unknown): number {
  const t0 = performance.now();
  fn();
  const dt = performance.now() - t0;
  console.log(`  ${label}: ${dt.toFixed(1)}ms`);
  return dt;
}

describe('성능 예산 (2,042노드)', () => {
  const doc = bigDoc();

  it('노드 수가 예산 규모다', () => {
    expect(Object.keys(doc.nodes).length).toBeGreaterThanOrEqual(2000);
  });

  it('직렬화 · 파싱 · 색인이 문서 열기 예산(1.5s) 안에 든다', () => {
    const env = serialize(doc);
    const total =
      ms('serialize', () => serialize(doc)) +
      ms('parse', () => parse(env)) +
      ms('pathIndex', () => pathIndex(doc));
    expect(total).toBeLessThan(1500);
  });

  it('사내 정책 검증이 타이핑을 막지 않는다', () => {
    /* 계획서의 증분 검증 예산은 30ms다. 지금은 전체 재검증이라 그보다 여유를 준다 —
       증분 검증(P5)이 붙으면 이 임계값을 30ms로 조인다. */
    const dt = ms('validate(L2)', () => validate(doc, { iriPrefix: 'https://bnb.co.kr/ids' }));
    expect(dt).toBeLessThan(300);
  });

  it('규격 검증(aas-core3.0)이 1초 안에 끝난다', () => {
    const env = serialize(doc);
    const dt = ms('verifyEnvironment(L1)', () => verifyEnvironment(env));
    expect(dt).toBeLessThan(1000);
  });
});
