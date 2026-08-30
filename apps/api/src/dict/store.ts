/**
 * 사전 저장소 — 개념 캐시와 사내 용어 매핑.
 *
 * 모델 저장소와 같은 방식이다. 인터페이스 뒤에 두고 메모리·PostgreSQL 둘을 둔다.
 * 테스트는 메모리로 돌고, 실제 운영은 PostgreSQL이 받는다.
 */

export type ConceptStatus = 'current' | 'deprecated' | 'superseded' | 'unknown';

export interface DictEntry {
  irdi: string;
  /** 'iec-cdd' | 'eclass' | 'iri' */
  scheme: string;
  /** IEC CDD의 출처 표준 — 61987 등 */
  source?: string | null;
  nameEn?: string | null;
  nameKo?: string | null;
  definition?: string | null;
  /** IEC 61360 단위 기호 */
  unit?: string | null;
  /** STRING · REAL_MEASURE · INTEGER_COUNT · DATE … */
  dataType?: string | null;
  status: ConceptStatus;
  /** status가 superseded일 때 후속 IRDI */
  successor?: string | null;
  /** 어디서 왔는가 — 'idta:02017-1-1' · 'terms:sample' · 'upstream:cdd' */
  origin?: string | null;
  fetchedAt?: string | null;
}

export interface TermLink {
  term: string;
  irdi: string;
  note?: string | null;
}

export interface DictStore {
  get(irdi: string): Promise<DictEntry | undefined>;
  /** 한글 용어·영문·정의·IRDI 어느 쪽으로도 찾는다 */
  search(query: string, limit: number): Promise<DictEntry[]>;
  upsertMany(entries: DictEntry[]): Promise<number>;
  count(): Promise<number>;
  addTerms(terms: TermLink[]): Promise<number>;
  termsFor(irdi: string): Promise<string[]>;
}

function matches(e: DictEntry, terms: string[], q: string): boolean {
  const hay = [e.irdi, e.nameEn ?? '', e.nameKo ?? '', e.definition ?? '', ...terms]
    .join(' ')
    .toLowerCase();
  return hay.includes(q);
}

export function createMemoryDictStore(opts?: { now?: () => string }): DictStore {
  const byIrdi = new Map<string, DictEntry>();
  const terms: TermLink[] = [];
  const now = opts?.now ?? ((): string => new Date().toISOString());

  const termsOf = (irdi: string): string[] =>
    terms.filter((t) => t.irdi === irdi).map((t) => t.term);

  return {
    async get(irdi) {
      return byIrdi.get(irdi);
    },

    async search(query, limit) {
      const q = query.trim().toLowerCase();
      if (q === '') return [];
      const hits = [...byIrdi.values()].filter((e) => matches(e, termsOf(e.irdi), q));
      /* 한글 용어가 앞에서 맞는 것을 먼저 */
      hits.sort((a, b) => {
        const rank = (e: DictEntry): number =>
          termsOf(e.irdi).some((t) => t.toLowerCase().startsWith(q)) ? 0 : e.nameKo?.toLowerCase().startsWith(q) ? 1 : 2;
        return rank(a) - rank(b) || a.irdi.localeCompare(b.irdi);
      });
      return hits.slice(0, limit);
    },

    async upsertMany(entries) {
      for (const e of entries) {
        const prev = byIrdi.get(e.irdi);
        /* 이미 있는 값을 빈 값으로 덮지 않는다 — 부분 정보를 여러 곳에서 모으기 때문이다 */
        byIrdi.set(e.irdi, {
          ...prev,
          ...Object.fromEntries(Object.entries(e).filter(([, v]) => v !== undefined && v !== null)),
          irdi: e.irdi,
          scheme: e.scheme || prev?.scheme || 'unknown',
          status: e.status ?? prev?.status ?? 'unknown',
          fetchedAt: e.fetchedAt ?? now(),
        } as DictEntry);
      }
      return entries.length;
    },

    async count() {
      return byIrdi.size;
    },

    async addTerms(list) {
      for (const t of list) {
        if (!terms.some((x) => x.term === t.term && x.irdi === t.irdi)) terms.push(t);
      }
      return list.length;
    },

    async termsFor(irdi) {
      return termsOf(irdi);
    },
  };
}
