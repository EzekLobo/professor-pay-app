import { test, expect } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
const fixture = path.resolve(process.cwd(), process.cwd().endsWith("frontend") ? "src/app/qa-payment-loading" : "frontend/src/app/qa-payment-loading");
let created = false;
test.beforeAll(async () => {
  await mkdir(fixture); created = true;
  await writeFile(`${fixture}/page.tsx`, `"use client";
import { PaymentsContent, type PaymentsAdapter } from "@/components/payments-page";
import type { DashboardPayment } from "@/lib/api";
let release: (() => void) | undefined;
const payment: DashboardPayment = { payment_date: "2026-11-15", period: "2026-10", lesson_count: 1, normal_count: 1, extra_count: 0, normal_total_cents: 12345, extra_total_cents: 0, total_cents: 12345, status: "EXPECTED", lessons: [] };
const noop = async () => undefined;
const adapter: PaymentsAdapter = { list: async () => { await new Promise<void>(done => { release = done; }); return { items: [payment] }; }, get: async () => { throw new Error("unused"); }, updateLessonFinancialStatus: noop, setStatus: noop, reverse: noop, confirm: noop, createExtra: noop };
export default function Fixture() { return <main><button onClick={() => release?.()}>Liberar consulta de teste</button><PaymentsContent adapter={adapter} /></main>; }
`);
});
test.afterAll(async () => { if (created) await rm(fixture, { recursive: true, force: true }); });
test("aguarda a consulta antes de exibir totais financeiros", async ({ page }) => {
  await page.goto("/qa-payment-loading");
  await expect(page.getByRole("status")).toHaveText(/Atualizando pagamentos/);
  await expect(page.locator(".metric-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Liberar consulta de teste" }).click();
  await expect(page.locator(".payment-metric-grid")).toContainText("123,45");
  await expect(page.getByText("Atualizando pagamentos…")).toHaveCount(0);
});
