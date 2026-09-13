/**
 * API — 모델 저장소 · 명령 로그 · 버전 비교 · 검증 · 내보내기.
 *
 * 원칙 (계획서 09장):
 * - `@aas/kernel`을 그대로 import 한다. **검증 로직을 서버에서 다시 쓰지 않는다.**
 *   에디터가 통과시킨 것이 서버에서 거절당하는 일은 같은 코드를 쓰면 생기지 않는다.
 * - 응답 스키마는 Zod로 정의하고 그 타입을 web이 공유한다.
 * - 저장은 스냅샷 + 명령 로그. 버전 비교와 감사 추적이 여기서 나온다.
 *
 * 단일 사용자이므로 병합 화면은 만들지 않는다. 충돌은 409 + 재적재 안내로 끝낸다.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { z } from 'zod';

import { type AasDoc, type Cmd, type Environment, apply, validate } from '@aas/kernel';
import { checkAllConformance } from '@aas/templates';
import { writeAasx } from '@aas/aasx';
import { buildConceptDescriptions, attachConceptDescriptions, serialize } from '@aas/kernel';
import { termsResolver } from '@aas/semantic';

import { type FetchLike, publish } from './basyx.js';
import type { Collector, SampleStore } from './collect/collector.js';
import { planFor } from './collect/plan.js';
import { diffLines } from './diff.js';
import { entriesFromEnvironment } from './dict/harvest.js';
import { type Dictionary, createDictionary } from './dict/service.js';
import { type DictEntry, createMemoryDictStore } from './dict/store.js';
import type { ModelStore } from './store.js';

/**
 * 환경값은 **쓸 때 읽는다.** 모듈 최상위에서 읽으면 `.env`보다 먼저 읽힌다 —
 * ESM은 import를 본문보다 먼저 평가하므로 index.ts의 `loadEnvFile`이 돌기 전에 이 파일이
 * 이미 값을 붙잡는다. 그래서 한동안 `.env`의 IRI_PREFIX·BASYX_URL이 무시되고 기본값만 쓰였다.
 */
const iriPrefix = (): string => process.env['IRI_PREFIX'] ?? 'https://cw1.co.kr/ids';
const basyxUrl = (): string => process.env['BASYX_URL'] ?? 'http://localhost:8081';

/* 문서 구조는 커널이 지킨다. 여기서는 형태만 본다 — 두 곳에서 규칙을 쓰지 않기 위해서다. */
const docSchema = z.object({
  schema: z.literal(1),
  nodes: z.record(z.unknown()),
  order: z.record(z.array(z.string())),
  parent: z.record(z.string().nullable()),
  roots: z.array(z.string()),
});

const createSchema = z.object({
  name: z.string().min(1),
  doc: docSchema,
  layout: z.unknown().optional(),
});

const replaceSchema = z.object({
  name: z.string().min(1).optional(),
  doc: docSchema,
  layout: z.unknown().optional(),
});

const commandsSchema = z.object({
  commands: z.array(z.unknown()).min(1),
  author: z.string().optional(),
});

/** 저장할 때마다 서버도 같은 커널로 검증한다 */
function issuesOf(doc: AasDoc): ReturnType<typeof validate> {
  const policy = validate(doc, { iriPrefix: iriPrefix() });
  const template = checkAllConformance(doc).map((c) => ({
    code: c.code,
    layer: 'template' as const,
    severity: (c.code === 'T-001' || c.code === 'T-002' ? 'error' : 'warn') as 'error' | 'warn',
    node: c.node,
    path: c.path,
    message: c.message,
  }));
  return [...policy, ...template];
}

const importSchema = z.object({
  environment: z.record(z.unknown()).optional(),
  entries: z.array(z.record(z.unknown())).optional(),
  terms: z.array(z.object({ term: z.string().min(1), irdi: z.string().min(1) })).optional(),
  origin: z.string().optional(),
});

/** 네트워크·사전·수집기는 주입받는다 — 테스트가 실제 BaSyx·브로커 없이도 돌아야 한다 */
export function createApp(
  store: ModelStore,
  opts?: {
    fetchLike?: FetchLike;
    dictionary?: Dictionary;
    collector?: Collector;
    samples?: SampleStore;
  },
): Hono {
  const app = new Hono();
  const fetchImpl: FetchLike = opts?.fetchLike ?? ((url, init) => fetch(url, init as RequestInit));
  const dict = opts?.dictionary ?? createDictionary(createMemoryDictStore());
  const collector = opts?.collector;
  const samples = opts?.samples;

  /**
   * 웹(3000)이 API(8787)를 직접 부른다. 단일 사용자·로컬 도구이므로 기원은
   * localhost로 좁혀 둔다 — 열어 둘 이유가 없다. 배포처가 생기면 WEB_ORIGIN으로 준다.
   */
  app.use(
    '*',
    cors({
      origin: (process.env['WEB_ORIGIN'] ?? 'http://localhost:3000,http://127.0.0.1:3000').split(','),
      allowHeaders: ['content-type', 'if-match'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['ETag'],
    }),
  );

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('/models', async (c) => c.json({ models: await store.list() }));

  app.post('/models', async (c) => {
    const body = createSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'INVALID_BODY', detail: body.error.issues }, 400);
    const doc = body.data.doc as unknown as AasDoc;
    const rec = await store.create({
      name: body.data.name,
      doc,
      layout: (body.data.layout ?? null) as never,
      issues: issuesOf(doc),
    });
    c.header('ETag', String(rec.version));
    return c.json(rec, 201);
  });

  app.get('/models/:id', async (c) => {
    const rec = await store.get(c.req.param('id'));
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);
    c.header('ETag', String(rec.version));
    return c.json(rec);
  });

  /** 스냅샷 통째로 저장. If-Match가 없으면 덮어쓰지 않는다 */
  app.put('/models/:id', async (c) => {
    const id = c.req.param('id');
    const cur = await store.get(id);
    if (!cur) return c.json({ error: 'NOT_FOUND' }, 404);

    const expected = Number(c.req.header('If-Match'));
    if (!Number.isFinite(expected)) {
      return c.json({ error: 'IF_MATCH_REQUIRED', version: cur.version }, 428);
    }

    const body = replaceSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'INVALID_BODY', detail: body.error.issues }, 400);

    const doc = body.data.doc as unknown as AasDoc;
    const next = await store.replace(
      id,
      {
        doc,
        layout: (body.data.layout ?? null) as never,
        issues: issuesOf(doc),
        ...(body.data.name === undefined ? {} : { name: body.data.name }),
      },
      expected,
    );
    if (!next) {
      /* 단일 사용자라 병합 화면을 만들지 않는다. 다시 불러오라고 알린다 */
      return c.json(
        {
          error: 'VERSION_CONFLICT',
          expected,
          actual: cur.version,
          hint: '다른 탭에서 먼저 저장했습니다. 다시 불러온 뒤 편집하십시오.',
        },
        409,
      );
    }
    c.header('ETag', String(next.version));
    return c.json(next);
  });

  /**
   * 명령을 덧붙인다.
   * 서버가 직접 `apply`를 돌린다 — 클라이언트가 보낸 문서를 믿지 않고,
   * 같은 커널로 다시 계산해 결과가 갈라지지 않게 한다.
   */
  app.post('/models/:id/commands', async (c) => {
    const id = c.req.param('id');
    const cur = await store.get(id);
    if (!cur) return c.json({ error: 'NOT_FOUND' }, 404);

    const expected = Number(c.req.header('If-Match'));
    if (!Number.isFinite(expected)) {
      return c.json({ error: 'IF_MATCH_REQUIRED', version: cur.version }, 428);
    }
    if (expected !== cur.version) {
      return c.json(
        { error: 'VERSION_CONFLICT', expected, actual: cur.version, hint: '다시 불러온 뒤 편집하십시오.' },
        409,
      );
    }

    const body = commandsSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'INVALID_BODY', detail: body.error.issues }, 400);

    let doc = cur.doc;
    const entries: Array<{ cmd: Cmd; undo: Cmd[]; author?: string | null }> = [];
    for (const raw of body.data.commands) {
      const cmd = raw as Cmd;
      const r = apply(doc, cmd);
      if (r.rejected) {
        /* 전부 아니면 전무. 절반만 적용된 문서를 남기지 않는다 */
        return c.json({ error: 'REJECTED', at: entries.length, rejected: r.rejected }, 422);
      }
      doc = r.doc;
      entries.push({ cmd, undo: r.undo, author: body.data.author ?? null });
    }

    const next = await store.append(id, entries, doc, issuesOf(doc), expected);
    if (!next) return c.json({ error: 'VERSION_CONFLICT', expected, actual: cur.version }, 409);
    c.header('ETag', String(next.version));
    return c.json({ version: next.version, issues: next.issues, doc: next.doc });
  });

  app.get('/models/:id/versions', async (c) => {
    const id = c.req.param('id');
    const rec = await store.get(id);
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);
    const log = await store.commands(id);
    return c.json({
      current: rec.version,
      versions: log.map((l) => ({ version: l.version, at: l.at, author: l.author })),
    });
  });

  /** 무엇이 바뀌었는지 문장으로 */
  app.get('/models/:id/diff', async (c) => {
    const id = c.req.param('id');
    const rec = await store.get(id);
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);
    const from = c.req.query('from') ? Number(c.req.query('from')) : undefined;
    const to = c.req.query('to') ? Number(c.req.query('to')) : undefined;
    const log = await store.commands(id, from, to);
    return c.json({ from: from ?? 1, to: to ?? rec.version, changes: diffLines(log, rec.doc) });
  });

  app.post('/models/:id/validate', async (c) => {
    const rec = await store.get(c.req.param('id'));
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);
    const issues = issuesOf(rec.doc);
    return c.json({
      version: rec.version,
      errors: issues.filter((i) => i.severity === 'error').length,
      warnings: issues.filter((i) => i.severity === 'warn').length,
      issues,
    });
  });

  /** AASX 내보내기. 첨부는 아직 담지 않는다 — 서버에 파일 저장소가 없다 */
  app.get('/models/:id/aasx', async (c) => {
    const rec = await store.get(c.req.param('id'));
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);
    const cd = buildConceptDescriptions(rec.doc, termsResolver());
    const env = attachConceptDescriptions(serialize(rec.doc), cd.conceptDescriptions);
    const bytes = writeAasx({ environment: env });
    const name = `${rec.name.replace(/[^A-Za-z0-9_-]/g, '_')}.aasx`;
    c.header('Content-Type', 'application/asset-administration-shell-package');
    c.header('Content-Disposition', `attachment; filename="${name}"`);
    c.header('X-Concept-Descriptions', String(cd.conceptDescriptions.length));
    c.header('X-Unresolved-Concepts', String(cd.unresolved.length));
    return c.body(bytes as unknown as ArrayBuffer);
  });

  app.delete('/models/:id', async (c) => {
    const ok = await store.remove(c.req.param('id'));
    return ok ? c.json({ ok: true }) : c.json({ error: 'NOT_FOUND' }, 404);
  });

  /**
   * BaSyx V2 게시.
   *
   * 부분 실패를 롤백하지 않는다 — 항목별 결과를 돌려주고 실패한 것만 다시 시도한다.
   * conceptDescriptions는 올리지 않는다. BaSyx의 개념 저장소는 별도 서비스라
   * 지금 여기서 다루면 절반만 맞는 구현이 된다.
   */
  app.post('/publish/:id', async (c) => {
    const rec = await store.get(c.req.param('id'));
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);

    const baseUrl = c.req.query('target') ?? basyxUrl();
    const errors = issuesOf(rec.doc).filter((i) => i.severity === 'error');
    if (errors.length && c.req.query('force') !== '1') {
      /* 깨진 모델을 저장소에 올리면 받는 쪽이 먼저 곤란해진다 */
      return c.json(
        { error: 'HAS_ERRORS', errors: errors.length, hint: '오류를 고치거나 force=1로 강행하십시오.' },
        422,
      );
    }

    try {
      const result = await publish(serialize(rec.doc), { baseUrl, fetchLike: fetchImpl });
      return c.json(result, result.failed ? 207 : 200);
    } catch (e) {
      return c.json({ error: 'UNREACHABLE', target: baseUrl, detail: (e as Error).message }, 502);
    }
  });

  /* ── 사전 프록시 ─────────────────────────────────────
     상류(IEC CDD)는 아직 꽂혀 있지 않다. 지금 답하는 근거는 캐시이고,
     캐시를 채우는 길은 import다. status가 그 사실을 감추지 않는다. */

  app.get('/dictionary/status', async (c) => c.json(await dict.status()));

  app.get('/dictionary/search', async (c) => {
    const q = c.req.query('q') ?? '';
    if (q.trim() === '') return c.json({ error: 'QUERY_REQUIRED' }, 400);
    const limit = Math.min(Number(c.req.query('limit') ?? 20) || 20, 100);
    const r = await dict.search(q, limit);
    return c.json({ query: q, count: r.entries.length, upstream: r.upstream, results: r.entries });
  });

  /** 사전 내보내기 파일이나 IDTA 템플릿을 밀어 넣는다 */
  app.post('/dictionary/import', async (c) => {
    const body = importSchema.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: 'INVALID_BODY', detail: body.error.issues }, 400);

    const entries: DictEntry[] = [];
    const terms: Array<{ term: string; irdi: string }> = [];

    if (body.data.environment) {
      entries.push(
        ...entriesFromEnvironment(
          body.data.environment as unknown as Environment,
          body.data.origin ?? 'import:environment',
        ),
      );
    }
    if (body.data.entries) entries.push(...(body.data.entries as unknown as DictEntry[]));
    if (body.data.terms) terms.push(...body.data.terms);

    if (entries.length === 0 && terms.length === 0) {
      return c.json({ error: 'NOTHING_TO_IMPORT', hint: 'environment · entries · terms 중 하나가 필요합니다.' }, 400);
    }
    return c.json(await dict.importEntries(entries, terms));
  });

  /**
   * 여러 개를 한 번에 조회한다.
   *
   * 문서 하나에 semanticId가 수십 개다. 하나씩 물으면 왕복이 그만큼 늘고, 에디터가
   * 화면을 그리는 동안 기다리게 된다. **모르는 것은 조용히 빠진다** — 아는 것만 돌려주고
   * `missing`으로 무엇을 못 찾았는지 함께 알린다.
   */
  app.post('/dictionary/lookup', async (c) => {
    const body = await c.req.json().catch(() => null);
    const ids = (body as { ids?: unknown } | null)?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return c.json({ error: 'IDS_REQUIRED', hint: '{ ids: string[] }가 필요합니다.' }, 400);
    }
    const wanted = [...new Set(ids.filter((x): x is string => typeof x === 'string'))].slice(0, 500);
    const entries: DictEntry[] = [];
    const missing: string[] = [];
    for (const irdi of wanted) {
      const r = await dict.lookup(irdi);
      if (r.entry) entries.push(r.entry);
      else missing.push(irdi);
    }
    return c.json({ asked: wanted.length, entries, missing });
  });

  /** 단일 조회. /dictionary/search 뒤에 와야 한다 — 앞에 두면 search를 삼킨다 */
  app.get('/dictionary/:irdi{.+}', async (c) => {
    const irdi = decodeURIComponent(c.req.param('irdi'));
    const r = await dict.lookup(irdi);
    return c.json({ irdi, ...r }, r.entry ? 200 : 404);
  });

  /* ── 값 수집 ─────────────────────────────────────────
     접점은 AID 서브모델이 알고 있다. 따로 설정 파일을 두지 않는다. */

  app.get('/collect/:id/plan', async (c) => {
    const rec = await store.get(c.req.param('id'));
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);
    return c.json(planFor(rec.doc));
  });

  app.post('/collect/:id/start', async (c) => {
    if (!collector) return c.json({ error: 'NO_COLLECTOR' }, 501);
    const rec = await store.get(c.req.param('id'));
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);

    const plan = planFor(rec.doc);
    if (plan.sources.length === 0) {
      return c.json({ error: 'NOTHING_TO_COLLECT', problems: plan.problems }, 422);
    }
    const status = await collector.start(rec.id, plan);
    /* 붙지 못한 접점이 있으면 207로 알린다 — 절반만 도는 것을 성공이라 하지 않는다 */
    return c.json({ ...status, problems: plan.problems }, status.skipped.length ? 207 : 200);
  });

  app.post('/collect/:id/stop', async (c) => {
    if (!collector) return c.json({ error: 'NO_COLLECTOR' }, 501);
    const stopped = await collector.stop(c.req.param('id'));
    return c.json({ stopped });
  });

  app.get('/collect/status', (c) =>
    c.json({ jobs: collector ? collector.status() : [], available: Boolean(collector) }),
  );

  app.get('/models/:id/timeseries', async (c) => {
    if (!samples) return c.json({ error: 'NO_SAMPLE_STORE' }, 501);
    const id = c.req.param('id');
    const signal = c.req.query('signal');
    const limit = Math.min(Number(c.req.query('limit') ?? 200) || 200, 5000);
    const rows = await samples.recent(id, signal, limit);
    return c.json({ count: rows.length, total: await samples.count(id), samples: rows });
  });

  /**
   * 신호별 현재 상태 — 운영 화면의 근거.
   *
   * **계획에는 있는데 값이 한 번도 오지 않은 신호도 함께 낸다.** 받은 것만 보여주면
   * 죽은 신호가 화면에서 사라진다 — 그것이 가장 감추면 안 되는 상태다.
   *
   * 지연은 서버가 계산하지 않고 `now`를 함께 보내 화면이 재게 한다.
   * 브라우저 시계가 서버와 몇 분씩 어긋나는 일은 흔하다.
   */
  app.get('/models/:id/signals', async (c) => {
    if (!samples) return c.json({ error: 'NO_SAMPLE_STORE' }, 501);
    const rec = await store.get(c.req.param('id'));
    if (!rec) return c.json({ error: 'NOT_FOUND' }, 404);

    const seen = new Map((await samples.summary(rec.id)).map((s) => [s.signal, s]));
    const plan = planFor(rec.doc);
    const signals = [];

    for (const source of plan.sources) {
      for (const sig of source.signals) {
        const got = seen.get(sig.name);
        seen.delete(sig.name);
        signals.push({
          signal: sig.name,
          node: sig.node,
          interfaceName: source.interfaceName,
          protocol: source.protocol,
          address: sig.address,
          unit: got?.unit ?? sig.unit,
          semanticId: got?.semanticId ?? sig.semanticId,
          lastAt: got?.lastAt ?? null,
          numValue: got?.numValue ?? null,
          textValue: got?.textValue ?? null,
          count: got?.count ?? 0,
        });
      }
    }

    /* 계획에서 사라졌지만 값이 남아 있는 신호 — AID를 고친 뒤에 생긴다 */
    for (const orphan of seen.values()) {
      signals.push({
        ...orphan,
        interfaceName: null,
        protocol: null,
        address: null,
        retired: true,
      });
    }

    return c.json({ now: new Date().toISOString(), signals, problems: plan.problems });
  });

  /** 아직 만들지 않은 경로는 501과 함께 어느 단계의 일인지 알려 준다 */
  app.all('/batch', (c) =>
    c.json({ error: 'NOT_IMPLEMENTED', path: '/batch', note: 'P8 — CSV 고정 컬럼 일괄 생성' }, 501),
  );

  return app;
}
