import type { NextConfig } from 'next';

const config: NextConfig = {
  reactStrictMode: true,
  // 워크스페이스 패키지를 소스 그대로 물린다 (빌드 산출물을 두지 않는 구성)
  transpilePackages: ['@aas/kernel', '@aas/templates', '@aas/semantic', '@aas/aasx', '@aas/ui'],
};

export default config;
