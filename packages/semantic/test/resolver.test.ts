/**
 * 용어집 → ConceptDescription.
 *
 * P0 실측의 friction 2번 — "단위(kN·mm·MPa)를 담을 자리가 없다" — 이 실제로 닫혔는지
 * **사출성형기 픽스처**로 확인한다. 합성 문서가 아니라 우리가 모델링한 그 설비다.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  attachConceptDescriptions,
  buildConceptDescriptions,
  parse,
  serialize,
  verifyEnvironment,
} from '@aas/kernel';

import { SAMPLE_TERMS, termsResolver } from '../src/index.js';

const FIXTURE = fileURLToPath(
  new URL('../../kernel/test/fixtures/injection-molding-imm150.json', import.meta.url),
);

describe('사출성형기 모델에 단위를 실어 보낸다', () => {
  const env = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Record<string, unknown>;
  const doc = parse(env).doc;
  const result = buildConceptDescriptions(doc, termsResolver());

  it('사내 개념에 ConceptDescription이 붙는다', () => {
    const ids = result.conceptDescriptions.map((c) => (c as Record<string, unknown>)['id']);
    expect(ids).toContain('https://bnb.co.kr/ids/cd/ClampingForce/1/0');
    expect(ids).toContain('https://bnb.co.kr/ids/cd/CycleTime/1/0');
  });

  it('형체력에 kN이 실린다', () => {
    const cd = result.conceptDescriptions.find(
      (c) => (c as Record<string, unknown>)['id'] === 'https://bnb.co.kr/ids/cd/ClampingForce/1/0',
    ) as Record<string, unknown>;
    const spec = (cd['embeddedDataSpecifications'] as Array<Record<string, unknown>>)[0]!;
    const content = spec['dataSpecificationContent'] as Record<string, unknown>;
    expect(content['unit']).toBe('kN');
    expect(content['dataType']).toBe('REAL_MEASURE');
  });

  it('표준 개념은 아직 해석되지 않는다 — 정의를 우리가 갖고 있지 않다', () => {
    /* IEC CDD IRDI는 사전 프록시(P7)가 채운다. 그때까지 목록으로 남는 것이 맞다. */
    const cddUnresolved = result.unresolved.filter((i) => i.path.startsWith('0112/'));
    expect(cddUnresolved.length).toBeGreaterThan(0);
    expect(cddUnresolved[0]!.message.ko).toMatch(/정의|모릅니다/);
  });

  it('해석하지 못한 것이 조용히 사라지지 않는다', () => {
    expect(result.unresolved.every((i) => i.code === 'CD-001')).toBe(true);
    expect(result.unresolved.every((i) => i.path !== '')).toBe(true);
  });

  it('붙여서 내보낸 Environment가 규격 검증을 통과한다', () => {
    const out = attachConceptDescriptions(serialize(doc), result.conceptDescriptions);
    const r = verifyEnvironment(out);
    expect(r.deserializationError).toBeUndefined();
    expect(r.issues.map((i) => `${i.code} ${i.path}: ${i.message.en}`)).toEqual([]);
  });

  it('생성 결과가 결정적이다 — 두 번 만들어도 같다', () => {
    const again = buildConceptDescriptions(doc, termsResolver());
    expect(again.conceptDescriptions).toEqual(result.conceptDescriptions);
  });

  it('회사 용어집을 얹으면 그 값이 실린다', () => {
    const mine = {
      terms: [
        {
          term: '형체력',
          nameEn: 'Clamping force',
          semanticId: 'https://bnb.co.kr/ids/cd/ClampingForce/1/0',
          unit: 'tonf',
          dataType: 'REAL_MEASURE',
          definition: 'Clamping force expressed in metric tons force.',
          origin: 'local' as const,
          verified: 'none' as const,
        },
      ],
    };
    const merged = buildConceptDescriptions(doc, termsResolver({ terms: [...SAMPLE_TERMS.terms, ...mine.terms] }));
    const cd = merged.conceptDescriptions.find(
      (c) => (c as Record<string, unknown>)['id'] === 'https://bnb.co.kr/ids/cd/ClampingForce/1/0',
    ) as Record<string, unknown>;
    const content = (
      (cd['embeddedDataSpecifications'] as Array<Record<string, unknown>>)[0]!
        .dataSpecificationContent as Record<string, unknown>
    );
    expect(content['unit']).toBe('tonf');
  });
});
