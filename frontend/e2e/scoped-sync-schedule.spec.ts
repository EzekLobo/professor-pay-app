import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "vite";

let fixtureScript: string;
let styles: string;

test.beforeAll(async () => {
  // Bundling the test-only fixture has its own cold-start budget; interaction timeouts stay unchanged.
  test.setTimeout(90_000);
  const result = await build({
    configFile: false,
    root: process.cwd(),
    logLevel: "silent",
    resolve: { alias: { "@": resolve("src") } },
    define: { "process.env.NODE_ENV": JSON.stringify("production"), "process.env": "{}" },
    build: { write: false, minify: false, lib: { entry: resolve("e2e/fixtures/schedule-call.tsx"), formats: ["iife"], name: "ScheduleCallFixture" } },
  }) as { output: Array<{ type: string; code?: string }> } | Array<{ output: Array<{ type: string; code?: string }> }>;
  const outputs = Array.isArray(result) ? result : [result];
  fixtureScript = outputs.flatMap(output => output.output).filter(item => item.type === "chunk").map(item => item.code).join("\n");
  styles = await readFile(resolve("src/app/globals.css"), "utf8");
});

test.use({ hasTouch: true });

for (const width of [320, 390, 1440]) {
  test(`grade abre chamada com gesto duplo e preserva detalhes (${width}px)`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install({ time: new Date("2026-10-29T20:50:00Z") });
    const external: string[] = [];
    const fixtureErrors: string[] = [];
    page.on("pageerror", error => fixtureErrors.push(error.message));
    await page.route(/https:\/\/(?:learn|bo|zoom-service)\.kodland\.org/, route => { external.push(route.request().url()); return route.abort(); });
    // Fulfilled only in this test: no Next.js hydration or product test route.
    await page.route("**/__schedule-test-fixture", route => route.fulfill({ contentType: "text/html", body: "<!doctype html><html lang='pt-BR'><body><div id='fixture-root'></div></body></html>" }));
    await page.goto("/__schedule-test-fixture");
    await page.addStyleTag({ content: styles });
    await page.evaluate(() => {
      localStorage.setItem("nexusclass:modal-guide:demo-lesson-material:v3", "1");
      window.__scheduleOpenedCalls = [];
      window.open = ((url: string | URL | undefined) => { window.__scheduleOpenedCalls.push(String(url)); return null; }) as typeof window.open;
    });
    await page.addScriptTag({ content: fixtureScript });
    const details = page.getByRole("button", { name: "Abrir detalhes de Turma de teste", exact: true });
    const icon = page.getByRole("link", { name: "Chamada disponível para Abrir detalhes de Turma de teste. Abrir chamada", exact: true });
    await expect(icon, fixtureErrors.join("\n")).toBeVisible();
    await icon.scrollIntoViewIfNeeded();
    await expect(icon).toBeInViewport();
    const box = await icon.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    expect(size.scroll).toBeLessThanOrEqual(size.width + 1);
    await page.screenshot({ path: `test-results/scoped-sync-schedule-${width}.png`, fullPage: true });

    await details.click();
    await page.clock.runFor(310);
    const modal = page.getByRole("dialog", { name: /Turma de teste/ });
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("link", { name: "Abrir chamada", exact: true })).toBeVisible();
    await modal.getByRole("button", { name: "Fechar", exact: true }).click();
    await details.dblclick({ delay: 50 });
    await page.clock.runFor(350);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => window.__scheduleOpenedCalls)).toEqual(["https://learn.kodland.org/pt/class-room?sessionId=fixture-session"]);

    await details.tap();
    await details.tap();
    await page.clock.runFor(350);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await page.evaluate(() => window.__scheduleOpenedCalls)).toHaveLength(2);

    const extraDetails = page.getByRole("button", { name: "Abrir detalhes de Aluna extra de teste", exact: true });
    await extraDetails.click();
    await page.clock.runFor(310);
    const extraModal = page.getByRole("dialog", { name: "Aula extra · Aluna extra de teste", exact: true });
    await expect(extraModal.getByRole("link", { name: "Abrir chamada", exact: true })).toBeVisible();
    await extraModal.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.evaluate(() => window.__scheduleFixturePatch("lesson", { start_time: "18:05" }));
    await expect(icon).toHaveCount(0);
    await details.click();
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("link", { name: "Abrir chamada", exact: true })).toHaveCount(0);
    await modal.getByRole("button", { name: "Fechar", exact: true }).click();

    await page.evaluate(() => window.__scheduleFixturePatch("lesson", { start_time: "18:00", status: "CANCELED" }));
    await expect(icon).toHaveCount(0);
    await page.evaluate(() => window.__scheduleFixturePatch("lesson", { status: "PLANNED" }));
    await expect(icon).toBeVisible();
    await page.clock.fastForward(71 * 60_000);
    await expect(icon).toHaveCount(0);
    expect(external).toEqual([]);
  });
}
