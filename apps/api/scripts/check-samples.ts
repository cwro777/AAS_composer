/**
 * docs/samples/*.json 이 약속한 대로인지 본다.
 *
 * AAS1은 이슈가 0이어야 하고, AAS2는 정해진 코드가 나와야 한다. 두 파일이 교재라서
 * 화면과 어긋나면 배우는 사람이 자기 잘못인 줄 안다.
 *
 *   pnpm --filter @aas/api exec tsx scripts/check-samples.ts
 */

import { readFileSync } from 'node:fs';
import process from 'node:process';

import {
  buildConceptDescriptions,
  parse,
  serialize,
  validate,
  verifyEnvironment,
} from '@aas/kernel';
import { checkAllConformance } from '@aas/templates';
import { SAMPLE_TERMS, termsResolver } from '@aas/semantic';

const PREFIX = 'https://bnb.co.kr/ids';
const DIR = new URL('../../../docs/samples/', import.meta.url);

function issuesOf(file: string): Array<{ severity: string; code: string; where: string }> {
  const raw = readFileSync(new URL(file, DIR), 'utf8');
  const parsed = parse(JSON.parse(raw) as never);
  const doc = parsed.doc;
  console.log(
    `   노드 ${Object.keys(doc.nodes).length}개 · 루트 ${doc.roots.length}개` +
      (parsed.warnings?.length ? ` · 경고 ${parsed.warnings.length}` : ''),
  );
  const out: Array<{ severity: string; code: string; where: string }> = [];

  for (const i of validate(doc, { iriPrefix: PREFIX })) {
    out.push({ severity: i.severity, code: i.code, where: i.path || (i.node ?? '') });
  }
  for (const c of checkAllConformance(doc)) {
    out.push({ severity: 'warn', code: c.code, where: c.path });
  }
  for (const i of buildConceptDescriptions(doc, termsResolver(SAMPLE_TERMS)).unresolved) {
    out.push({ severity: i.severity, code: i.code, where: i.path });
  }
  const r = verifyEnvironment(serialize(doc));
  if (r.deserializationError) {
    out.push({ severity: 'error', code: 'AAS-CORE', where: r.deserializationError });
  }
  for (const i of r.issues) {
    out.push({ severity: 'error', code: i.code, where: `${i.path} — ${i.message.ko}` });
  }
  return out;
}

let bad = 0;

for (const file of ['AAS1-clean.json', 'AAS2-with-issues.json']) {
  console.log(`\n── ${file}`);
  const issues = issuesOf(file);
  console.log(`   이슈 ${issues.length}건`);
  for (const i of issues) {
    console.log(`   ${i.severity.toUpperCase().padEnd(5)} ${i.code.padEnd(14)} ${i.where}`);
  }
  if (file.startsWith('AAS1') && issues.length !== 0) {
    console.log('   ✗ AAS1은 0건이어야 한다');
    bad += 1;
  }
  if (file.startsWith('AAS2')) {
    const want = ['POL-VAL-001', 'POL-SEM-001', 'CD-001', 'POL-IRI-001'];
    const have = new Set(issues.map((i) => i.code));
    const missing = want.filter((c) => !have.has(c));
    if (missing.length) {
      console.log(`   ✗ 빠진 코드: ${missing.join(', ')}`);
      bad += 1;
    }
  }
}

console.log(bad === 0 ? '\n두 파일 모두 약속대로다.' : `\n어긋난 파일 ${bad}개.`);
process.exit(bad === 0 ? 0 : 1);
