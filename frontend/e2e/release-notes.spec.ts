import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) {
  test(`novidades podem ser consultadas e fechadas em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    const privateCalls: string[] = [];
    page.on("request", (request) => { if (/firestore.googleapis.com|identitytoolkit.googleapis.com|api\/account/.test(request.url())) privateCalls.push(request.url()); });
    await page.goto("/demo");
    const trigger = page.getByRole("button", { name: /^Abrir novidades/ });
    await expect(trigger).toBeEnabled();
    await expect(page.getByRole("button", { name: "Abrir calendário de feriados", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: "Novidades do NexusClass" })).not.toBeVisible();
    await trigger.click();
    const dialog = page.getByRole("region", { name: "Novidades do NexusClass" });
    await expect(dialog).toBeVisible();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(dialog.getByRole("heading", { name: "Entre com um nick", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const box = await dialog.boundingBox();
    expect(box!.height).toBeLessThanOrEqual(900);
    expect(box!.width).toBeLessThanOrEqual(width);
    await dialog.getByRole("button", { name: "Entendi", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await expect(trigger).toHaveAttribute("aria-label", "Abrir novidades");
    await page.reload();
    await expect(trigger).toBeEnabled();
    await expect(trigger).toHaveAttribute("aria-label", "Abrir novidades");
    await trigger.click();
    await expect(dialog.getByRole("heading", { name: "Entre com um nick", exact: true })).toBeVisible();
    await dialog.getByRole("link", { name: "Definir meu nick" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page).toHaveURL(/demo#settings$/);
    await trigger.click();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await trigger.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(4, 300);
    await expect(dialog).not.toBeVisible();
    expect(privateCalls).toEqual([]);
  });
}
