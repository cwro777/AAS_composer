/**
 * 사내 용어 ↔ semanticId 매핑.
 *
 * IEC CDD에는 한글 표제어가 없다. 현장에서 "형체력"으로 찾을 수 있어야 사전 기능이
 * 실제로 쓰인다 — P0 실측에서 나온 요구다.
 *
 * `terms.sample.json`은 **샘플**이다. 회사가 자기 용어와 값으로 바꿔 쓴다.
 * 그때까지 이 파일이 두 가지 역할을 겸한다 — 용어 검색의 사전이자,
 * ConceptDescription 생성의 단위·자료형 출처.
 */

import sample from './seed/terms.sample.json' with { type: 'json' };

export interface TermEntry {
  /** 사내 용어 (한글) */
  term: string;
  aliases?: string[];
  nameEn?: string;
  semanticId: string;
  /** IEC 61360 단위 기호 — kN · mm · °C */
  unit?: string;
  /** IEC 61360 자료형 — STRING · REAL_MEASURE · INTEGER_COUNT · DATE */
  dataType?: string;
  definition?: string;
  /** 표준에서 온 것인가, 우리가 발급한 것인가 */
  origin: 'idta' | 'local';
  verified: 'spec' | 'dict' | 'none';
  provenance?: string;
}

export interface TermBook {
  note?: string;
  terms: TermEntry[];
}

export const SAMPLE_TERMS = sample as unknown as TermBook;

function haystack(t: TermEntry): string {
  return [t.term, ...(t.aliases ?? []), t.nameEn ?? '', t.semanticId].join(' ').toLowerCase();
}

/** 한글 용어·별칭·영문·식별자 어느 쪽으로도 찾는다 */
export function searchTerms(query: string, book: TermBook = SAMPLE_TERMS, limit = 12): TermEntry[] {
  const q = query.trim().toLowerCase();
  if (q === '') return [];
  const hits = book.terms.filter((t) => haystack(t).includes(q));
  /* 용어 자체가 맞는 것을 앞으로 */
  hits.sort((a, b) => {
    const ax = a.term.toLowerCase().startsWith(q) ? 0 : 1;
    const bx = b.term.toLowerCase().startsWith(q) ? 0 : 1;
    return ax - bx || a.term.localeCompare(b.term);
  });
  return hits.slice(0, limit);
}

/**
 * 뒤에서부터 찾는다 — **뒤엣것이 이긴다.**
 * `mergeBooks`와 같은 규칙이어야 한다. 회사 용어집을 샘플 뒤에 이어 붙이기만 해도
 * 덮어쓰기가 되도록 하려는 것이고, 두 경로가 다르면 어느 값이 나갈지 예측할 수 없다.
 */
/** 대소문자·공백·밑줄·하이픈을 지운 비교 키 */
function nameKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9가-힣]/g, '');
}

/**
 * 이름이 **정확히** 같은 항목을 찾는다. 부분일치는 찾지 않는다.
 *
 * `searchTerms`는 사람이 고르라고 후보를 늘어놓는 것이고, 이 함수는 코드가 자동으로
 * 붙이는 데 쓴다. semanticId는 비슷하면 안 되고 같아야 하므로 여기서는 넉넉하게 굴지 않는다.
 */
export function termByName(name: string, book: TermBook = SAMPLE_TERMS): TermEntry | undefined {
  const key = nameKey(name);
  if (!key) return undefined;
  for (let i = book.terms.length - 1; i >= 0; i--) {
    const t = book.terms[i]!;
    if (
      nameKey(t.term) === key ||
      (t.nameEn && nameKey(t.nameEn) === key) ||
      (t.aliases ?? []).some((a) => nameKey(a) === key)
    ) {
      return t;
    }
  }
  return undefined;
}

export function termFor(semanticId: string, book: TermBook = SAMPLE_TERMS): TermEntry | undefined {
  for (let i = book.terms.length - 1; i >= 0; i--) {
    const t = book.terms[i]!;
    if (t.semanticId === semanticId) return t;
  }
  return undefined;
}

/** 회사가 채워 넣은 용어집을 얹는다. 같은 semanticId면 뒤엣것이 이긴다. */
export function mergeBooks(...books: TermBook[]): TermBook {
  const by = new Map<string, TermEntry>();
  for (const b of books) for (const t of b.terms) by.set(t.semanticId, t);
  return { terms: [...by.values()] };
}
