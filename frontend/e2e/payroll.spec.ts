import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`projeção Kodland é automática e não exige painel de configuração (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const privateRequests: string[] = [];
    page.on("request", request => { if (/firestore.googleapis|identitytoolkit|\/api\/kodland/.test(request.url())) privateRequests.push(request.url()); });
    await page.goto("/demo#payments");
    await expect(page.getByRole("region", { name: "Folha oficial Kodland" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Usar valores oficiais", exact: true })).toHaveCount(0);
    await page.evaluate(() => localStorage.setItem("nexusclass:modal-guide:demo-payment-statement:v2", "1"));
    await page.locator(".payment-carousel-card.is-focus").click();
    const statement = page.getByRole("dialog", { name: /^Extrato/ });
    await expect(statement.getByRole("region", { name: "Origem dos valores" })).toContainText("Kodland · oficial");
    await expect(statement.getByText("Folha fictícia", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Usar projeção local", exact: true })).toHaveCount(0);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
    await page.screenshot({ path: `test-results/payroll-${width}.png`, fullPage: true });
    expect(privateRequests).toEqual([]);
  });
}
