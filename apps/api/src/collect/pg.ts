/**
 * 시계열 저장소 — PostgreSQL.
 *
 * 평범한 테이블이다. 설비 10~50대 규모에서는 이것으로 충분하고, 느려지면
 * 같은 스키마로 TimescaleDB 하이퍼테이블로 옮긴다.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { samples } from '../db/schema.js';
import type { SampleStore, SignalSummary, StoredSample } from './collector.js';

export function createPgSampleStore(db: PostgresJsDatabase): SampleStore {
  return {
    async insert(rows) {
      if (rows.length === 0) return 0;
      await db.insert(samples).values(
        rows.map((r) => ({
          modelId: r.modelId,
          node: r.node,
          signal: r.signal,
          semanticId: r.semanticId,
          unit: r.unit,
          at: r.at,
          numValue: r.numValue,
          textValue: r.textValue,
        })),
      );
      return rows.length;
    },

    async recent(modelId, signal, limit = 50) {
      const where = signal
        ? and(eq(samples.modelId, modelId), eq(samples.signal, signal))
        : eq(samples.modelId, modelId);
      const rows = await db
        .select()
        .from(samples)
        .where(where)
        .orderBy(desc(samples.at))
        .limit(Math.min(limit, 5000));
      return rows.map(
        (r): StoredSample => ({
          modelId: r.modelId,
          node: r.node,
          signal: r.signal,
          semanticId: r.semanticId,
          unit: r.unit,
          at: r.at,
          numValue: r.numValue,
          textValue: r.textValue,
        }),
      );
    },

    async count(modelId) {
      const [row] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(samples)
        .where(eq(samples.modelId, modelId));
      return row?.n ?? 0;
    },

    async summary(modelId) {
      /* DISTINCT ON은 정렬 첫 열 기준으로 한 행씩 남긴다 — 신호별 최신 한 건 */
      const rows = (await db.execute(sql`
        select
          s.signal,
          s.node,
          s.unit,
          s.semantic_id,
          s.at,
          s.num_value,
          s.text_value,
          c.n
        from (
          select distinct on (signal) signal, node, unit, semantic_id, at, num_value, text_value
          from ${samples}
          where model_id = ${modelId}
          order by signal, at desc
        ) s
        join (
          select signal, count(*)::int as n
          from ${samples}
          where model_id = ${modelId}
          group by signal
        ) c on c.signal = s.signal
        order by s.signal
      `)) as unknown as Array<{
        signal: string;
        node: string;
        unit: string | null;
        semantic_id: string | null;
        /* 원시 SQL은 drizzle의 타입 변환을 거치지 않는다 — 드라이버가 주는 대로 온다 */
        at: Date | string;
        num_value: number | string | null;
        text_value: string | null;
        n: number | string;
      }>;

      return rows.map((r): SignalSummary => ({
        signal: r.signal,
        node: r.node,
        unit: r.unit,
        semanticId: r.semantic_id,
        lastAt: new Date(r.at).toISOString(),
        numValue: r.num_value === null ? null : Number(r.num_value),
        textValue: r.text_value,
        count: Number(r.n),
      }));
    },
  };
}
