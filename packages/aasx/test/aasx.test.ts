/**
 * AASX 패키징.
 *
 * 완료 기준은 "AASX Package Explorer로 열린다"인데 그것은 CI에서 확인할 수 없다.
 * 그래서 **규격이 요구하는 구조**를 여기서 지키고, 실제 열림은 사람이 한 번 확인한다
 * (계획서 09장). 구조가 어긋나면 Package Explorer는 조용히 빈 화면을 보여준다.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { strFromU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';

import { type Environment, canonicalize, parse, serialize } from '@aas/kernel';

import { REL_ORIGIN, REL_SPEC, REL_SUPPL, listParts, readAasx, writeAasx } from '../src/index.js';

const FIXTURE = fileURLToPath(
  new URL('../../kernel/test/fixtures/injection-molding-imm150.json', import.meta.url),
);
const env = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Environment;

const manual = {
  path: '/aasx/files/mx200_operating_manual.pdf',
  contentType: 'application/pdf',
  bytes: new TextEncoder().encode('%PDF-1.4 (테스트용 더미)'),
};

describe('패키지 구조', () => {
  const bytes = writeAasx({ environment: env, attachments: [manual] });

  it('규격이 요구하는 파트가 모두 있다', () => {
    expect(listParts(bytes)).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'aasx/_rels/aasx-origin.rels',
      'aasx/aasx-origin',
      'aasx/data/_rels/environment.json.rels',
      'aasx/data/environment.json',
      'aasx/files/mx200_operating_manual.pdf',
    ]);
  });

  it('origin 파트는 비어 있다 — 존재 자체가 출발점 표시다', () => {
    expect(unzipSync(bytes)['aasx/aasx-origin']!.length).toBe(0);
  });

  it('관계가 origin → spec → 첨부로 이어진다', () => {
    const files = unzipSync(bytes);
    const root = strFromU8(files['_rels/.rels']!);
    expect(root).toContain(REL_ORIGIN);
    expect(root).toContain('Target="/aasx/aasx-origin"');

    const origin = strFromU8(files['aasx/_rels/aasx-origin.rels']!);
    expect(origin).toContain(REL_SPEC);
    expect(origin).toContain('Target="/aasx/data/environment.json"');

    const spec = strFromU8(files['aasx/data/_rels/environment.json.rels']!);
    expect(spec).toContain(REL_SUPPL);
    expect(spec).toContain(manual.path);
  });

  it('확장자 없는 파트는 Override로 지정한다', () => {
    const ct = strFromU8(unzipSync(bytes)['[Content_Types].xml']!);
    expect(ct).toContain('<Override PartName="/aasx/aasx-origin"');
    expect(ct).toContain('Extension="json"');
    expect(ct).toContain('Extension="rels"');
    /* 첨부 확장자도 등록되어야 뷰어가 연다 */
    expect(ct).toContain('Extension="pdf"');
  });

  it('첨부가 없으면 첨부 관계 파일도 만들지 않는다', () => {
    const parts = listParts(writeAasx({ environment: env }));
    expect(parts).not.toContain('aasx/data/_rels/environment.json.rels');
    expect(parts.some((p) => p.startsWith('aasx/files/'))).toBe(false);
  });
});

describe('왕복', () => {
  it('쓰고 읽으면 Environment가 그대로다', () => {
    const back = readAasx(writeAasx({ environment: env, attachments: [manual] }));
    expect(canonicalize(back.environment as never)).toEqual(canonicalize(env as never));
    expect(back.warnings).toEqual([]);
  });

  it('첨부가 바이트까지 살아 돌아온다', () => {
    const back = readAasx(writeAasx({ environment: env, attachments: [manual] }));
    expect(back.attachments).toHaveLength(1);
    expect(back.attachments[0]!.path).toBe(manual.path);
    expect(back.attachments[0]!.contentType).toBe('application/pdf');
    expect(back.attachments[0]!.bytes).toEqual(manual.bytes);
  });

  it('커널을 거쳐도 의미가 같다 — AASX → 문서 → AASX', () => {
    const once = writeAasx({ environment: env });
    const doc = parse(readAasx(once).environment).doc;
    const twice = readAasx(writeAasx({ environment: serialize(doc) }));
    expect(canonicalize(twice.environment as never)).toEqual(canonicalize(env as never));
  });
});

describe('남의 파일을 받을 때', () => {
  /** 파트를 뺀 ZIP을 만든다 — 망가진 패키지를 흉내 내려는 것 */
  const without = (drop: string): Uint8Array => {
    const files = unzipSync(writeAasx({ environment: env }));
    delete files[drop];
    return zipSync(files);
  };

  it('AASX가 아니면 그렇게 말한다', () => {
    expect(() => readAasx(without('_rels/.rels'))).toThrow(/AASX가 아닙니다/);
  });

  it('관계가 빠져 있으면 표준 경로로 읽되 경고를 남긴다', () => {
    const back = readAasx(without('aasx/_rels/aasx-origin.rels'));
    expect(back.warnings.some((w) => w.includes('aasx-origin.rels'))).toBe(true);
    expect(canonicalize(back.environment as never)).toEqual(canonicalize(env as never));
  });
});
