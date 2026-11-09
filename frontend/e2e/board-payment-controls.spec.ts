import { expect, test } from "@playwright/test";

for (const width of [320, 390, 1440]) {
  test(`controles do quadro alinhados e adição compacta (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo#tasks");
    const toolbar = page.locator(".tasks-toolbar");
    const bounds = await Promise.all(["Listas", "Filtros", "Ver arquivo", "Buscar tarefas"].map(name => toolbar.getByRole("button", { name, exact: true }).boundingBox()));
    for (const box of bounds) expect(Math.abs(box!.y + box!.height / 2 - (bounds[0]!.y + bounds[0]!.height / 2))).toBeLessThanOrEqual(1);
    const add = page.getByRole("button", { name: "Adicionar tarefa em A fazer", exact: true });
    const dimensions = await add.evaluate(element => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element, "::before");
      return { width: box.width, height: box.height, inset: parseFloat(style.left) };
    });
    expect(dimensions.width).toBeGreaterThanOrEqual(44);
    expect(dimensions.width - dimensions.inset * 2).toBeLessThanOrEqual(28);
    await expect(page.getByRole("button", { name: /^(Subir|Descer) / })).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 390) await page.screenshot({ path: "test-results/board-controls-390.png", fullPage: true });
  });

  test(`status do pagamento junto à etiqueta (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/demo#payments");
    const card = page.locator(".payment-carousel-card.is-focus");
    const badge = card.locator(".status-badge-action");
    await badge.click();
    const options = page.getByRole("region", { name: "Opções do pagamento", exact: true });
    await expect(options).toBeVisible();
    if (width === 390) await page.screenshot({ path: "test-results/payment-status-390.png", fullPage: true });
    await expect(page.getByRole("dialog", { name: "Alterar status do pagamento" })).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: /^Extrato/ })).not.toBeVisible();
    await page.keyboard.press("Escape");
    await expect(options).not.toBeVisible();
    await badge.click();
    await options.getByRole("button", { name: "Marcar como em atraso", exact: true }).click();
    await expect(options).not.toBeVisible();
    await expect(card.locator(".status-badge")).toHaveText("Em atraso");
    await card.locator(".status-badge-action").click();
    await options.getByRole("button", { name: "Marcar como pago", exact: true }).click();
    await expect(card.locator(".status-badge")).toHaveText("Recebido");
    await expect(page.getByRole("dialog", { name: /^Extrato/ })).not.toBeVisible();
  });
}

test("arraste move o cartão inteiro entre listas e ordena antes ou depois", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/demo#tasks");
  for (const title of ["Arraste primeiro", "Arraste segundo"]) {
    await page.getByRole("button", { name: "Adicionar tarefa em A fazer", exact: true }).click();
    const editor = page.getByRole("dialog", { name: "Nova tarefa", exact: true });
    await editor.getByLabel("Título", { exact: true }).fill(title);
    await editor.getByRole("button", { name: "Salvar tarefa", exact: true }).click();
    await expect(editor).not.toBeVisible();
  }
  const first = page.locator(".task-card").filter({ has: page.getByRole("button", { name: "Arraste primeiro", exact: true }) });
  const second = page.locator(".task-card").filter({ has: page.getByRole("button", { name: "Arraste segundo", exact: true }) });
  const doing = page.getByRole("region", { name: "Em andamento", exact: true });
  await page.evaluate(() => {
    const setImage = DataTransfer.prototype.setDragImage;
    DataTransfer.prototype.setDragImage = function(element, x, y) {
      document.body.dataset.dragPreview = element.classList.contains("task-card") ? "card" : "other";
      setImage.call(this, element, x, y);
    };
  });
  await first.locator(".task-drag-handle").dragTo(doing.locator(".tasks-column-heading"));
  await expect(page.locator("body")).toHaveAttribute("data-drag-preview", "card");
  await expect(doing.getByRole("button", { name: "Arraste primeiro", exact: true })).toBeVisible();
  await second.locator(".task-drag-handle").dragTo(first, { targetPosition: { x: 20, y: 5 } });
  await expect(doing.locator(".task-title-button")).toHaveText(["Arraste segundo", "Arraste primeiro"]);
  await second.locator(".task-drag-handle").dragTo(first, { targetPosition: { x: 20, y: (await first.boundingBox())!.height - 5 } });
  await expect(doing.locator(".task-title-button")).toHaveText(["Arraste primeiro", "Arraste segundo"]);
  await page.reload();
  await expect(doing.locator(".task-title-button")).toHaveText(["Arraste primeiro", "Arraste segundo"]);
});
