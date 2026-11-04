import { expect, test } from "@playwright/test";
for (const width of [320, 1440]) {
 test(`turmas reúne alunos, atividades, presença e gestão (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto('/demo#classes');
  const tabs = page.getByRole('tablist', { name: 'Áreas de turmas' });
  await expect(tabs.getByRole('tab', { name: 'Alunos' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Alunos' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar grupo' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar turma' })).toBeVisible();
  await tabs.getByRole('tab', { name: 'Presença' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Presença' })).toBeVisible();
  await tabs.getByRole('tab', { name: 'Alunos' }).click();
  await expect(page.getByRole('tabpanel', { name: 'Alunos' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 });
}
