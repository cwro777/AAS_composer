/**
 * 시계열 저장소 — PostgreSQL.
 *
 * 평범한 테이블이다. 설비 10~50대 규모에서는 이것으로 충분하고, 느려지면
 * 같은 스키마로 TimescaleDB 하이퍼테이블로 옮긴다.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import { samples } from '../db/schema.js';
import type { SampleStore, StoredSample } from './collector.js';

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
  };
}
