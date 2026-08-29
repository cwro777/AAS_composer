#!/usr/bin/env node
/**
 * 커널 의존성 경계 검사.
 *
 * @aas/kernel 은 순수 TypeScript여야 한다. react·next·hono·fflate 나
 * DOM/fetch API가 나타나면 빌드를 실패시킨다. 이 검사 하나가 이후 모든 재사용
 * (CLI, 일괄 생성 워커, n8n 노드, Orange 애드온의 JSON 검증)을 지켜 준다.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const kernelSrc = join(root, 'packages/kernel/src');

/** import 되면 안 되는 패키지 */
const FORBIDDEN_MODULES = [
  'react',
  'react-dom',
  'next',
  'hono',
  'fflate',
  'zustand',
  '@xyflow/react',
  'node:fs',
  'node:http',
  'node:https',
  'fs',
  'http',
  'https',
];

/** 쓰이면 안 되는 전역. 식별자 경계로 찾는다 — 'fetchAll' 같은 이름은 걸리지 않는다. */
const FORBIDDEN_GLOBALS = [
  [/(?<![.\w$])fetch\b/, 'fetch'],
  [/(?<![.\w$])document\b/, 'document'],
  [/(?<![.\w$])window\b/, 'window'],
  [/(?<![.\w$])localStorage\b/, 'localStorage'],
  [/(?<![.\w$])sessionStorage\b/, 'sessionStorage'],
  [/(?<![.\w$])XMLHttpRequest\b/, 'XMLHttpRequest'],
  [/(?<![.\w$])navigator\b/, 'navigator'],
];

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (p.endsWith('.ts')) out.push(p);
  }
  return out;
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)[^\n]*?from\s+['"]([^'"]+)['"]/g;
const REQUIRE_RE = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const DYNAMIC_RE = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

let failures = 0;
const report = (file, msg) => {
  console.error(`  ✗ ${relative(root, file)}\n    ${msg}`);
  failures += 1;
};

for (const file of walk(kernelSrc)) {
  const src = readFileSync(file, 'utf8');
  const stripped = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');

  for (const re of [IMPORT_RE, REQUIRE_RE, DYNAMIC_RE]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(stripped)) !== null) {
      const spec = m[1];
      const base = spec.startsWith('@') ? spec.split('/').slice(0, 2).join('/') : spec.split('/')[0];
      if (FORBIDDEN_MODULES.includes(base) || FORBIDDEN_MODULES.includes(spec)) {
        report(file, `금지된 import: '${spec}' — 커널은 순수 TypeScript여야 합니다.`);
      }
    }
  }

  for (const [pattern, label] of FORBIDDEN_GLOBALS) {
    if (pattern.test(stripped)) {
      report(file, `금지된 전역 사용: ${label} — 커널은 DOM·네트워크를 쓰지 않습니다.`);
    }
  }
}

if (failures > 0) {
  console.error(`\ncheck:kernel 실패 — 위반 ${failures}건.`);
  console.error('우회하지 말고 설계를 고치십시오. 필요한 기능은 커널 밖(@aas/aasx, @aas/semantic)에 둡니다.');
  process.exit(1);
}
console.log('check:kernel ✓  커널 의존성 경계 이상 없음');
