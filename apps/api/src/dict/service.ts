/**
 * 사전 프록시.
 *
 * **상류(IEC CDD)는 아직 꽂혀 있지 않다.** cdd.iec.ch는 자동 접근을 막고(403),
 * 공개된 REST 창구를 확인하지 못했다. 없는 API를 가정해 코드를 쓰지 않는다 —
 * 이 프로젝트가 semanticId를 다루는 방식과 같은 규칙이다.
 *
 * 그래서 지금 프록시가 답하는 근거는 **캐시**다. 캐시를 채우는 길은 세 가지이고
 * 전부 실재한다:
 *   1. IDTA 공식 Template JSON의 conceptDescriptions (단위·자료형이 들어 있다)
 *   2. 사내 용어집 (@aas/semantic의 terms)
 *   3. 회사가 가진 사전 내보내기 파일 — POST /dictionary/import
 *
 * 상류가 생기면 `Upstream` 하나를 구현해 넘기면 된다. 라우트는 그대로다.
 */

import type { DictEntry, DictStore } from './store.js';

export interface Upstream {
  /** 'iec-cdd' 같은 표시용 이름 */
  name: string;
  lookup(irdi: string): Promise<DictEntry | undefined>;
}

export interface LookupResult {
  entry?: DictEntry;
  /** 어디서 답했는가 */
  source: 'cache' | 'upstream' | 'none';
  /** 상류가 죽어 캐시로 답했는가 */
  stale: boolean;
  /** 사람에게 알릴 말 — 조용히 넘기지 않는다 */
  warning?: string;
  /** 폐기된 개념이면 후속 값 */
  successor?: string | null;
}

export interface Dictionary {
  lookup(irdi: string): Promise<LookupResult>;
  search(query: string, limit?: number): Promise<{ entries: DictEntry[]; upstream: string | null }>;
  importEntries(entries: DictEntry[], terms?: Array<{ term: string; irdi: string }>): Promise<{
    concepts: number;
    terms: number;
    total: number;
  }>;
  status(): Promise<{ cached: number; upstream: string | null }>;
}

export function createDictionary(store: DictStore, upstream?: Upstream): Dictionary {
  return {
    async lookup(irdi) {
      const cached = await store.get(irdi);

      if (!upstream) {
        if (cached) {
          return {
            entry: cached,
            source: 'cache',
            stale: false,
            successor: cached.successor ?? null,
            ...(cached.status === 'deprecated' || cached.status === 'superseded'
              ? { warning: `폐기된 개념입니다${cached.successor ? ` — 후속: ${cached.successor}` : ''}.` }
              : {}),
          };
        }
        return {
          source: 'none',
          stale: false,
          warning:
            '캐시에 없고 상류 사전이 연결되어 있지 않습니다. IDTA 템플릿이나 사내 사전을 import 하십시오.',
        };
      }

      try {
        const fresh = await upstream.lookup(irdi);
        if (fresh) {
          await store.upsertMany([{ ...fresh, origin: `upstream:${upstream.name}` }]);
          return { entry: fresh, source: 'upstream', stale: false, successor: fresh.successor ?? null };
        }
        /* 상류가 모른다고 답한 것과 죽은 것은 다르다 */
        return cached
          ? { entry: cached, source: 'cache', stale: false }
          : { source: 'none', stale: false, warning: `${upstream.name}에 없는 식별자입니다.` };
      } catch (e) {
        /* 외부 사전이 죽어도 편집은 멈추지 않는다 — stale 캐시 + 경고 */
        return cached
          ? {
              entry: cached,
              source: 'cache',
              stale: true,
              warning: `${upstream.name}에 닿지 못해 캐시로 답했습니다: ${(e as Error).message}`,
            }
          : {
              source: 'none',
              stale: true,
              warning: `${upstream.name}에 닿지 못했고 캐시에도 없습니다: ${(e as Error).message}`,
            };
      }
    },

    async search(query, limit = 20) {
      return { entries: await store.search(query, limit), upstream: upstream?.name ?? null };
    },

    async importEntries(entries, terms) {
      const concepts = await store.upsertMany(entries);
      const t = terms?.length ? await store.addTerms(terms) : 0;
      return { concepts, terms: t, total: await store.count() };
    },

    async status() {
      return { cached: await store.count(), upstream: upstream?.name ?? null };
    },
  };
}
