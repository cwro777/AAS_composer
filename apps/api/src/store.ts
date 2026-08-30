/**
 * 모델 저장소.
 *
 * 문서는 **스냅샷 + 명령 로그**로 저장한다. 버전 비교와 감사 추적이 여기서 나온다
 * (계획서 04장). 명령은 커널이 이미 역명령과 함께 돌려주므로 서버가 다시 계산하지 않는다.
 *
 * 인터페이스 뒤에 두는 이유는 하나다 — PostgreSQL(Drizzle)을 끼울 때 라우트를 건드리지
 * 않기 위해서다. 지금 구현은 메모리이고, 스키마는 `src/db/schema.ts`에 이미 있다.
 */

import type { AasDoc, Cmd, Issue, Layout } from '@aas/kernel';

export interface ModelRecord {
  id: string;
  name: string;
  doc: AasDoc;
  layout: Layout | null;
  /** 저장 시점에 커널이 계산한 이슈 */
  issues: Issue[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommandRecord {
  version: number;
  cmd: Cmd;
  undo: Cmd[];
  author: string | null;
  at: string;
}

export interface ModelSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  errors: number;
  warnings: number;
}

export interface CreateInput {
  name: string;
  doc: AasDoc;
  layout?: Layout | null;
  issues?: Issue[];
}

export interface ModelStore {
  list(): Promise<ModelSummary[]>;
  get(id: string): Promise<ModelRecord | undefined>;
  create(input: CreateInput): Promise<ModelRecord>;
  /**
   * 스냅샷을 통째로 바꾼다.
   * `expectedVersion`이 현재와 다르면 `undefined`를 돌려준다 — 라우트가 409로 옮긴다.
   */
  replace(
    id: string,
    input: { doc: AasDoc; layout?: Layout | null; issues?: Issue[]; name?: string },
    expectedVersion: number,
  ): Promise<ModelRecord | undefined>;
  /** 명령을 덧붙인다. 문서는 호출자가 적용한 결과를 함께 넘긴다 */
  append(
    id: string,
    entries: Array<{ cmd: Cmd; undo: Cmd[]; author?: string | null }>,
    doc: AasDoc,
    issues: Issue[],
    expectedVersion: number,
  ): Promise<ModelRecord | undefined>;
  commands(id: string, from?: number, to?: number): Promise<CommandRecord[]>;
  remove(id: string): Promise<boolean>;
}

function summarize(r: ModelRecord): ModelSummary {
  return {
    id: r.id,
    name: r.name,
    version: r.version,
    updatedAt: r.updatedAt,
    errors: r.issues.filter((i) => i.severity === 'error').length,
    warnings: r.issues.filter((i) => i.severity === 'warn').length,
  };
}

/**
 * 메모리 저장소.
 *
 * 시간과 id는 주입받는다 — 테스트가 결정적이어야 하고, 저장소가 환경을 직접 읽으면
 * 그렇게 만들 수 없다.
 */
export function createMemoryStore(opts?: { now?: () => string; newId?: () => string }): ModelStore {
  const models = new Map<string, ModelRecord>();
  const logs = new Map<string, CommandRecord[]>();
  let seq = 0;
  const now = opts?.now ?? ((): string => new Date().toISOString());
  const newId = opts?.newId ?? ((): string => `m${++seq}`);

  return {
    async list() {
      return [...models.values()]
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(summarize);
    },

    async get(id) {
      return models.get(id);
    },

    async create({ name, doc, layout, issues }) {
      const at = now();
      const rec: ModelRecord = {
        id: newId(),
        name,
        doc,
        layout: layout ?? null,
        issues: issues ?? [],
        version: 1,
        createdAt: at,
        updatedAt: at,
      };
      models.set(rec.id, rec);
      logs.set(rec.id, []);
      return rec;
    },

    async replace(id, input, expectedVersion) {
      const cur = models.get(id);
      if (!cur || cur.version !== expectedVersion) return undefined;
      const next: ModelRecord = {
        ...cur,
        ...(input.name === undefined ? {} : { name: input.name }),
        doc: input.doc,
        layout: input.layout === undefined ? cur.layout : input.layout,
        issues: input.issues ?? cur.issues,
        version: cur.version + 1,
        updatedAt: now(),
      };
      models.set(id, next);
      return next;
    },

    async append(id, entries, doc, issues, expectedVersion) {
      const cur = models.get(id);
      if (!cur || cur.version !== expectedVersion) return undefined;
      const log = logs.get(id) ?? [];
      const at = now();
      let v = cur.version;
      for (const e of entries) {
        v += 1;
        log.push({ version: v, cmd: e.cmd, undo: e.undo, author: e.author ?? null, at });
      }
      logs.set(id, log);
      const next: ModelRecord = { ...cur, doc, issues, version: v, updatedAt: at };
      models.set(id, next);
      return next;
    },

    async commands(id, from, to) {
      const log = logs.get(id) ?? [];
      return log.filter((c) => (from === undefined || c.version > from) && (to === undefined || c.version <= to));
    },

    async remove(id) {
      logs.delete(id);
      return models.delete(id);
    },
  };
}
