/**
 * @aas/aasx — OPC(Open Packaging Conventions) 패키지 조립·해체.
 *
 * AASX는 규칙이 정해진 ZIP이다. 라이브러리 없이 직접 만든다 —
 * 커널 밖에 두는 이유는 ZIP 의존성(fflate) 하나 때문이고, fflate가 브라우저·Node
 * 공용이라 **서버 없이 브라우저에서도 내보내기**가 된다.
 *
 *   [Content_Types].xml                    MIME 매핑
 *   _rels/.rels                            → aasx-origin
 *   aasx/aasx-origin                       빈 파트. 여기서 출발한다
 *   aasx/_rels/aasx-origin.rels            → environment.json
 *   aasx/data/environment.json             serialize() 결과 그대로
 *   aasx/data/_rels/environment.json.rels  → 첨부들
 *   aasx/files/…                           File 요소가 가리키는 첨부
 *
 * 관계 타입은 admin-shell.io가 정한 것을 쓴다. 이름을 지어내면 Package Explorer가 열지 못한다.
 */

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import type { Environment } from '@aas/kernel';

const REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
const CT_NS = 'http://schemas.openxmlformats.org/package/2006/content-types';

export const REL_ORIGIN = 'http://admin-shell.io/aasx/relationships/aasx-origin';
export const REL_SPEC = 'http://admin-shell.io/aasx/relationships/aas-spec';
export const REL_SUPPL = 'http://admin-shell.io/aasx/relationships/aas-suppl';

const ORIGIN_PART = 'aasx/aasx-origin';
const SPEC_PART = 'aasx/data/environment.json';

export interface AasxAttachment {
  /** File 요소의 value가 가리키는 패키지 내부 경로 — '/aasx/files/manual.pdf' */
  path: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface AasxWriteOptions {
  environment: Environment;
  attachments?: AasxAttachment[];
}

/** 앞의 '/'를 떼고 ZIP 항목 이름으로 만든다 */
function zipName(path: string): string {
  return path.replace(/^\/+/, '');
}

function extensionOf(path: string): string | null {
  const m = /\.([A-Za-z0-9]+)$/.exec(path);
  return m ? m[1]!.toLowerCase() : null;
}

function xmlEscape(s: string): string {
  return s.replace(/[<>&"']/g, (c) => {
    switch (c) {
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '&':
        return '&amp;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}

function contentTypesXml(attachments: AasxAttachment[]): string {
  /* 확장자 → contentType. 같은 확장자가 여러 번 나오면 처음 것을 쓴다 */
  const defaults = new Map<string, string>([
    ['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
    ['json', 'application/json'],
    ['xml', 'text/xml'],
  ]);
  for (const a of attachments) {
    const ext = extensionOf(a.path);
    if (ext && !defaults.has(ext)) defaults.set(ext, a.contentType);
  }
  const lines = [...defaults].map(
    ([ext, ct]) => `  <Default Extension="${ext}" ContentType="${xmlEscape(ct)}"/>`,
  );
  /* 확장자가 없는 파트는 Override로 지정해야 한다 */
  lines.push(`  <Override PartName="/${ORIGIN_PART}" ContentType="text/plain"/>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Types xmlns="${CT_NS}">\n${lines.join('\n')}\n</Types>\n`;
}

function relsXml(rels: Array<{ id: string; type: string; target: string }>): string {
  const lines = rels.map(
    (r) =>
      `  <Relationship Id="${r.id}" Type="${r.type}" Target="${xmlEscape(r.target)}"/>`,
  );
  return `<?xml version="1.0" encoding="UTF-8"?>\n<Relationships xmlns="${REL_NS}">\n${lines.join('\n')}\n</Relationships>\n`;
}

/**
 * AASX 바이트를 만든다.
 *
 * 첨부는 File 요소가 가리키는 경로 그대로 담는다. 경로를 바꾸면 모델 안의 참조가 끊긴다.
 */
export function writeAasx(options: AasxWriteOptions): Uint8Array {
  const attachments = options.attachments ?? [];
  const files: Record<string, Uint8Array> = {};

  files['[Content_Types].xml'] = strToU8(contentTypesXml(attachments));
  files['_rels/.rels'] = strToU8(
    relsXml([{ id: 'rId1', type: REL_ORIGIN, target: `/${ORIGIN_PART}` }]),
  );
  /* origin 파트는 내용이 없다. 존재 자체가 출발점 표시다 */
  files[ORIGIN_PART] = new Uint8Array(0);
  files['aasx/_rels/aasx-origin.rels'] = strToU8(
    relsXml([{ id: 'rId2', type: REL_SPEC, target: `/${SPEC_PART}` }]),
  );
  files[SPEC_PART] = strToU8(`${JSON.stringify(options.environment, null, 2)}\n`);

  if (attachments.length) {
    files['aasx/data/_rels/environment.json.rels'] = strToU8(
      relsXml(
        attachments.map((a, i) => ({
          id: `rId${100 + i}`,
          type: REL_SUPPL,
          target: a.path.startsWith('/') ? a.path : `/${a.path}`,
        })),
      ),
    );
    for (const a of attachments) files[zipName(a.path)] = a.bytes;
  }

  return zipSync(files, { level: 6 });
}

export interface AasxReadResult {
  environment: Environment;
  attachments: AasxAttachment[];
  /** 규격에서 벗어난 점 — 열기는 하되 조용히 넘기지 않는다 */
  warnings: string[];
}

/** 관계 파일에서 Target을 뽑는다. 정규식으로 충분하다 — 우리가 읽는 것은 이 두 파일뿐이다. */
function targetsOf(xml: string, type: string): string[] {
  const out: string[] = [];
  const re = /<Relationship\b[^>]*>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const tag = m[0];
    if (!tag.includes(type)) continue;
    const t = /Target="([^"]+)"/.exec(tag);
    if (t) out.push(t[1]!);
  }
  return out;
}

export function readAasx(bytes: Uint8Array): AasxReadResult {
  const files = unzipSync(bytes);
  const warnings: string[] = [];
  const get = (name: string): Uint8Array | undefined => files[zipName(name)];

  const rootRels = get('_rels/.rels');
  if (!rootRels) throw new Error('AASX가 아닙니다: _rels/.rels가 없습니다.');

  const originTargets = targetsOf(strFromU8(rootRels), REL_ORIGIN);
  if (originTargets.length === 0) warnings.push('aasx-origin 관계를 찾지 못했습니다.');

  /* origin의 관계 파일에서 spec 파트를 찾는다. 없으면 표준 경로로 넘어간다 */
  let specPath = SPEC_PART;
  const originName = zipName(originTargets[0] ?? `/${ORIGIN_PART}`);
  const dir = originName.slice(0, originName.lastIndexOf('/'));
  const base = originName.slice(originName.lastIndexOf('/') + 1);
  const originRels = get(`${dir}/_rels/${base}.rels`);
  if (originRels) {
    const spec = targetsOf(strFromU8(originRels), REL_SPEC)[0];
    if (spec) specPath = zipName(spec);
    else warnings.push('aas-spec 관계를 찾지 못해 표준 경로로 읽었습니다.');
  } else {
    warnings.push('aasx-origin.rels가 없어 표준 경로로 읽었습니다.');
  }

  const specBytes = get(specPath);
  if (!specBytes) throw new Error(`Environment 파트를 찾지 못했습니다: ${specPath}`);
  if (!specPath.endsWith('.json')) {
    warnings.push(`XML Environment는 아직 읽지 못합니다: ${specPath}`);
  }
  const environment = JSON.parse(strFromU8(specBytes)) as Environment;

  /* 첨부 — aasx/files 아래의 실제 파일을 담는다 */
  const attachments: AasxAttachment[] = [];
  const ctXml = get('[Content_Types].xml');
  const ct = ctXml ? strFromU8(ctXml) : '';
  for (const name of Object.keys(files)) {
    if (!name.startsWith('aasx/files/')) continue;
    const ext = extensionOf(name);
    const m = ext ? new RegExp(`Extension="${ext}"\\s+ContentType="([^"]+)"`).exec(ct) : null;
    attachments.push({
      path: `/${name}`,
      contentType: m?.[1] ?? 'application/octet-stream',
      bytes: files[name]!,
    });
  }

  return { environment, attachments, warnings };
}

/** 패키지 안에 무엇이 들어 있는지 — 테스트와 진단용 */
export function listParts(bytes: Uint8Array): string[] {
  return Object.keys(unzipSync(bytes)).sort();
}
