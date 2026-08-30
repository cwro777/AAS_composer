/**
 * `.next`를 Dropbox 동기화에서 빼 둔다.
 *
 * Dropbox가 빌드 산출물을 동기화하며 파일을 잠그면 dev 서버가
 * `UNKNOWN: unknown error, open ... .next\server\app\...\page.js`로 죽는다.
 * Windows의 대체 데이터 스트림(`com.dropbox.ignored`)이 그것을 막는데,
 * **`next build`가 `.next`를 새로 만들면 그 표시가 함께 사라진다.**
 *
 * 그래서 사람이 기억해서 다시 거는 대신 dev·build 앞에서 매번 건다.
 * Windows가 아니거나 Dropbox 밖이면 아무 일도 하지 않는다.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const next = join(webDir, '.next');

if (process.platform !== 'win32' || !/[\\/]Dropbox[\\/]/i.test(webDir)) {
  process.exit(0);
}

try {
  mkdirSync(next, { recursive: true });
  /* 디렉터리에 붙는 대체 데이터 스트림 — Dropbox가 이 폴더를 건너뛴다 */
  writeFileSync(`${next}:com.dropbox.ignored`, '1');
  console.log('[dropbox] .next를 동기화 제외로 표시했습니다.');
} catch (e) {
  /* 표시하지 못해도 빌드는 계속된다. 다만 왜 느려지거나 죽는지는 알려 준다. */
  console.warn(`[dropbox] .next 제외 표시에 실패했습니다: ${e.message}`);
  console.warn('[dropbox] dev 서버가 UNKNOWN 오류로 죽으면 README의 복구 절차를 보십시오.');
}
