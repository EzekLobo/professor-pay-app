import { expect, test } from "@playwright/test";

const demoRoutes = ["dashboard", "payments", "classes", "lessons", "corrections", "data"];

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "celular", width: 390, height: 844 },
]) {
  test(`layout não estoura a viewport em ${viewport.name}`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    for (const route of demoRoutes) {
      await page.goto(`/demo#${route}`);
      await expect(page.getByText("Demonstração — dados fictícios")).toBeVisible();
      const dimensions = await page.evaluate(() => ({
        clientWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      expect(dimensions.scrollWidth, `estouro horizontal em ${route}`).toBeLessThanOrEqual(dimensions.clientWidth + 1);
    }
  });
}

test("navegação móvel mantém todas as áreas visíveis e identificadas", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo#data");
  const navigation = page.getByRole("navigation", { name: "Navegação principal" });
  for (const label of ["Resumo", "Pagamentos", "Turmas", "Aulas", "Acompanhamento", "Dados e backup"]) {
    const link = navigation.getByRole("link", { name: label });
    await expect(link).toBeVisible();
    await expect(link).toBeInViewport();
  }
  await expect(navigation.getByRole("link", { name: "Dados e backup" })).toHaveAttribute("aria-current", "page");
});

test("atalho de teclado e importação possuem nomes acessíveis", async ({ page }) => {
  await page.goto("/demo#data");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Pular para o conteúdo" })).toBeFocused();
  await expect(page.getByLabel("Arquivo de backup JSON")).toBeVisible();
});
