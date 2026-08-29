/**
 * @aas/aasx — OPC(Open Packaging Conventions) 패키지 조립.  구현은 P7.
 *
 * 커널 밖에 두는 이유는 ZIP 의존성(fflate) 하나 때문이다. 커널의 "의존성 0" 규칙을
 * 지키면서도, fflate가 브라우저·Node 공용이라 **서버 없이 브라우저에서도 내보내기**가 된다.
 *
 * 패키지 구조 (docs/plan.html 09장):
 *   [Content_Types].xml
 *   _rels/.rels
 *   aasx/aasx-origin
 *   aasx/_rels/aasx-origin.rels
 *   aasx/data/environment.json     ← serialize() 결과 그대로
 *   aasx/files/…                   ← File 요소가 가리키는 첨부
 */
import type { Environment } from '@aas/kernel';

export interface AasxAttachment {
  /** File 요소의 value가 가리키는 패키지 내부 경로 — 예: /aasx/files/manual.pdf */
  path: string;
  contentType: string;
  bytes: Uint8Array;
}

export interface AasxWriteOptions {
  environment: Environment;
  attachments?: AasxAttachment[];
}

/** AASX 바이트를 만든다. 완료 기준은 AASX Package Explorer로 열리는 것. */
export function writeAasx(_options: AasxWriteOptions): Uint8Array {
  throw new Error('writeAasx: P7에서 구현합니다.');
}

/** AASX를 읽어 Environment와 첨부를 돌려준다. */
export function readAasx(_bytes: Uint8Array): { environment: Environment; attachments: AasxAttachment[] } {
  throw new Error('readAasx: P7에서 구현합니다.');
}
