import { expect, type Page } from "@playwright/test";

export async function openDemoOfficialStatement(page: Page) {
  const paymentLabel = await page.evaluate(() => {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Sao_Paulo",
      year: "numeric",
      month: "2-digit",
    }).formatToParts(new Date());
    const year = Number(parts.find((part) => part.type === "year")?.value);
    const month = Number(parts.find((part) => part.type === "month")?.value);
    const date = new Date(Date.UTC(year, month, 15, 12));
    const monthLabel = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
      month: "short",
    }).format(date).replace(".", "");
    const formattedDate = new Intl.DateTimeFormat("pt-BR", {
      timeZone: "America/Sao_Paulo",
    }).format(date);
    return `${monthLabel[0].toUpperCase()}${monthLabel.slice(1)} - ${formattedDate}`;
  });
  const expectedLabel = `Abrir extrato de ${paymentLabel}`;
  const focused = page.locator(".payment-carousel-card.is-focus");
  for (let step = 0; step < 12; step++) {
    const currentLabel = await focused.getAttribute("aria-label");
    if (currentLabel === expectedLabel) break;
    const next = page.getByRole("button", { name: "Próxima competência", exact: true });
    await expect(next).toBeEnabled();
    await next.click();
    await expect(focused).not.toHaveAttribute("aria-label", currentLabel ?? "");
  }
  await expect(focused).toHaveAttribute("aria-label", expectedLabel);
  await focused.click();
  const statement = page.getByRole("dialog", { name: /^Extrato/ });
  await expect(statement).toBeVisible();
  return statement;
}
