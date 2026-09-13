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

export interface TermsFileResult {
  entries: DictEntry[];
  terms: TermLink[];
  /** 받지 않은 항목과 이유 — 조용히 버리면 넣었다고 생각한 것이 왜 안 나오는지 알 수 없다 */
  skipped: Array<{ index: number; semanticId: string | null; reason: string }>;
}

/**
 * 용어 파일(`{ terms: [...] }` 또는 맨 배열)을 사전 항목으로.
 *
 * IEC CDD 화면에서 사람이 옮겨 적은 개념, 회사 용어집, 에디터 용어집 탭의 내보내기가 이
 * 모양이다. **받는 기준은 웹의 `가져오기`(entriesFromFile)와 같다** — 영문 이름과 정의가
 * 있어야 한다. 규격이 요구하므로(AASc-3a-002 · 3a-008) 없는 항목을 사전에 넣어 봐야
 * ConceptDescription이 만들어지지 않고, 사전이 "안다"고 답해 경고만 모양을 바꾼다.
 *
 * 식별자 모양을 알아보지 못하면 받지 않는다. IRDI의 버전 접미사(`#009`)를 빠뜨리는 실수가
 * 흔한데, 그런 id는 모델의 semanticId와 영영 일치하지 않는다.
 */
export function entriesFromTermsFile(raw: unknown, origin: string): TermsFileResult {
  const list: unknown = Array.isArray(raw) ? raw : (raw as { terms?: unknown } | null)?.terms;
  if (!Array.isArray(list)) throw new Error('terms 배열을 찾지 못했습니다 — { "terms": [...] } 또는 배열이어야 합니다.');

  const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
  const out: TermsFileResult = { entries: [], terms: [], skipped: [] };

  list.forEach((item, index) => {
    const t = (item ?? {}) as Record<string, unknown>;
    const semanticId = text(t['semanticId']);
    const nameEn = text(t['nameEn']);
    const definition = text(t['definition']);
    const skip = (reason: string): void => {
      out.skipped.push({ index, semanticId: semanticId || null, reason });
    };

    if (!semanticId) return skip('semanticId가 없습니다');
    const ref = parseSemanticId(semanticId);
    if (ref.scheme === 'unknown') return skip('식별자 모양을 알아보지 못했습니다 (IRDI 버전 접미사 #009 등을 확인)');
    if (!nameEn) return skip('영문 이름(nameEn)이 비었습니다 — AASc-3a-002');
    if (!definition) return skip('영문 정의(definition)가 비었습니다 — AASc-3a-008');

    const term = text(t['term']);
    out.entries.push({
      irdi: semanticId,
      scheme: ref.scheme,
      status: 'unknown',
      origin,
      ...(ref.source ? { source: ref.source } : {}),
      nameEn,
      ...(term ? { nameKo: term } : {}),
      definition,
      ...(text(t['unit']) ? { unit: text(t['unit']) } : {}),
      ...(text(t['dataType']) ? { dataType: text(t['dataType']) } : {}),
    });

    const note = text(t['provenance']) || null;
    if (term) out.terms.push({ term, irdi: semanticId, note });
    if (Array.isArray(t['aliases'])) {
      for (const a of t['aliases']) {
        if (text(a)) out.terms.push({ term: text(a), irdi: semanticId, note: '별칭' });
      }
    }
  });

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
