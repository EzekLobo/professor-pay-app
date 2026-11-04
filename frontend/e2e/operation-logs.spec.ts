import { test, expect } from "@playwright/test";
import { mkdir, writeFile, rm, readFile } from "node:fs/promises";
import path from "node:path";

// A temporary development route exercises the real panel with a fake loader.
// It never bypasses authentication in the production admin/API and is removed after testing.
const fixture = path.resolve(process.cwd(), process.cwd().endsWith("frontend") ? "src/app/qa-operation-logs" : "frontend/src/app/qa-operation-logs");
let created = false;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await mkdir(fixture); created = true;
  await writeFile(`${fixture}/page.tsx`, `"use client";
import { OperationLogsPanel } from "@/components/operation-logs-panel";
import type { OperationLogRow } from "@/lib/operation-log";
const stamp = "2026-10-31T12:00:00.000Z";
const logs: OperationLogRow[] = [
  { id: "12345678-1234-1234-1234-123456789abc", operation: "kodland_sync", status: "error", errorCode: "network", scope: "corrections", trigger: "automatic", userId: "teacher-a", receivedAt: stamp, updatedAt: stamp, origin: "client", durationMs: 1500 },
  { id: "12345678-1234-1234-1234-123456789abd", operation: "notifications_refresh", status: "success", userId: "teacher-a", receivedAt: stamp, updatedAt: stamp, origin: "client", counts: { alerts: 4, pending: 2 } },
  { id: "12345678-1234-1234-1234-123456789abe", operation: "kodland_sync", status: "success", userId: "teacher-b", receivedAt: stamp, updatedAt: stamp, origin: "client", durationMs: 450 }
];
let failed = false;
async function loader(days: number) { if (days === 30 && !failed) { failed = true; throw new Error("Falha de teste na consulta"); } return { logs, generatedAt: stamp, truncated: false, days }; }
export default function Fixture() { return <main style={{ padding: 12 }}><OperationLogsPanel users={[{ id: "teacher-a", name: "Marina" }, { id: "teacher-b", name: "Bruno" }]} loader={loader} /></main>; }
`);
});
test.afterAll(async () => { if (created) await rm(fixture, { recursive: true, force: true }); });

for (const width of [1440, 390, 320]) test(`diagnóstico permite consultar, filtrar, exportar e recuperar erros em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 850 });
  await page.goto("/qa-operation-logs");
  const panel = page.getByRole("region", { name: "Diagnóstico de operações", exact: true });
  await expect(panel.locator(".operation-log-card")).toHaveCount(3);
  await panel.getByRole("combobox", { name: "Resultado", exact: true }).selectOption("error");
  await expect(panel.locator(".operation-log-card")).toHaveCount(1);
  await panel.locator(".operation-log-card > summary").click();
  await expect(panel.getByText("Falha de conexão", { exact: true })).toBeVisible();
  await expect(panel.getByText("Presença e atividades", { exact: true })).toBeVisible();
  await panel.getByRole("combobox", { name: "Resultado", exact: true }).selectOption("");
  await panel.getByRole("combobox", { name: "Usuário", exact: true }).selectOption("teacher-a");
  await expect(panel.locator(".operation-log-card")).toHaveCount(2);
  const download = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Exportar registros filtrados", exact: true }).click();
  const result = await download; expect(result.suggestedFilename()).toBe("nexusclass-diagnostico.json");
  const downloaded = `/tmp/operation-log-${width}.json`; await result.saveAs(downloaded);
  expect(JSON.parse(await readFile(downloaded, "utf8")).logs).toHaveLength(2);
  await panel.getByRole("combobox", { name: "Operação", exact: true }).selectOption("task_save");
  await expect(panel.getByText(/Nenhum registro para os filtros/)).toBeVisible();
  await panel.getByRole("combobox", { name: "Operação", exact: true }).selectOption("");
  await panel.getByRole("combobox", { name: "Período", exact: true }).selectOption("30");
  await expect(panel.getByRole("alert")).toContainText("Falha de teste na consulta");
  await panel.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(panel.getByRole("alert")).toHaveCount(0);
  await expect(panel.locator(".operation-log-card")).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `/tmp/operation-log-panel-${width}.png`, fullPage: true });
});
