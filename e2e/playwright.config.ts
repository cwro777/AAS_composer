import { defineConfig, devices } from '@playwright/test';

/**
 * 시각 회귀는 라이트/다크 × 1440·768 네 조합으로 찍는다 (docs/plan.html 10장).
 * 성능 예산 검사(드래그 60fps, 문서 열기 1.5s)는 P4에서 트레이스로 추가한다.
 */
export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'light' },
    },
    {
      name: 'desktop-dark',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, colorScheme: 'dark' },
    },
    {
      name: 'tablet-light',
      use: { ...devices['Desktop Chrome'], viewport: { width: 768, height: 1024 }, colorScheme: 'light' },
    },
  ],
  webServer: {
    command: 'pnpm --filter @aas/web dev',
    url: 'http://localhost:3000',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
