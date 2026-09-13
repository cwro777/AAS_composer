/**
 * 사전 캐시 채우기.
 *
 * 상류(IEC CDD)가 없으므로 **실재하는 자료**로 채운다:
 *   1. 사내 용어집 (@aas/semantic) — 한글 용어와 자체 IRI 개념
 *   2. 인자로 준 파일들. 모양을 보고 알아서 읽는다:
 *      - AAS Environment JSON (`conceptDescriptions`가 있다) — IDTA Template JSON 등
 *      - 용어 파일 (`{ "terms": [...] }` 또는 배열) — IEC CDD 화면에서 옮겨 적은 개념,
 *        회사 용어집, 에디터 용어집 탭의 내보내기
 *
 *   pnpm --filter @aas/api exec tsx scripts/dict-seed.ts <파일.json> [...]
 *
 * 받지 못한 항목은 이유와 함께 찍는다. 조용히 버리면 넣었다고 생각한 개념이 왜 조회되지
 * 않는지 알 수 없다. 같은 IRDI를 다시 넣으면 덮어쓴다 — 고친 파일을 다시 돌리면 된다.
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { Environment } from '@aas/kernel';
import { SAMPLE_TERMS } from '@aas/semantic';

import { entriesFromEnvironment, entriesFromTermBook, entriesFromTermsFile } from '../src/dict/harvest.js';
import { createPgDictStore } from '../src/dict/pg.js';
import { createDictionary } from '../src/dict/service.js';

const DB = process.env['DATABASE_URL'] ?? 'postgres://aas:aas@localhost:5433/aas';
const files = process.argv.slice(2);

const sql = postgres(DB, { max: 3 });
const dict = createDictionary(createPgDictStore(drizzle(sql)));

const line = (a: string, b: unknown): void => console.log(a.padEnd(24), b);

const book = entriesFromTermBook(SAMPLE_TERMS);
const r1 = await dict.importEntries(book.entries, book.terms);
line('사내 용어집', `개념 ${r1.concepts}건 · 용어 ${r1.terms}건`);

let failed = false;
for (const f of files) {
  const name = f.split(/[\\/]/).pop() ?? f;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(f, 'utf8'));
  } catch (e) {
    line(name, `읽지 못함 — ${(e as Error).message}`);
    failed = true;
    continue;
  }

  if (parsed && typeof parsed === 'object' && Array.isArray((parsed as Environment)['conceptDescriptions'])) {
    const entries = entriesFromEnvironment(parsed as Environment, `idta:${name}`);
    await dict.importEntries(entries);
    const withUnit = entries.filter((e) => e.unit).length;
    line(name, `Environment · 개념 ${entries.length}건 (단위 있는 것 ${withUnit}건)`);
    continue;
  }

  try {
    const r = entriesFromTermsFile(parsed, `terms:${name}`);
    const done = await dict.importEntries(r.entries, r.terms);
    line(name, `용어 파일 · 개념 ${done.concepts}건 · 한글 용어 ${done.terms}건 · 건너뜀 ${r.skipped.length}건`);
    for (const s of r.skipped) {
      console.log(`${''.padEnd(26)}[${s.index}] ${s.semanticId ?? '(id 없음)'} — ${s.reason}`);
    }
  } catch (e) {
    line(name, `알아보지 못한 형식 — ${(e as Error).message}`);
    failed = true;
  }
}

const status = await dict.status();
line('캐시 전체', `${status.cached}건`);
line('상류', status.upstream ?? '없음 (IEC CDD 미연결)');

/* 실제로 찾히는지 몇 개 확인한다 */
console.log('\n─ 검색 확인 ─────────────────────────────');
for (const q of ['형체력', '실린더온도', '시리얼번호', 'Ambient', 'ABA565']) {
  const { entries } = await dict.search(q, 3);
  const first = entries[0];
  line(q, first ? `${first.nameKo ?? first.nameEn} · ${first.unit ?? '단위 없음'} · ${first.irdi}` : '없음');
}

await sql.end();
if (failed) process.exitCode = 1;
