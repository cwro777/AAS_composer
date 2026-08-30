/**
 * 용어집을 커널의 개념 해석기로 잇는다.
 *
 * 커널은 용어집이 무엇인지 모르고, 용어집은 커널을 부르지 않는다. 이 파일이 둘 사이의
 * 얇은 어댑터다 — 나중에 IEC CDD 프록시가 붙으면 같은 인터페이스로 갈아 끼운다.
 */

import type { ConceptInfo, ConceptResolver } from '@aas/kernel';

import { SAMPLE_TERMS, type TermBook, termFor } from './terms.js';

export function conceptFromTerm(term: {
  term: string;
  nameEn?: string;
  unit?: string;
  dataType?: string;
  definition?: string;
}): ConceptInfo {
  const preferredName = [
    ...(term.nameEn ? [{ language: 'en', text: term.nameEn }] : []),
    { language: 'ko', text: term.term },
  ];
  return {
    preferredName,
    ...(term.definition ? { definition: [{ language: 'en', text: term.definition }] } : {}),
    ...(term.unit ? { unit: term.unit } : {}),
    ...(term.dataType ? { dataType: term.dataType } : {}),
  };
}

/**
 * 용어집 기반 해석기.
 *
 * 표준 개념(IEC CDD·eCl@ss)은 **정의를 우리가 갖고 있지 않다.** 사전에서 와야 하고,
 * 그것은 P7의 사전 프록시가 채운다. 그때까지 그런 개념은 해석되지 않고 목록에 남는다 —
 * 정의를 지어내는 것보다 낫다.
 */
export function termsResolver(book: TermBook = SAMPLE_TERMS): ConceptResolver {
  return {
    resolve(semanticId: string): ConceptInfo | undefined {
      const t = termFor(semanticId, book);
      return t ? conceptFromTerm(t) : undefined;
    },
  };
}
