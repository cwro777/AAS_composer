/**
 * 살아 있는 스택에 대고 P7을 점검한다 — PostgreSQL 저장 + BaSyx V2 게시.
 *
 * 자동 테스트가 아니다. 외부 환경이 필요한 것들은 CI에서 확인할 수 없으므로,
 * 사람이 한 번 돌려 보는 절차를 코드로 남긴 것이다.
 *
 *   docker compose up -d
 *   pnpm --filter @aas/api exec drizzle-kit migrate
 *   pnpm --filter @aas/api exec tsx scripts/live-check.ts ../../packages/kernel/test/fixtures/injection-molding-imm150.json
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import { type Environment, parse } from '@aas/kernel';

import { createApp } from '../src/app.js';
import { createPgStore } from '../src/db/store.js';

const FIXTURE = process.argv[2] ?? '../../packages/kernel/test/fixtures/injection-molding-imm150.json';
const DB = process.env['DATABASE_URL'] ?? 'postgres://aas:aas@localhost:5433/aas';
const BASYX = process.env['BASYX_URL'] ?? 'http://localhost:8081';

const line = (label: string, v: unknown): void => console.log(label.padEnd(20), v);
const j = async (res: Response): Promise<unknown> => res.json();

const env = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Environment;
const doc = parse(env).doc;

const sql = postgres(DB, { max: 3 });
const app = createApp(createPgStore(drizzle(sql)));

console.log('─ 저장소 ────────────────────────────────');
const created = (await j(
  await app.request('/models', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: '사출성형기 IM-150E 2호기', doc }),
  }),
)) as { id: string; version: number; issues: unknown[] };
line('저장 id', created.id);
line('서버 검증', `${created.issues.length}건`);

const shellId = Object.keys(doc.nodes).find((k) => doc.nodes[k]!.t === 'shell')!;
const after = (await j(
  await app.request(`/models/${created.id}/commands`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'If-Match': String(created.version) },
    body: JSON.stringify({
      author: '점검',
      commands: [{ t: 'set', node: shellId, path: 'idShort', value: 'IMM_150E_002_AAS_v2' }],
    }),
  }),
)) as { version: number };
line('명령 후 버전', after.version);

const conflict = await app.request(`/models/${created.id}`, {
  method: 'PUT',
  headers: { 'content-type': 'application/json', 'If-Match': String(created.version) },
  body: JSON.stringify({ doc }),
});
line('낡은 버전 저장', `${conflict.status} ${conflict.status === 409 ? '(정상)' : '(문제)'}`);

const diff = (await j(await app.request(`/models/${created.id}/diff`))) as {
  changes: Array<{ version: number; text: string; author: string | null }>;
};
for (const c of diff.changes) line(`  v${c.version}`, `${c.text} — ${c.author ?? '-'}`);

/* 연결을 새로 열어 다시 읽는다 — 정말 디스크에 남았는지 */
const sql2 = postgres(DB, { max: 1 });
const app2 = createApp(createPgStore(drizzle(sql2)));
const reread = (await j(await app2.request(`/models/${created.id}`))) as { name: string; version: number };
line('새 연결로 재조회', `${reread.name} v${reread.version}`);

console.log('\n─ BaSyx 게시 ────────────────────────────');
const pub = await app.request(`/publish/${created.id}?force=1`, { method: 'POST' });
const result = (await j(pub)) as {
  ok: number;
  failed: number;
  items: Array<{ kind: string; idShort: string; status: number; error?: string }>;
};
line('응답', pub.status);
line('결과', `성공 ${result.ok} · 실패 ${result.failed}`);
for (const i of result.items) {
  line(`  ${i.kind}`, `${i.idShort} → ${i.status}${i.error ? ` ${i.error.slice(0, 100)}` : ''}`);
}

const shells = (await (await fetch(`${BASYX}/shells`)).json()) as { result: Array<{ idShort: string }> };
const sms = (await (await fetch(`${BASYX}/submodels`)).json()) as { result: Array<{ idShort: string }> };
line('BaSyx 셸', shells.result.map((s) => s.idShort).join(', ') || '(없음)');
line('BaSyx 서브모델', `${sms.result.length}건 — ${sms.result.map((s) => s.idShort).join(', ')}`);

/* 점검 스크립트가 매번 모델을 남기면 저장소가 점검용으로 뒤덮인다. 남기려면 KEEP=1 */
if (process.env['KEEP'] === '1') {
  line('남김', `${created.id} (KEEP=1)`);
} else {
  await app.request(`/models/${created.id}`, { method: 'DELETE' });
  line('정리', '점검용 모델을 지웠습니다 (남기려면 KEEP=1). BaSyx에 올린 것은 그대로입니다.');
}

await sql.end();
await sql2.end();
