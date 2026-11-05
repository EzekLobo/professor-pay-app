import { expect, test } from "@playwright/test";

test.use({ hasTouch: true, isMobile: true });

for (const width of [320, 390]) for (const route of ["dashboard", "payments"]) {
  test(`competências aceitam arraste no cartão e toque (${route}, ${width}px)`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/demo#${route}`);
    const card = page.locator(".payment-carousel-card.is-focus");
    const previous = page.getByRole("button", { name: "Competência anterior", exact: true });
    const next = page.getByRole("button", { name: "Próxima competência", exact: true });
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
    const firstDirection = await previous.isDisabled() ? -1 : 1;
    await swipe(firstDirection);
    await expect(card).not.toHaveAttribute("aria-label", original!);
    await expect(page.getByRole("dialog", { name: /^Extrato/ })).not.toBeVisible();
    await swipe(-firstDirection);
    await expect(card).toHaveAttribute("aria-label", original!);
    await (firstDirection > 0 ? previous : next).tap();
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

for (const width of [320, 1440]) test(`última atualização permanece visível no cabeçalho da grade (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto('/demo#dashboard');
  const heading = page.locator('.week-section-heading');
  const title = heading.getByRole('heading', { name: 'Grade de horários' });
  const timestamp = heading.locator('.week-header-updated');
  const info = heading.getByRole('button', { name: 'Informações da grade' });
  await expect(timestamp).toContainText('Última atualização:');
  await expect(timestamp.locator('time')).toBeVisible();
  const [left, middle, right] = await Promise.all([title.boundingBox(), timestamp.boundingBox(), info.boundingBox()]);
  expect(middle!.x).toBeGreaterThanOrEqual(left!.x + left!.width - 1);
  expect(middle!.x + middle!.width).toBeLessThanOrEqual(right!.x + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
