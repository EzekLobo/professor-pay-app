import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  test(`dados e backup organizam arquivos sem sobreposição (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const privateRequests: string[] = [];
    page.on("request", request => { if (/firestore.googleapis|identitytoolkit|\/api\/kodland/.test(request.url())) privateRequests.push(request.url()); });
    await page.goto("/demo#settings");
    await page.getByRole("tab", { name: "Dados e backup", exact: true }).click();
    await expect(page.getByRole("link", { name: "Dados e backup", exact: true })).toHaveCount(0);
    const backup = page.getByRole("region", { name: "Backup completo" });
    const csv = page.getByRole("region", { name: "Planilhas CSV" });
    await expect(backup).toBeVisible();
    await expect(csv).toBeVisible();
    await expect(backup.getByRole("button", { name: "Baixar JSON" })).toBeVisible();
    await expect(page.locator("details.data-danger-zone")).not.toHaveAttribute("open", "");
    await expect(csv.locator("details.data-format-help")).not.toHaveAttribute("open", "");
    const boxes = await Promise.all([backup.boundingBox(), csv.boundingBox()]);
    if (width === 1440) {
      expect(Math.abs(boxes[0]!.y - boxes[1]!.y)).toBeLessThan(2);
      expect(Math.abs(boxes[0]!.height - boxes[1]!.height)).toBeLessThan(2);
      expect(boxes[0]!.x + boxes[0]!.width).toBeLessThan(boxes[1]!.x);
    } else expect(boxes[1]!.y).toBeGreaterThan(boxes[0]!.y + boxes[0]!.height);
    const dimensions = await page.evaluate(() => ({ width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth }));
    expect(dimensions.content).toBeLessThanOrEqual(dimensions.width + 1);
    await page.screenshot({ path: `test-results/data-${width}.png`, fullPage: true });
    await csv.getByLabel("Arquivo CSV para importação").setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("nome,email\n,teste@example.test") });
    await expect(csv.getByRole("button", { name: "Confirmar importação" })).toBeDisabled();
    expect(privateRequests).toEqual([]);
  });
}
