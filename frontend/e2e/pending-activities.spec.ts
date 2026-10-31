import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  test(`filtro de pendências oculta alunos e campos vazios e mantém preferência (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo#settings");
    await page.getByRole("tab", { name: "Integrações", exact: true }).click();
    await page.getByText("Kodland", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: /Kodland/ })).toBeChecked();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Configurações salvas.", { exact: true })).toBeVisible();
    if (width <= 720) await page.getByRole("button", { name: "Mais opções", exact: true }).click();
    await page.getByRole("link", { name: "Acompanhamento", exact: true }).click();
    await page.getByRole("button", { name: "Compacto", exact: true }).click();
    await page.getByRole("button", { name: "Abrir filtros" }).click();
    const filter = page.getByRole("combobox", { name: "Filtrar atividades", exact: true });
    await expect(filter).toHaveValue("pending");
    await page.getByRole("button", { name: "Concluir", exact: true }).click();
    const group = page.locator("details.compact-activities-class").first();
    await group.locator("summary").click();
    const pendingRows = await group.locator(".compact-pending-row").count();
    expect(pendingRows).toBeGreaterThan(0);
    expect(await group.locator(".attendance-student-summary").allTextContents()).not.toEqual(expect.arrayContaining([expect.stringContaining("@")]));
    if (width <= 760) {
      const list = group.locator(".compact-pending-list");
      expect(await list.evaluate(el => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
      const student = await group.locator(".attendance-student-summary").first().boundingBox();
      const action = await group.locator(".compact-activity-action").first().boundingBox();
      expect(action!.y).toBeGreaterThanOrEqual(student!.y + student!.height);
      expect(action!.height).toBeGreaterThanOrEqual(44);
    }
    await expect(group.locator(".compact-activity-empty")).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
    await page.screenshot({ path: `test-results/pending-activities-${width}.png`, fullPage: true });
    await page.getByRole("button", { name: "Abrir filtros" }).click();
    await filter.selectOption("all");
    await page.getByRole("button", { name: "Concluir", exact: true }).click();
    await expect.poll(() => group.locator(".attendance-grid-row").count()).toBeGreaterThan(pendingRows);
    await expect.poll(() => group.locator(".compact-activity-empty").count()).toBeGreaterThan(0);
    await page.reload();
    await page.getByRole("button", { name: "Abrir filtros" }).click();
    await expect(filter).toHaveValue("all");
    await filter.selectOption("pending");
    await page.reload();
    await page.getByRole("button", { name: "Abrir filtros" }).click();
    await expect(filter).toHaveValue("pending");
  });
}
