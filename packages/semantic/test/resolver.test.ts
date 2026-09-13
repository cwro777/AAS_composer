/**
 * 용어집 → ConceptDescription.
 *
 * P0 실측의 friction 2번 — "단위(kN·mm·MPa)를 담을 자리가 없다" — 이 실제로 닫혔는지
 * **사출성형기 픽스처**로 확인한다. 합성 문서가 아니라 우리가 모델링한 그 설비다.
 */

import { readFileSync, readdirSync } from 'node:fs';
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

  /**
   * 표준 개념의 정의는 **IDTA가 발행한 문장 그대로**여야 한다.
   *
   * 샘플 용어집의 IEC CDD·eCl@ss 항목에는 원래 정의가 없었다(그래서 이 자리의 옛 테스트는
   * "해석되지 않는다"를 확인했다). 이제 IDTA 공식 Template JSON의 conceptDescriptions에서
   * 옮겨 적었다. 한 글자라도 다르면 원본과 다른 설명이 표준 식별자를 달고 나간다.
   */
  it('표준 개념은 IDTA 공식 JSON의 정의로만 해석된다 — 지어내지 않는다', () => {
    const official = new Map<string, string>();
    const dir = fileURLToPath(new URL('../../../docs/idta/', import.meta.url));
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) {
      const e = JSON.parse(readFileSync(`${dir}${f}`, 'utf8')) as {
        conceptDescriptions?: Array<{ id: string; embeddedDataSpecifications?: Array<{ dataSpecificationContent?: { definition?: Array<{ language: string; text: string }> } }> }>;
      };
      for (const cd of e.conceptDescriptions ?? []) {
        const def = cd.embeddedDataSpecifications?.[0]?.dataSpecificationContent?.definition?.find((t) =>
          t.language.toLowerCase().startsWith('en'),
        )?.text;
        if (def && !official.has(cd.id)) official.set(cd.id, def.trim());
      }
    }

    const standard = SAMPLE_TERMS.terms.filter((t) => /^(0112\/|0173-)/.test(t.semanticId) && t.definition);
    expect(standard.length).toBeGreaterThan(0);
    for (const t of standard) {
      expect(official.get(t.semanticId), t.semanticId).toBe(t.definition);
    }
  });

  it('해석하지 못한 것이 조용히 사라지지 않는다', () => {
    expect(result.unresolved.every((i) => i.code === 'CD-001' || i.code === 'CD-002')).toBe(true);
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
