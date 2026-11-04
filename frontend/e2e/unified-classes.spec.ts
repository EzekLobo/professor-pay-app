import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  test(`Turmas reúne atividades, presença e alunos e mantém atalhos (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo#corrections");
    await expect(page).toHaveURL(/#classes$/);
    await expect(page.getByRole("link", { name: "Acompanhamento", exact: true })).toHaveCount(0);
    const tablist = page.getByRole("tablist", { name: "Áreas de turmas" });
    for (const name of ["Atividades", "Presença", "Alunos"]) await expect(tablist.getByRole("tab", { name, exact: true })).toBeVisible();
    await expect(tablist.getByRole("tab", { name: "Atividades", exact: true })).toHaveAttribute("aria-selected", "true");
    await page.evaluate(() => document.fonts.ready);
    const tabBounds = await tablist.getByRole("tab").evaluateAll(buttons => buttons.map(button => {
      const bounds = button.getBoundingClientRect();
      const text = document.createRange();
      text.selectNodeContents(button);
      const label = text.getBoundingClientRect();
      return { left: bounds.left, right: bounds.right, textLeft: label.left, textRight: label.right };
    }));
    for (const [index, bounds] of tabBounds.entries()) {
      expect(bounds.textLeft).toBeGreaterThanOrEqual(bounds.left + 3);
      expect(bounds.textRight).toBeLessThanOrEqual(bounds.right - 3);
      if (index) expect(bounds.textLeft - tabBounds[index - 1].textRight).toBeGreaterThanOrEqual(8);
    }
    await page.screenshot({ path: `test-results/unified-classes-activities-${width}.png`, fullPage: true });
    await tablist.getByRole("tab", { name: "Alunos", exact: true }).click();
    await expect(page.getByRole("button", { name: "Adicionar turma", exact: true })).toBeVisible();
    await expect(page.getByLabel("Buscar correção")).toHaveCount(0);
    await page.screenshot({ path: `test-results/unified-classes-students-${width}.png`, fullPage: true });
    await page.goto("/demo?tab=students#classes");
    await expect(tablist.getByRole("tab", { name: "Alunos", exact: true })).toHaveAttribute("aria-selected", "true");
    await tablist.getByRole("tab", { name: "Presença", exact: true }).click();
    await page.getByRole("button", { name: "Abrir filtros", exact: true }).click();
    await expect(page.getByLabel("Filtrar presença")).toBeVisible();
    await page.getByRole("button", { name: "Concluir", exact: true }).click();
    await expect(page.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "attendance-tab");
    await tablist.getByRole("tab", { name: "Atividades", exact: true }).click();
    await page.getByRole("button", { name: "Abrir busca", exact: true }).click();
    await expect(page.getByLabel("Buscar correção")).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
    await page.goto("/demo?tab=activities#classes");
    await expect(tablist.getByRole("tab", { name: "Atividades", exact: true })).toHaveAttribute("aria-selected", "true");
  });
}

test("atalho antigo preserva o foco da notificação", async ({ page }) => {
  await page.goto("/corrections?notification=sample&tab=attendance&class=Turma%20A");
  await expect(page).toHaveURL(/\/classes\?notification=sample&tab=attendance&class=Turma(?:%20|\+)A/);
});
