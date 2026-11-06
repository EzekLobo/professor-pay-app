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
  if (width === 320) await expect.poll(() => grid.evaluate(el => Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft) < 2)).toBe(true);
  await grid.evaluate(el => { el.scrollTo({ left: 0, behavior: "instant" }); el.dispatchEvent(new Event("scroll")); });
  if (width === 1440) { await grid.focus(); await page.keyboard.press('ArrowLeft'); }
  await expect(grid.getByRole('columnheader', { name: /M1L/ }).first()).toBeAttached();
  if (width === 320) await expect.poll(() => grid.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
  const headers = await grid.locator(".compact-lesson-group").allTextContents();
  expect(headers.findIndex(text => text.includes("M1L"))).toBeLessThan(headers.findIndex(text => text.includes("M2L")));
  if (width === 320) {
    const movement = await grid.evaluate(el => {
      el.scrollTo({ left: 100, behavior: "instant" });
      const before = el.scrollLeft;
      el.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
      return el.scrollLeft - before;
    });
    expect(movement).toBeGreaterThanOrEqual(119);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
});
