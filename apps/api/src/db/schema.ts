import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

/**
 * 스키마 초안.  마이그레이션 생성은 P7에서 한다.
 *
 * 설계 근거 (docs/plan.html 04장 · 06장 · 09장):
 * - 문서는 스냅샷 + 명령 로그로 저장한다. 버전 비교와 감사 추적이 여기서 나온다.
 * - 좌표(Layout)는 의미 문서와 별도 컬럼이다. 노드를 옮겨도 버전이 늘지 않는다.
 * - 사전 캐시는 IEC CDD 단독. eCl@ss 행은 조회 없이 보존만 될 수 있다(status='unknown').
 */

export const models = pgTable('models', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** 최신 스냅샷 (AasDoc) */
  doc: jsonb('doc').notNull(),
  /** 화면 정보 (Layout) — 의미 문서와 분리 */
  layout: jsonb('layout'),
  /** 저장 시점에 커널이 계산한 검증 이슈 */
  issues: jsonb('issues'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const modelCommands = pgTable(
  'model_commands',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    modelId: uuid('model_id')
      .notNull()
      .references(() => models.id, { onDelete: 'cascade' }),
    /** 이 명령이 만들어 낸 버전 번호 */
    version: integer('version').notNull(),
    /** Cmd 하나 또는 batch */
    cmd: jsonb('cmd').notNull(),
    /** 되돌리기용 역명령 */
    undo: jsonb('undo').notNull(),
    author: text('author'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ byModel: index('model_commands_model_version_idx').on(t.modelId, t.version) }),
);

export const dictConcept = pgTable(
  'dict_concept',
  {
    irdi: text('irdi').primaryKey(),
    scheme: text('scheme').notNull(),
    source: text('source'),
    nameEn: text('name_en'),
    nameKo: text('name_ko'),
    definition: text('definition'),
    unit: text('unit'),
    dataType: text('data_type'),
    status: text('status').notNull().default('unknown'),
    successor: text('successor'),
    /** 어디서 왔는가 — 'idta:02017-1-1' · 'terms:local' · 'upstream:cdd'.
        섞이면 나중에 무엇을 다시 받아야 하는지 알 수 없다 */
    origin: text('origin'),
    payload: jsonb('payload'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  },
  (t) => ({ byName: index('dict_concept_name_idx').on(t.nameKo, t.nameEn) }),
);

/** 사내 용어 ↔ IRDI 매핑. CDD에 한글 표제어가 없어서 필요하다 (P6 완료 기준) */
export const termMap = pgTable('term_map', {
  id: uuid('id').primaryKey().defaultRandom(),
  term: text('term').notNull(),
  irdi: text('irdi').notNull(),
  note: text('note'),
});
