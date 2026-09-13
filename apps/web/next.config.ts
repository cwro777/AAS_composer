import { existsSync } from 'node:fs';
import { join } from 'node:path';

import type { NextConfig } from 'next';

/**
 * 저장소 루트의 `.env`를 읽는다 — API와 **같은 파일**이다.
 *
 * Next.js는 자기 폴더(`apps/web`)의 `.env`만 읽는다. 그래서 루트 `.env`의
 * `NEXT_PUBLIC_IRI_PREFIX`가 한 번도 읽힌 적이 없었고, 에디터 기본값은 코드에 적힌 값이었다.
 * 둘이 우연히 같아서 드러나지 않았을 뿐, 루트에서 네임스페이스를 바꾸면 서버만 바뀌고
 * 에디터는 옛 값으로 남아 **같은 문서의 검증 결과가 갈린다.** 두 벌을 두면 언젠가 어긋난다.
 *
 * `NEXT_PUBLIC_*`은 이 설정이 로드될 때의 `process.env`에서 번들에 박히므로 여기서 읽으면 된다.
 * 이미 있는 이름은 덮지 않는다(`loadEnvFile` 규칙) — 셸에서 준 값과 `apps/web/.env*`가 이긴다.
 * 바꾼 뒤에는 dev 서버를 다시 띄워야 반영된다.
 */
const rootEnv = [
  join(typeof __dirname === 'string' ? __dirname : process.cwd(), '..', '..', '.env'),
  join(process.cwd(), '..', '..', '.env'),
].find((p) => existsSync(p));
if (rootEnv) {
  try {
    process.loadEnvFile(rootEnv);
  } catch {
    /* 읽지 못하면 셸 환경변수와 코드 기본값만 쓴다 */
  }
}

const config: NextConfig = {
  reactStrictMode: true,
  // 워크스페이스 패키지를 소스 그대로 물린다 (빌드 산출물을 두지 않는 구성)
  transpilePackages: ['@aas/kernel', '@aas/templates', '@aas/semantic', '@aas/aasx', '@aas/ui'],
  webpack: (cfg) => {
    /* 커널은 ESM 규약대로 './model.js'로 import한다(tsc가 요구하는 형태).
       webpack은 그 확장자를 그대로 찾으므로 .ts로 되돌려 줘야 한다.
       타입체크는 통과하는데 런타임에서만 깨지는 종류의 문제라 실제로 띄워 봐야 발견된다. */
    cfg.resolve.extensionAlias = {
      ...cfg.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };
    return cfg;
  },
};

export default config;
