/**
 * PostgreSQL 저장소 — 메모리 저장소와 **같은 인터페이스**다.
 *
 * 라우트는 이 파일을 모른다. `createApp(store)`에 무엇을 넘기느냐만 다르다.
 * 그래서 DB 없이도 서버가 뜨고, 테스트는 메모리로 돈다.
 *
 * 스냅샷과 명령 로그를 한 트랜잭션에서 쓴다 — 둘이 어긋나면 버전 비교가 거짓말을 한다.
 */

import { and, desc, eq, gt, lte } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

import type { AasDoc, Cmd, Issue, Layout } from '@aas/kernel';

import { modelCommands, models } from './schema.js';
import type { CommandRecord, CreateInput, ModelRecord, ModelStore, ModelSummary } from '../store.js';

type Row = typeof models.$inferSelect;

function toRecord(r: Row): ModelRecord {
  return {
    id: r.id,
    name: r.name,
    doc: r.doc as AasDoc,
    layout: (r.layout ?? null) as Layout | null,
    issues: (r.issues ?? []) as Issue[],
    version: r.version,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

function summarize(r: Row): ModelSummary {
  const issues = (r.issues ?? []) as Issue[];
  return {
    id: r.id,
    name: r.name,
    version: r.version,
    updatedAt: r.updatedAt.toISOString(),
    errors: issues.filter((i) => i.severity === 'error').length,
    warnings: issues.filter((i) => i.severity === 'warn').length,
  };
}

export function createPgStore(db: PostgresJsDatabase): ModelStore {
  return {
    async list() {
      const rows = await db.select().from(models).orderBy(desc(models.updatedAt));
      return rows.map(summarize);
    },

    async get(id) {
      const [row] = await db.select().from(models).where(eq(models.id, id)).limit(1);
      return row ? toRecord(row) : undefined;
    },

    async create({ name, doc, layout, issues }: CreateInput) {
      const [row] = await db
        .insert(models)
        .values({
          name,
          doc: doc as never,
          layout: (layout ?? null) as never,
          issues: (issues ?? []) as never,
          version: 1,
        })
        .returning();
      return toRecord(row!);
    },

    async replace(id, input, expectedVersion) {
      /* 조건부 UPDATE 하나로 잠금을 건다 — 읽고 쓰는 사이에 끼어들 틈을 없앤다 */
      const [row] = await db
        .update(models)
        .set({
          ...(input.name === undefined ? {} : { name: input.name }),
          doc: input.doc as never,
          layout: (input.layout ?? null) as never,
          ...(input.issues === undefined ? {} : { issues: input.issues as never }),
          version: expectedVersion + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(models.id, id), eq(models.version, expectedVersion)))
        .returning();
      return row ? toRecord(row) : undefined;
    },

    async append(id, entries, doc, issues, expectedVersion) {
      return db.transaction(async (tx) => {
        const nextVersion = expectedVersion + entries.length;
        const [row] = await tx
          .update(models)
          .set({ doc: doc as never, issues: issues as never, version: nextVersion, updatedAt: new Date() })
          .where(and(eq(models.id, id), eq(models.version, expectedVersion)))
          .returning();
        if (!row) return undefined;

        await tx.insert(modelCommands).values(
          entries.map((e, i) => ({
            modelId: id,
            version: expectedVersion + i + 1,
            cmd: e.cmd as never,
            undo: e.undo as never,
            author: e.author ?? null,
          })),
        );
        return toRecord(row);
      });
    },

    async commands(id, from, to) {
      const where = [eq(modelCommands.modelId, id)];
      if (from !== undefined) where.push(gt(modelCommands.version, from));
      if (to !== undefined) where.push(lte(modelCommands.version, to));
      const rows = await db
        .select()
        .from(modelCommands)
        .where(and(...where))
        .orderBy(modelCommands.version);
      return rows.map(
        (r): CommandRecord => ({
          version: r.version,
          cmd: r.cmd as Cmd,
          undo: (r.undo ?? []) as Cmd[],
          author: r.author,
          at: r.createdAt.toISOString(),
        }),
      );
    },

    async remove(id) {
      const rows = await db.delete(models).where(eq(models.id, id)).returning();
      return rows.length > 0;
    },
  };
}
