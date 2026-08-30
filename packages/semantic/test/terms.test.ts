/**
 * 용어 매핑 — 샘플의 형식이 지켜지는지, 검색이 실제로 되는지.
 *
 * 값 자체는 회사가 채운다. 여기서 지키는 것은 **형식과 출처 표기**다 —
 * 표준에서 온 값과 우리가 발급한 값이 섞이면 나중에 구분할 수 없다.
 */

import { describe, expect, it } from 'vitest';

import { SAMPLE_TERMS, mergeBooks, parseSemanticId, searchTerms, termFor } from '../src/index.js';

describe('샘플 용어집', () => {
  it('20개 이상 들어 있다', () => {
    expect(SAMPLE_TERMS.terms.length).toBeGreaterThanOrEqual(20);
  });

  it('모든 semanticId가 해석된다 — 오타가 없다', () => {
    const bad = SAMPLE_TERMS.terms
      .map((t) => ({ term: t.term, ref: parseSemanticId(t.semanticId) }))
      .filter((x) => x.ref.scheme === 'unknown');
    expect(bad.map((b) => b.term)).toEqual([]);
  });

  it('표준에서 온 값은 출처가 적혀 있다', () => {
    const idta = SAMPLE_TERMS.terms.filter((t) => t.origin === 'idta');
    expect(idta.length).toBeGreaterThan(0);
    for (const t of idta) {
      expect(t.verified).toBe('spec');
      expect(t.provenance).toMatch(/IDTA/);
    }
  });

  it('자체 발급 값은 우리 도메인 IRI이고 verified가 none이다', () => {
    const local = SAMPLE_TERMS.terms.filter((t) => t.origin === 'local');
    expect(local.length).toBeGreaterThan(0);
    for (const t of local) {
      expect(parseSemanticId(t.semanticId).scheme).toBe('iri');
      expect(t.semanticId).toContain('/ids/cd/');
      /* 표준에서 확인한 것이 아니므로 spec이라고 말하지 않는다 */
      expect(t.verified).toBe('none');
    }
  });

  it('측정값에는 단위가 있다 — 단위 없는 수치가 나가면 해석할 수 없다', () => {
    const measures = SAMPLE_TERMS.terms.filter((t) => t.dataType === 'REAL_MEASURE');
    expect(measures.length).toBeGreaterThan(0);
    expect(measures.filter((t) => !t.unit).map((t) => t.term)).toEqual([]);
  });

  it('semanticId가 겹치지 않는다', () => {
    const ids = SAMPLE_TERMS.terms.map((t) => t.semanticId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('검색', () => {
  it('한글 용어로 찾는다', () => {
    expect(searchTerms('형체력')[0]?.nameEn).toBe('Clamping force');
  });

  it('별칭으로도 찾는다', () => {
    expect(searchTerms('클램핑포스')[0]?.term).toBe('형체력');
    expect(searchTerms('실린더온도')[0]?.term).toBe('배럴온도');
  });

  it('영문과 식별자로도 찾는다', () => {
    expect(searchTerms('Serial number')[0]?.term).toBe('시리얼번호');
    expect(searchTerms('ABA565')[0]?.term).toBe('제조사명');
  });

  it('부분 일치로 여러 개가 나온다', () => {
    expect(searchTerms('온도').length).toBeGreaterThan(0);
  });

  it('빈 질의는 아무것도 돌려주지 않는다', () => {
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('회사 용어집 얹기', () => {
  it('같은 semanticId면 뒤엣것이 이긴다', () => {
    const mine = {
      terms: [
        {
          term: '우리형체력',
          semanticId: 'https://bnb.co.kr/ids/cd/ClampingForce/1/0',
          unit: 'tonf',
          dataType: 'REAL_MEASURE',
          origin: 'local' as const,
          verified: 'none' as const,
        },
      ],
    };
    const merged = mergeBooks(SAMPLE_TERMS, mine);
    expect(termFor('https://bnb.co.kr/ids/cd/ClampingForce/1/0', merged)?.unit).toBe('tonf');
    /* 나머지는 그대로 */
    expect(termFor('0112/2///61987#ABA565#009', merged)?.term).toBe('제조사명');
  });
});
