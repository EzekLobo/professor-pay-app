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
  const older = target.getByRole('button', { name: 'Carregar módulos anteriores' });
  await expect(older).toBeVisible();
  if (width === 320) {
    expect(await grid.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
    await grid.evaluate(el => { el.scrollLeft = el.scrollWidth; el.dispatchEvent(new Event("scroll")); });
  } else await older.click();
  await expect(grid.getByRole('columnheader', { name: /M1L/ }).first()).toBeAttached();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
