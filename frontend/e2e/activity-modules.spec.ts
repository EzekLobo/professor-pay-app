import { expect, test } from "@playwright/test";
for (const width of [320, 1440]) test(`módulos começam pela aula recente e permitem carregar anteriores (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/demo#classes');
  await expect(page.locator('.compact-activities-class').first()).toBeVisible();
  const target = page.locator('.compact-activities-class').first();
  await target.locator('summary').click();
  const grid = target.getByRole('grid');
  await expect(grid.getByRole('columnheader', { name: /M2L1/ })).toBeVisible();
  await expect(grid.getByRole('columnheader', { name: /M1L/ })).toHaveCount(0);
  await expect(target.getByText('Atividades por módulo:', { exact: false })).toHaveCount(0);
  await expect(target.locator('.compact-activity-state')).toHaveCount(0);
  await expect(target.getByRole('button', { name: 'Carregar módulos anteriores' })).toHaveCount(0);
  await grid.evaluate(el => { el.scrollTo({ left: el.scrollWidth, behavior: "instant" }); el.dispatchEvent(new Event("scroll")); });
  if (width === 1440) { await grid.focus(); await page.keyboard.press('ArrowRight'); }
  await expect(grid.getByRole('columnheader', { name: /M1L/ }).first()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
