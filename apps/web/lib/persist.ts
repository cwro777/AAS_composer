'use client';

/**
 * 저장 — 두 종류를 구분한다.
 *
 * - **로컬 자동 저장**은 `AasDoc` + `Layout`을 그대로 담는다. 노드 id와 좌표까지 보존되므로
 *   새로고침해도 화면이 그대로다. 우리 안에서만 쓰는 형식이다.
 * - **파일 내보내기**는 AAS Environment JSON이다. 남과 주고받는 형식이고, 좌표는 들어가지 않는다
 *   (모델이 아니라 화면 정보이기 때문이다).
 *
 * 실행취소 이력은 저장하지 않는다. 세션을 넘겨 되돌리는 것은 의미가 없고,
 * 그 기록이 필요해지는 시점은 서버에 명령 로그를 남기는 P7이다.
 */

import {
  type AasDoc,
  type Layout,
  attachConceptDescriptions,
  buildConceptDescriptions,
  emptyLayout,
  parse,
  serialize,
} from '@aas/kernel';
import type { Environment } from '@aas/kernel';
import { termsResolver } from '@aas/semantic';
import { writeAasx } from '@aas/aasx';

const KEY = 'aas-composer/editor/v1';

interface Saved {
  schema: 1;
  doc: AasDoc;
  layout: Layout;
  savedAt: string;
}

/** 브라우저 저장소는 없을 수도, 막혀 있을 수도, 꽉 찼을 수도 있다. 실패해도 편집은 계속된다. */
export function saveLocal(doc: AasDoc, layout: Layout): string | null {
  try {
    const savedAt = new Date().toISOString();
    const payload: Saved = { schema: 1, doc, layout, savedAt };
    window.localStorage.setItem(KEY, JSON.stringify(payload));
    return savedAt;
  } catch {
    return null;
  }
}

export function loadLocal(): { doc: AasDoc; layout: Layout } | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Saved>;
    if (parsed.schema !== 1 || !parsed.doc || Object.keys(parsed.doc.nodes ?? {}).length === 0) {
      return null;
    }
    return { doc: parsed.doc, layout: parsed.layout ?? emptyLayout() };
  } catch {
    return null;
  }
}

export function clearLocal(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    /* 지우지 못해도 새 문서로 시작하는 데는 문제가 없다 */
  }
}

/**
 * 내보낼 Environment.
 *
 * `conceptDescriptions`를 함께 싣는다. semanticId는 가리키기만 하므로, 단위와 자료형이
 * 문서에 없으면 수신 측이 `45.2`가 무엇인지 알 수 없다.
 *
 * 해석하지 못한 개념은 조용히 빠지지 않고 건수로 돌려준다 — 사용자가 알아야 한다.
 */
export function buildExport(doc: AasDoc): { env: unknown; concepts: number; unresolved: number } {
  const cd = buildConceptDescriptions(doc, termsResolver());
  return {
    env: attachConceptDescriptions(serialize(doc), cd.conceptDescriptions),
    concepts: cd.conceptDescriptions.length,
    unresolved: cd.unresolved.length,
  };
}

export function environmentText(doc: AasDoc): string {
  return `${JSON.stringify(buildExport(doc).env, null, 2)}\n`;
}

/** 첫 셸의 이름을 파일명으로 쓴다 — 내려받은 파일이 무엇인지 알아볼 수 있게 */
export function suggestFilename(doc: AasDoc): string {
  const shell = doc.roots.map((r) => doc.nodes[r]).find((n) => n?.t === 'shell');
  const base = (shell?.idShort || 'aas-model').replace(/[^A-Za-z0-9_-]/g, '_');
  return `${base}.json`;
}

/**
 * AASX로 내보낸다.
 *
 * File 요소가 가리키는 첨부는 아직 담지 못한다 — 에디터에 파일을 넣는 자리가 없기 때문이다.
 * 조용히 빠뜨리지 않고 몇 건인지 돌려준다.
 */
export function buildAasx(doc: AasDoc): { bytes: Uint8Array; concepts: number; missingFiles: number } {
  const { env, concepts } = buildExport(doc);
  const missingFiles = Object.keys(doc.nodes).filter(
    (id) => doc.nodes[id]!.t === 'file' && (doc.nodes[id] as { value?: string }).value,
  ).length;
  return { bytes: writeAasx({ environment: env as Environment }), concepts, missingFiles };
}

export function downloadBytes(filename: string, bytes: Uint8Array, mime: string): void {
  const url = URL.createObjectURL(new Blob([bytes as unknown as BlobPart], { type: mime }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export interface ImportResult {
  doc: AasDoc;
  warnings: string[];
}

/**
 * Environment JSON을 읽는다. 남이 만든 파일도 받는다 —
 * 우리가 모르는 필드는 커널이 `raw`에 보존하므로 다시 내보내도 손상되지 않는다.
 */
export function importEnvironment(text: string): ImportResult {
  const env: unknown = JSON.parse(text);
  const { doc, warnings } = parse(env);
  return { doc, warnings: warnings.map((w) => `${w.code}: ${w.detail}`) };
}
