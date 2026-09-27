/**
 * 서버가 내보낼 Environment — 개념 설명(ConceptDescription)까지.
 *
 * 브라우저의 사내 용어집은 서버에 오지 않는다. 그래서 서버가 개념을 아는 길은 둘뿐이다:
 *   1. **사전 캐시** — 에디터가 모델을 보낼 때 함께 넣거나(`/dictionary/import`),
 *      `dict-seed`로 채운 것
 *   2. **샘플 용어집** — 파일로 따라다니는 것
 * 둘 다 모르면 개념은 만들어지지 않고 `unresolved`로 남는다. **지어내지 않는다.**
 *
 * 불러온 파일이 싣고 온 개념(`doc.raw.conceptDescriptions`)은 `attachConceptDescriptions`가
 * 합쳐 준다 — 같은 id면 새로 만든 쪽이 이기고, 모르는 id는 그대로 나간다.
 *
 * 에디터의 `buildExport(doc, book)`와 같은 일을 서버 쪽 책으로 하는 것이다. 한쪽만 고치면
 * 화면에서는 실렸는데 게시된 것에는 개념이 빠진다.
 */

import {
  type AasDoc,
  type Environment,
  type Issue,
  type Json,
  attachConceptDescriptions,
  buildConceptDescriptions,
  serialize,
  usedSemanticIds,
} from '@aas/kernel';
import { SAMPLE_TERMS, type TermBook, type TermEntry, conceptFromTerm, mergeBooks, termsResolver } from '@aas/semantic';

import type { Dictionary } from './dict/service.js';

/** 사전이 답한 것을 용어집 항목으로 — 영문 이름과 정의가 둘 다 있어야 개념이 만들어진다 */
function bookFromDictionary(entries: Array<{ irdi: string; nameEn?: string | null; nameKo?: string | null; definition?: string | null; unit?: string | null; dataType?: string | null }>): TermBook {
  const terms: TermEntry[] = [];
  for (const e of entries) {
    if (!e.nameEn?.trim() || !e.definition?.trim()) continue;
    terms.push({
      term: e.nameKo?.trim() || e.nameEn.trim(),
      nameEn: e.nameEn.trim(),
      semanticId: e.irdi,
      definition: e.definition.trim(),
      ...(e.unit ? { unit: e.unit } : {}),
      ...(e.dataType ? { dataType: e.dataType } : {}),
      origin: 'idta',
      verified: 'dict',
    });
  }
  return { terms };
}

export interface ServerExport {
  env: Environment;
  /** 함께 실린 개념 수 */
  concepts: number;
  /** 해석하지 못한 것 — 조용히 빠지지 않는다 */
  unresolved: Issue[];
}

/**
 * 문서에 쓰인 semanticId를 사전에 묻고, 답한 것으로 개념을 만들어 Environment에 붙인다.
 * 샘플보다 사전이 뒤에 온다 — 사전이 이긴다(에디터의 책 순서와 같다).
 */
export async function buildServerExport(doc: AasDoc, dict: Dictionary): Promise<ServerExport> {
  const ids = [...usedSemanticIds(doc).keys()];
  const answered: Array<Parameters<typeof bookFromDictionary>[0][number]> = [];
  for (const id of ids) {
    const r = await dict.lookup(id);
    if (r.entry) answered.push(r.entry);
  }

  const book = mergeBooks(SAMPLE_TERMS, bookFromDictionary(answered));
  const cd = buildConceptDescriptions(doc, termsResolver(book));
  const env = attachConceptDescriptions(serialize(doc), cd.conceptDescriptions);
  const list = env['conceptDescriptions'];
  return {
    env,
    concepts: Array.isArray(list) ? (list as Json[]).length : 0,
    unresolved: cd.unresolved,
  };
}

export { conceptFromTerm };
