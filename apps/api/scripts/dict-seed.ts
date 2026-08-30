/**
 * 사전 캐시 채우기.
 *
 * 상류(IEC CDD)가 없으므로 **실재하는 자료**로 채운다:
 *   1. 사내 용어집 (@aas/semantic) — 한글 용어와 자체 IRI 개념
 *   2. 인자로 준 IDTA Template JSON들 — conceptDescriptions에 단위·자료형이 있다
 *
 * 회사 사전 내보내기 파일이 생기면 같은 자리에 하나 더 넣으면 된다.
 *
 *   pnpm --filter @aas/api exec tsx scripts/dict-seed.ts <template.json> [...]
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import type { Environment } from '@aas/kernel';
import { SAMPLE_TERMS } from '@aas/semantic';

import { entriesFromEnvironment, entriesFromTermBook } from '../src/dict/harvest.js';
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

for (const f of files) {
  const env = JSON.parse(readFileSync(f, 'utf8')) as Environment;
  const entries = entriesFromEnvironment(env, `idta:${f.split(/[\\/]/).pop()}`);
  const r = await dict.importEntries(entries);
  const withUnit = entries.filter((e) => e.unit).length;
  line(f.split(/[\\/]/).pop() ?? f, `개념 ${entries.length}건 (단위 있는 것 ${withUnit}건)`);
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
