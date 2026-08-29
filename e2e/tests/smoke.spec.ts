import { expect, test } from '@playwright/test';

test('첫 화면이 뜨고 계획된 경로를 보여준다', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'AAS Composer' })).toBeVisible();
  await expect(page.getByText('/editor')).toBeVisible();
});

test.skip('에디터: 템플릿 삽입 → 표 편집 → 검증 해소 → 내보내기', async () => {
  // P4·P5에서 작성한다. 계획서 10장의 "시나리오" 층.
});
