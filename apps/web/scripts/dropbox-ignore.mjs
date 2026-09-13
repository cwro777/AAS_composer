/**
 * `.next`를 Dropbox 밖에 둔다.
 *
 * 이 저장소는 Dropbox 동기화 루트 안에 있고, 그 루트는 Windows 클라우드 파일 필터
 * (재분석 태그 `0x9000f01a`)가 관리한다. Next dev가 청크를 수백 번 다시 쓰면 필터가
 * 그 파일을 붙잡아 dev 서버가
 * `UNKNOWN: unknown error, open ... .next\static\chunks\app\editor\page.js`(errno -4094)로
 * 죽는다.
 *
 * 예전에는 대체 데이터 스트림(`com.dropbox.ignored`)만 걸었다. **그 표시가 걸린 상태에서도
 * 계속 났다** — Dropbox 앱이 꺼져 있어도 필터는 그대로 있기 때문이다. 동기화 제외로는
 * 필터를 비켜 가지 못한다.
 *
 * 그래서 실제 폴더는 `%LOCALAPPDATA%\aas-composer\web-next`에 두고 `.next`는 그리로 가는
 * junction으로 만든다. `next.config`의 `distDir`은 프로젝트 밖을 가리키지 못하므로
 * 설정이 아니라 링크로 푼다. junction에도 제외 표시를 걸어 Dropbox가 올리지 않게 한다.
 *
 * dev·build 앞에서 매번 확인한다. 무엇이 `.next`를 진짜 폴더로 되돌려도 다음 기동에 복구된다.
 * Windows가 아니거나 Dropbox 밖이면 아무 일도 하지 않는다.
 */

import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, rmSync, symlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const webDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const next = join(webDir, '.next');

if (process.platform !== 'win32' || !/[\\/]Dropbox[\\/]/i.test(webDir)) {
  process.exit(0);
}

const target = join(process.env.LOCALAPPDATA ?? join(process.env.USERPROFILE ?? 'C:\\', 'AppData', 'Local'), 'aas-composer', 'web-next');

function kind(path) {
  try {
    const s = lstatSync(path);
    return s.isSymbolicLink() ? 'link' : s.isDirectory() ? 'dir' : 'file';
  } catch {
    return 'none';
  }
}

try {
  mkdirSync(target, { recursive: true });

  const now = kind(next);
  if (now !== 'link') {
    /* Dropbox 안에 남은 진짜 폴더 — 빌드 산출물이라 지워도 다시 만들어진다 */
    if (now !== 'none') rmSync(next, { recursive: true, force: true });
    symlinkSync(target, next, 'junction');
    console.log(`[dropbox] .next → ${target} (Dropbox 밖으로 옮겼습니다)`);

    /**
     * junction에 동기화 제외 표시를 건다 — Dropbox가 링크를 올리지 않게.
     * Node는 `경로:스트림`을 열 때 junction을 따라가 ENOENT가 난다(실측). PowerShell의
     * `-Stream`은 링크 자체에 건다. 느리므로 만들 때 한 번만 부른다.
     */
    try {
      execFileSync(
        'powershell.exe',
        ['-NoProfile', '-Command', `Set-Content -LiteralPath '${next}' -Stream com.dropbox.ignored -Value 1`],
        { stdio: 'ignore', timeout: 20_000 },
      );
    } catch {
      console.warn('[dropbox] junction에 동기화 제외 표시를 걸지 못했습니다. 동작에는 지장이 없습니다.');
    }
  }
} catch (e) {
  /* 옮기지 못해도 기동은 계속된다. 다만 왜 죽을 수 있는지는 알려 준다. */
  console.warn(`[dropbox] .next를 Dropbox 밖으로 옮기지 못했습니다: ${e.message}`);
  console.warn('[dropbox] dev 서버가 UNKNOWN 오류로 죽으면 README의 복구 절차를 보십시오.');
}
