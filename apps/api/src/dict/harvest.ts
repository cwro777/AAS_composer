/**
 * 사전 씨앗 만들기.
 *
 * 두 곳에서 긁는다. **둘 다 실재하는 자료다** — 지어낸 값이 사전에 들어가면
 * 그 뒤의 모든 모델이 오염된다.
 *
 *  1. IDTA 공식 Template JSON의 `conceptDescriptions`
 *     — DataSpecificationIec61360에 단위·자료형·정의가 들어 있다.
 *  2. 사내 용어집 (@aas/semantic의 terms)
 *     — 한글 용어와 자체 IRI 개념.
 */

import type { Environment, Json } from '@aas/kernel';
import { type TermBook, parseSemanticId } from '@aas/semantic';

import type { DictEntry, TermLink } from './store.js';

function obj(v: Json | undefined): Record<string, Json> | null {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, Json>) : null;
}

function langText(v: Json | undefined, lang: string): string | null {
  if (!Array.isArray(v)) return null;
  for (const item of v) {
    const o = obj(item);
    if (!o) continue;
    const l = typeof o['language'] === 'string' ? o['language'].toLowerCase() : '';
    if (l.startsWith(lang) && typeof o['text'] === 'string' && o['text'].trim() !== '') return o['text'];
  }
  return null;
}

function str(v: Json | undefined): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}

/** Environment의 conceptDescriptions를 사전 항목으로 */
export function entriesFromEnvironment(env: Environment, origin: string): DictEntry[] {
  const list = env['conceptDescriptions'];
  if (!Array.isArray(list)) return [];

  const out: DictEntry[] = [];
  for (const raw of list) {
    const cd = obj(raw);
    const irdi = cd ? str(cd['id']) : null;
    if (!cd || !irdi) continue;

    let content: Record<string, Json> | null = null;
    const specs = cd['embeddedDataSpecifications'];
    if (Array.isArray(specs)) {
      for (const s of specs) {
        const so = obj(s);
        const c = so ? obj(so['dataSpecificationContent']) : null;
        if (c && c['modelType'] === 'DataSpecificationIec61360') {
          content = c;
          break;
        }
      }
    }

    const ref = parseSemanticId(irdi);
    const entry: DictEntry = {
      irdi,
      scheme: ref.scheme,
      status: 'unknown',
      origin,
      ...(ref.source ? { source: ref.source } : {}),
      ...(content
        ? {
            nameEn: langText(content['preferredName'], 'en') ?? str(cd['idShort']),
            nameKo: langText(content['preferredName'], 'ko'),
            definition: langText(content['definition'], 'en'),
            unit: str(content['unit']),
            dataType: str(content['dataType']),
          }
        : { nameEn: str(cd['idShort']) }),
    };
    /* 아무 정보도 없으면 넣지 않는다 — 빈 껍데기가 캐시를 채우면 조회가 거짓말을 한다 */
    if (entry.nameEn || entry.nameKo || entry.unit || entry.dataType || entry.definition) {
      out.push(entry);
    }
  }
  return out;
}

/** 사내 용어집을 사전 항목 + 용어 링크로 */
export function entriesFromTermBook(book: TermBook): { entries: DictEntry[]; terms: TermLink[] } {
  const entries: DictEntry[] = [];
  const terms: TermLink[] = [];

  for (const t of book.terms) {
    const ref = parseSemanticId(t.semanticId);
    entries.push({
      irdi: t.semanticId,
      scheme: ref.scheme,
      status: 'unknown',
      origin: t.origin === 'idta' ? 'terms:idta' : 'terms:local',
      ...(ref.source ? { source: ref.source } : {}),
      ...(t.nameEn ? { nameEn: t.nameEn } : {}),
      nameKo: t.term,
      ...(t.definition ? { definition: t.definition } : {}),
      ...(t.unit ? { unit: t.unit } : {}),
      ...(t.dataType ? { dataType: t.dataType } : {}),
    });
    terms.push({ term: t.term, irdi: t.semanticId, note: t.provenance ?? null });
    for (const a of t.aliases ?? []) terms.push({ term: a, irdi: t.semanticId, note: '별칭' });
  }
  return { entries, terms };
}
