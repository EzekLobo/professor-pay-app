import { expect, test } from "@playwright/test";

for (const width of [1440, 390, 320]) test(`WhatsApp dos responsáveis funciona em compacto e agrupamentos em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  await page.goto("/demo#settings");
  await page.getByRole("tab", { name: "Integrações", exact: true }).click();
  await page.getByText("Kodland", { exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Kodland/ })).toBeChecked();
  await page.getByRole("button", { name: "Salvar", exact: true }).click();
  await expect(page.getByText("Configurações salvas.", { exact: true })).toBeVisible();
  await page.goto("/demo#corrections");
  await page.getByRole("button", { name: "Compacto", exact: true }).click();
  const group = page.locator("details.compact-activities-class").filter({ hasText: "DEMO_PY_SEG-19" });
  await group.locator(":scope > summary").click();
  const button = group.getByRole("button", { name: /^Mensagem aos responsáveis de/ }).first();
  await expect(button).toBeVisible();
  await button.click();
  const modal = page.getByRole("dialog", { name: "Mensagem pelo WhatsApp", exact: true });
  await expect(modal).toBeVisible();
  await expect(modal.getByLabel("WhatsApp do responsável", { exact: true })).toHaveValue("551100000000");
  await modal.getByLabel("WhatsApp do responsável", { exact: true }).fill("");
  await expect(modal.getByText("Telefone do responsável não cadastrado. Informe o número para enviar.")).toBeVisible();
  await expect(modal.getByText("Enviar no WhatsApp", { exact: true })).not.toHaveAttribute("href");
  await modal.getByLabel("WhatsApp do responsável", { exact: true }).fill("11987654321");
  await modal.getByLabel("Mensagem", { exact: true }).fill("Olá, responsável! Vamos conversar sobre as atividades?");
  await expect(modal.getByRole("link", { name: "Enviar no WhatsApp", exact: true })).toHaveAttribute("href", /^https:\/\/wa.me\/5511987654321\?text=Ol/);
  await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  const list = page.locator("[data-tour='corrections-cards'] > details").filter({ hasText: "DEMO_PY_SEG-19" });
  await list.locator(":scope > summary").click();
  for (const grouping of ["class", "student", "lesson"]) {
    await page.getByRole("button", { name: "Abrir filtros" }).click();
    await page.getByRole("combobox", { name: "Organizar atividades", exact: true }).selectOption(grouping);
    await page.getByRole("button", { name: "Concluir", exact: true }).click();
    await list.getByRole("button", { name: /^Mensagem aos responsáveis de/ }).first().click();
    await expect(modal).toBeVisible();
    await expect(modal.getByLabel("WhatsApp do responsável", { exact: true })).toHaveValue("551100000000");
    await modal.getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  const card = list.locator(".correction-card").first();
  const copy = await card.locator(".correction-card-copy").boundingBox();
  const actions = await card.locator(".card-actions").boundingBox();
  if (width <= 760) {
    expect(actions!.y).toBeGreaterThanOrEqual(copy!.y + copy!.height);
    expect(Math.abs(actions!.x + actions!.width - copy!.x - copy!.width)).toBeLessThanOrEqual(1);
  }
  else expect(actions!.x).toBeGreaterThanOrEqual(copy!.x + copy!.width);
  await page.screenshot({ path: `/tmp/nexus-activity-list-${width}.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
