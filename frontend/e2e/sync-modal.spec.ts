import { expect, test } from "@playwright/test";

for (const width of [320, 1440]) {
  test(`modal de sincronização cabe na tela e mantém ações acessíveis (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 700 });
    await page.goto("/demo#settings");
    await page.getByRole("tab", { name: "Integrações", exact: true }).click();
    await page.getByText("Kodland", { exact: true }).click();
    await page.getByRole("button", { name: "Salvar", exact: true }).click();
    await expect(page.getByText("Configurações salvas.", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Dados e backup", exact: true }).click();
    await page.getByRole("button", { name: "Sincronizar tudo", exact: true }).click();
    const modal = page.getByRole("dialog", { name: "Sincronizar aplicação" });
    await expect(modal).toBeVisible();
    const geometry = await modal.evaluate(element => {
      const r = element.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, width: element.clientWidth, content: element.scrollWidth };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(700);
    expect(geometry.content).toBeLessThanOrEqual(geometry.width + 1);
    await expect(modal.getByRole("button", { name: "Sincronizar tudo", exact: true })).toBeInViewport();
    await modal.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(modal).not.toBeVisible();
  });
}
