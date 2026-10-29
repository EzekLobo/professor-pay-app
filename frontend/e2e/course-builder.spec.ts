import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) {
  test(`editor de curso compacto preserva materiais e valida aulas fechadas em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/demo#lessons");
    await page.getByRole("button", { name: "Criar novo curso", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Criar novo curso", exact: true });
    await dialog.getByLabel("Nome do curso", { exact: true }).fill("Programação revisada");
    await dialog.getByLabel("Quantidade de módulos").fill("5");
    await dialog.getByLabel("Aulas por módulo").fill("4");
    await dialog.getByRole("button", { name: "Gerar estrutura", exact: true }).click();
    await expect(dialog.locator(".manual-course-module[open]")).toHaveCount(1);
    await expect(dialog.getByLabel("Atividades", { exact: true })).toBeVisible();
    await dialog.getByLabel("Atividades", { exact: true }).fill("Construir um jogo");
    await dialog.getByLabel("Slides (link)").fill("link-incorreto");
    await dialog.locator(".manual-course-module").nth(1).locator(":scope > summary").click();
    await expect(dialog.getByLabel("Atividades", { exact: true })).not.toBeVisible();
    await dialog.getByRole("button", { name: "Salvar curso", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("link http(s) válido");
    await expect(dialog.getByLabel("Slides (link)")).toBeVisible();
    await expect(dialog.getByLabel("Atividades", { exact: true })).toHaveValue("Construir um jogo");
    await dialog.getByLabel("Slides (link)").fill("https://example.com/slides");
    await dialog.getByRole("button", { name: "Remover aula", exact: true }).click();
    const removal = page.getByRole("dialog", { name: "Remover aula", exact: true });
    await removal.getByRole("button", { name: "Cancelar", exact: true }).click();
    await expect(dialog.getByLabel("Atividades", { exact: true })).toHaveValue("Construir um jogo");
    expect(await dialog.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
    const save = await dialog.getByRole("button", { name: "Salvar curso", exact: true }).boundingBox();
    expect(save).not.toBeNull();
    expect(save!.y + save!.height).toBeLessThanOrEqual(800);
    await page.screenshot({ path: `/tmp/course-builder-${width}.png` });
    await dialog.getByRole("button", { name: "Salvar curso", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    const card = page.locator(".manual-course-card").filter({ hasText: "Programação revisada" });
    await card.locator(":scope > summary").click();
    await expect(card).toContainText("20 aulas");
    await card.getByRole("button", { name: "Editar curso", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Editar curso", exact: true });
    await expect(editor.getByLabel("Atividades", { exact: true })).toHaveValue("Construir um jogo");
  });
}
