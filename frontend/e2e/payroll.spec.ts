import { expect, test } from "@playwright/test";

for (const width of [390, 1440]) {
  test(`folha oficial pode ser comparada e ativada na demonstração (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const privateRequests: string[] = [];
    page.on("request", request => { if (/firestore.googleapis|identitytoolkit|\/api\/kodland/.test(request.url())) privateRequests.push(request.url()); });
    await page.goto("/demo#payments");
    const panel = page.getByRole("region", { name: "Folha oficial Kodland" });
    await expect(panel).toBeVisible();
    await panel.getByText(/Comparar competências/).click();
    await expect(panel.getByRole("cell", { name: "R$ 30,00", exact: true })).toBeVisible();
    await panel.getByRole("button", { name: "Usar valores oficiais", exact: true }).click();
    await expect(panel.getByRole("button", { name: "Usar projeção local", exact: true })).toBeVisible();
    await expect(panel.getByRole("cell", { name: "Fonte oficial", exact: true })).toBeVisible();
    await page.reload();
    await expect(panel.getByRole("button", { name: "Usar projeção local", exact: true })).toBeVisible();
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(dimensions.scroll).toBeLessThanOrEqual(dimensions.width + 1);
    await page.screenshot({ path: `test-results/payroll-${width}.png`, fullPage: true });
    expect(privateRequests).toEqual([]);
  });
}
