/**
 * 사전 저장소 — PostgreSQL.
 *
 * 메모리 구현과 같은 인터페이스다. 라우트는 어느 쪽인지 모른다.
 * 검색은 ILIKE로 충분하다 — 항목명이 짧고, 지금 규모에서 인덱스 튜닝은 이르다.
 * 느려지면 그때 pg_trgm을 얹는다(계획서 06장).
 */

import { and, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { dictConcept, termMap } from '../db/schema.js';
import type { ConceptStatus, DictEntry, DictStore, TermLink } from './store.js';

type Row = typeof dictConcept.$inferSelect;

function toEntry(r: Row): DictEntry {
  return {
    irdi: r.irdi,
    scheme: r.scheme,
    source: r.source,
    nameEn: r.nameEn,
    nameKo: r.nameKo,
    definition: r.definition,
    unit: r.unit,
    dataType: r.dataType,
    status: (r.status ?? 'unknown') as ConceptStatus,
    successor: r.successor,
    origin: r.origin,
    fetchedAt: r.fetchedAt ? r.fetchedAt.toISOString() : null,
  };
}

export function createPgDictStore(db: PostgresJsDatabase): DictStore {
  return {
    async get(irdi) {
      const [row] = await db.select().from(dictConcept).where(eq(dictConcept.irdi, irdi)).limit(1);
      return row ? toEntry(row) : undefined;
    },

    async search(query, limit) {
      const q = query.trim();
      if (q === '') return [];
      const like = `%${q}%`;

      /* 용어 매핑에서 먼저 찾고, 그 IRDI를 개념과 합친다 —
         "형체력"으로 찾는 길은 term_map을 지난다 */
      const linked = await db
        .select({ irdi: termMap.irdi })
        .from(termMap)
        .where(ilike(termMap.term, like))
        .limit(limit);
      const linkedIds = [...new Set(linked.map((l) => l.irdi))];

      const rows = await db
        .select()
        .from(dictConcept)
        .where(
          or(
            linkedIds.length ? inArray(dictConcept.irdi, linkedIds) : sql`false`,
            ilike(dictConcept.nameKo, like),
            ilike(dictConcept.nameEn, like),
            ilike(dictConcept.irdi, like),
            ilike(dictConcept.definition, like),
          ),
        )
        .limit(limit);

      /* 용어로 걸린 것을 앞에 */
      const rank = (e: DictEntry): number => (linkedIds.includes(e.irdi) ? 0 : 1);
      return rows.map(toEntry).sort((a, b) => rank(a) - rank(b) || a.irdi.localeCompare(b.irdi));
    },

    async upsertMany(entries) {
      if (entries.length === 0) return 0;
      for (const e of entries) {
        /* 이미 있는 값을 빈 값으로 덮지 않는다 — 부분 정보를 여러 곳에서 모은다 */
        await db
          .insert(dictConcept)
          .values({
            irdi: e.irdi,
            scheme: e.scheme || 'unknown',
            source: e.source ?? null,
            nameEn: e.nameEn ?? null,
            nameKo: e.nameKo ?? null,
            definition: e.definition ?? null,
            unit: e.unit ?? null,
            dataType: e.dataType ?? null,
            status: e.status ?? 'unknown',
            successor: e.successor ?? null,
            origin: e.origin ?? null,
            fetchedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: dictConcept.irdi,
            set: {
              scheme: sql`excluded.scheme`,
              source: sql`coalesce(excluded.source, ${dictConcept.source})`,
              nameEn: sql`coalesce(excluded.name_en, ${dictConcept.nameEn})`,
              nameKo: sql`coalesce(excluded.name_ko, ${dictConcept.nameKo})`,
              definition: sql`coalesce(excluded.definition, ${dictConcept.definition})`,
              unit: sql`coalesce(excluded.unit, ${dictConcept.unit})`,
              dataType: sql`coalesce(excluded.data_type, ${dictConcept.dataType})`,
              status: sql`excluded.status`,
              successor: sql`coalesce(excluded.successor, ${dictConcept.successor})`,
              origin: sql`coalesce(excluded.origin, ${dictConcept.origin})`,
              fetchedAt: sql`excluded.fetched_at`,
            },
          });
      }
      return entries.length;
    },

    async count() {
      const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(dictConcept);
      return row?.n ?? 0;
    },

    async addTerms(list: TermLink[]) {
      if (list.length === 0) return 0;
      let added = 0;
      for (const t of list) {
        const [dup] = await db
          .select({ id: termMap.id })
          .from(termMap)
          .where(and(eq(termMap.term, t.term), eq(termMap.irdi, t.irdi)))
          .limit(1);
        if (dup) continue;
        await db.insert(termMap).values({ term: t.term, irdi: t.irdi, note: t.note ?? null });
        added += 1;
      }
      return added;
    },

    async termsFor(irdi) {
      const rows = await db.select({ term: termMap.term }).from(termMap).where(eq(termMap.irdi, irdi));
      return rows.map((r) => r.term);
    },
  };
}
