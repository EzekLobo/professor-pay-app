import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`extrato cabe na tela e permite alcançar todas as ações (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/demo#payments");
    await page.evaluate(() => localStorage.setItem("nexusclass:modal-guide:demo-payment-statement:v2", "1"));
    await page.getByRole("button", { name: "Usar valores oficiais", exact: true }).click();
    await expect(page.getByRole("button", { name: "Usar projeção local", exact: true })).toBeVisible();
    await page.locator(".payment-carousel-card.is-focus").click();
    const statement = page.getByRole("dialog", { name: /^Extrato/ });
    await expect(statement).toBeVisible();
    await expect(statement.getByRole("region", { name: "Origem dos valores" })).toContainText("Kodland · oficial");
    await expect(statement.getByText("Contabilizada", { exact: true })).toHaveCount(0);
    await expect(statement.getByText("Sobre as situações oficiais", { exact: true })).toHaveCount(0);
    const geometry = await statement.evaluate(element => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, right: rect.right, left: rect.left, width: element.clientWidth, content: element.scrollWidth };
    });
    expect(geometry.top).toBeGreaterThanOrEqual(0);
    expect(geometry.bottom).toBeLessThanOrEqual(844);
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(width);
    expect(geometry.content).toBeLessThanOrEqual(geometry.width + 1);
    const heights = await statement.locator(".payment-breakdown > div").evaluateAll(elements => elements.map(element => element.getBoundingClientRect().height));
    expect(Math.max(...heights)).toBeLessThan(120);
    await statement.getByRole("button", { name: "Confirmar recebimento", exact: true }).scrollIntoViewIfNeeded();
    await expect(statement.getByRole("button", { name: "Confirmar recebimento", exact: true })).toBeInViewport();
    await page.screenshot({ path: `test-results/statement-${width}.png` });
    await statement.getByRole("button", { name: "Fechar", exact: true }).click();
    await expect(statement).not.toBeVisible();
  });
}
