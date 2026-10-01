import { expect, test } from "@playwright/test";

test("rota privada redireciona visitante para login", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);
  await expect(page.getByRole("heading", { name: /bem-vindo de volta/i })).toBeVisible();
});

test("rota de cadastro redireciona para login", async ({ page }) => {
  await page.goto("/register");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByText(/acesso é liberado pelo administrador/i)).toBeVisible();
});
