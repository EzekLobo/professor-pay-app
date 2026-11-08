import { test, expect } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
const fixture = path.resolve(process.cwd(), process.cwd().endsWith("frontend") ? "src/app/qa-activity-loading" : "frontend/src/app/qa-activity-loading");
let created = false;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
  await mkdir(fixture); created = true;
  await writeFile(`${fixture}/page.tsx`, `"use client";
import { useState } from "react";
import { CorrectionsContent } from "@/components/corrections-page";
import { kodlandApi } from "@/lib/api";
import { notifyStudentNotificationsChanged } from "@/lib/student-notification-store";
let blocked = false;
const empty = async () => ({ items: [] });
kodlandApi.browserState = async () => ({ active: true }) as never;
kodlandApi.reviews = async () => { if (blocked) await new Promise(() => undefined); return { items: [] }; };
kodlandApi.groups = empty; kodlandApi.students = empty; kodlandApi.lessons = empty; kodlandApi.attendance = empty; kodlandApi.taskProgress = empty;
export default function Fixture() {
 const [open, setOpen] = useState(false);
 return <main><button onClick={() => { blocked = false; setOpen(true); }}>Abrir atividades</button><button onClick={() => { blocked = true; setOpen(true); notifyStudentNotificationsChanged(); }}>Simular consulta sem resposta</button><button onClick={() => { blocked = false; }}>Restabelecer serviço</button>{open && <CorrectionsContent preferenceKey="loading-fixture" />}</main>;
}
`);
});
test.afterAll(async () => { if (created) await rm(fixture, { recursive: true, force: true }); });
for (const width of [390, 1440]) test(`consulta pendente não bloqueia a lista e permite recuperação (${width}px)`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.goto("/qa-activity-loading");
  await page.getByRole("button", { name: "Abrir atividades", exact: true }).click();
  const empty = page.getByText("Nenhum aluno ou atividade para os filtros atuais.", { exact: true });
  await expect(empty).toBeVisible();
  await page.clock.install();
  await page.getByRole("button", { name: "Simular consulta sem resposta" }).click();
  await expect(page.getByRole("status")).toHaveText(/Atualizando atividades e presença em segundo plano/);
  await expect(empty).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(page.locator(".activity-load-error")).toContainText("não respondeu no prazo");
  await expect(empty).toBeVisible();
  await expect(page.getByText("Carregando correções…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restabelecer serviço" }).click();
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.locator(".activity-load-error")).toHaveCount(0);
  await expect(empty).toBeVisible();
});
test("carregamento inicial sem resposta termina com erro recuperável", async ({ page }) => {
  await page.goto("/qa-activity-loading");
  await page.clock.install();
  await page.getByRole("button", { name: "Simular consulta sem resposta" }).click();
  await expect(page.getByText("Carregando correções…", { exact: true })).toBeVisible();
  await page.clock.fastForward(16000);
  await expect(page.locator(".activity-load-error")).toContainText("não respondeu no prazo");
  await expect(page.getByText("Carregando correções…", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Restabelecer serviço" }).click();
  await page.getByRole("button", { name: "Tentar novamente", exact: true }).click();
  await expect(page.getByText("Nenhum aluno ou atividade para os filtros atuais.", { exact: true })).toBeVisible();
  await expect(page.locator(".activity-load-error")).toHaveCount(0);
});
