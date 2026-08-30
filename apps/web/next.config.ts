import type { NextConfig } from 'next';

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
