import { expect, test } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true });

for (const width of [320, 390]) for (const route of ["dashboard", "payments"]) {
  test(`competências aceitam arraste no cartão e toque (${route}, ${width}px)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/demo#${route}`);
    const card = page.locator(".payment-carousel-card.is-focus");
    await card.scrollIntoViewIfNeeded();
    const original = await card.getAttribute("aria-label");
    const client = await context.newCDPSession(page);
    const swipe = async (direction: number) => {
      await card.scrollIntoViewIfNeeded();
      const box = (await card.boundingBox())!;
      const x = box.x + box.width * (direction > 0 ? .15 : .85), y = box.y + 25;
      await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (let i = 1; i <= 5; i++) {
        await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + direction * box.width * .7 * i / 5, y }] });
        await page.waitForTimeout(30);
      }
      await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      // Separate successive native gestures; Chromium suppresses taps during a fling.
      await page.waitForTimeout(350);
    };
    await swipe(1);
    await expect(card).not.toHaveAttribute("aria-label", original!);
    await expect(page.getByRole("dialog", { name: /^Extrato/ })).not.toBeVisible();
    await swipe(-1);
    await expect(card).toHaveAttribute("aria-label", original!);
    await page.getByRole("button", { name: "Competência anterior", exact: true }).tap();
    await expect(card).not.toHaveAttribute("aria-label", original!);
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    const point = { x: box.x + box.width / 2, y: box.y + 20 };
    await page.touchscreen.tap(point.x, point.y);
    await expect(page.getByRole("dialog", { name: /^Extrato/ })).toBeVisible();
  });
}

test("grade mostra atualização e legenda somente ao consultar informações", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/demo#dashboard");
  await expect(page.getByLabel("Legenda da grade")).not.toBeVisible();
  await page.getByRole("button", { name: "Informações da grade", exact: true }).click();
  const info = page.getByRole("dialog", { name: "Informações da grade", exact: true });
  await expect(info).toBeVisible();
  await expect(info.getByLabel("Legenda da grade")).toBeVisible();
  await expect(info).toContainText(/atualiza/i);
});
