/**
 * P0 실측 — 사출성형기 1대.
 *
 * 템플릿만으로 실제 설비가 표현되는지 확인하고, 그 결과를 커널 픽스처로 남긴다.
 * 픽스처가 생기면 kernel의 왕복·멱등 테스트가 이 모델을 자동으로 검사한다.
 *
 * 픽스처 갱신: UPDATE_FIXTURE=1 pnpm test --filter @aas/templates
 */

import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { canonicalize, parse, serialize, validate, verifyEnvironment } from '@aas/kernel';

import { checkAllConformance } from '../src/index.js';
import { buildInjectionMoldingMachine } from './build-imm.js';

const FIXTURE = fileURLToPath(
  new URL('../../kernel/test/fixtures/injection-molding-imm150.json', import.meta.url),
);

describe('사출성형기 IM-150E 실측', () => {
  const { doc, shell, friction } = buildInjectionMoldingMachine();

  it('셸 하나에 서브모델 5종이 달린다', () => {
    const kinds = (doc.order[shell] ?? []).map((c) => doc.nodes[c]!.idShort);
    expect(kinds).toEqual([
      'Nameplate',
      'TechnicalData',
      'HierarchicalStructures',
      'AssetInterfacesDescription',
      'OperationalData',
    ]);
  });

  it('규격 검증 위반 0건 (aas-core3.0)', () => {
    const r = verifyEnvironment(serialize(doc));
    expect(r.deserializationError).toBeUndefined();
    expect(r.issues.map((i) => `${i.code} ${i.path}: ${i.message.en}`)).toEqual([]);
  });

  it('사내 정책(L2) 오류 0건', () => {
    const errors = validate(doc, { iriPrefix: 'https://bnb.co.kr/ids' }).filter(
      (i) => i.severity === 'error',
    );
    expect(errors.map((e) => `${e.code} ${e.path}`)).toEqual([]);
  });

  it('템플릿 적합성 위반 0건 — BoM 노드 이름을 바꿔도 T-001이 뜨지 않는다', () => {
    expect(checkAllConformance(doc)).toEqual([]);
  });

  it('무손실 왕복', () => {
    const env = serialize(doc);
    const again = serialize(parse(env).doc);
    expect(canonicalize(again as never)).toEqual(canonicalize(env as never));
  });

  it('출력 JSON 골든', () => {
    expect(canonicalize(serialize(doc) as never)).toMatchSnapshot();
  });

  it('실측에서 걸린 지점이 기록된다', () => {
    /* 이 목록이 P4·P5·P6의 근거다. 조용히 사라지지 않도록 골든으로 잡는다. */
    expect(friction).toMatchSnapshot();
  });

  it('커널 픽스처와 일치한다', () => {
    const text = `${JSON.stringify(serialize(doc), null, 2)}\n`;
    if (process.env['UPDATE_FIXTURE']) writeFileSync(FIXTURE, text, 'utf8');
    expect(readFileSync(FIXTURE, 'utf8')).toBe(text);
  });
});
