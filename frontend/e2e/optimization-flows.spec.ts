import { expect, test } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
const fixture = path.resolve(process.cwd(), process.cwd().endsWith("frontend") ? "src/app/qa-optimization" : "frontend/src/app/qa-optimization");
let created = false;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
 await mkdir(fixture); created = true;
 await writeFile(`${fixture}/page.tsx`, `"use client";
import { useMemo, useState } from "react";
import { SettingsContent } from "@/components/settings-page";
import { PaymentsContent, type PaymentsAdapter } from "@/components/payments-page";
import { StudentNotificationsProvider, useStudentNotifications } from "@/components/student-notifications";
import { notifyStudentNotificationsChanged } from "@/lib/student-notification-store";
import { createDemoSnapshot } from "@/lib/demo-snapshot";
import { createDemoManualAdapter } from "@/lib/demo-manual-adapter";
import type { DashboardPayment, PaymentDetail } from "@/lib/api";
const snapshot = createDemoSnapshot();
const count = (key: string) => { document.documentElement.dataset[key] = String(Number(document.documentElement.dataset[key] ?? 0) + 1); };
const manual = createDemoManualAdapter(() => snapshot, () => undefined);
const adapter = { ...manual, operations: { ...manual.operations, availability: async () => { count("availability"); return manual.operations.availability(); }, occurrences: async () => { count("occurrences"); return manual.operations.occurrences(); }, ensureOccurrences: async (id: string) => { count("writes"); return manual.operations.ensureOccurrences(id); } }, teaching: { ...manual.teaching, classes: async () => { count("classes"); return manual.teaching.classes(); } } };
let blocked = false, release: (() => void) | undefined, releaseDetail: (() => void) | undefined;
const rows: DashboardPayment[] = ["2026-11-15", "2026-12-15"].map((date,index)=>({payment_date:date, period:date.slice(0,7), lesson_count:1, normal_count:1, extra_count:0, normal_total_cents:12345+index,extra_total_cents:0,total_cents:12345+index,status:"EXPECTED",lessons:[]}));
const noop = async () => undefined;
function State() { const state=useStudentNotifications(); return <output data-testid="notification-state">{state?.loading?"loading":"ready"}</output>; }
export default function Fixture() {
 const [view,setView] = useState("settings"), [revision,setRevision] = useState(0);
 const payments=useMemo<PaymentsAdapter>(()=>({list:async()=>{count("lists");if(blocked || new URLSearchParams(location.search).has("blocked")) await new Promise<void>(done=>{release=done;}); return {items:rows};}, get:async(date)=>{if(date===rows[0].payment_date) await new Promise<void>(done=>{releaseDetail=done;});return {...rows.find(row=>row.payment_date===date)!,received_at:null,confirmation_note:null} as PaymentDetail;},updateLessonFinancialStatus:noop,setStatus:noop,reverse:noop,confirm:noop,createExtra:noop}),[revision]);
 return <StudentNotificationsProvider uid="demo-profile" snapshot={snapshot}><State/><button onClick={()=>setView("payments")}>Tela financeira</button><button onClick={()=>{blocked=true;setRevision(value=>value+1);}}>Recarregar em segundo plano</button><button onClick={()=>{blocked=false;release?.();}}>Liberar consulta</button><button onClick={()=>releaseDetail?.()}>Liberar primeiro extrato</button><button onClick={()=>{for(let i=0;i<20;i++)notifyStudentNotificationsChanged("source",["ranking"]);}}>Atualizar contatos em lote</button><button onClick={()=>notifyStudentNotificationsChanged("source",["payments"])}>Atualizar financeiro</button>{view==="settings"?<SettingsContent adapter={adapter}/>:<PaymentsContent adapter={payments}/>}</StudentNotificationsProvider>;
}
`);
});
test.afterAll(async () => { if (created) await rm(fixture, { recursive: true, force: true }); });
test("configurações consultam disponibilidade somente ao abrir e não geram ocorrências", async ({ page }) => {
 await page.goto("/qa-optimization");
 await expect(page.getByRole("tab", { name: "Disponibilidade", exact: true })).toBeVisible();
 const counters=()=>page.evaluate(()=>({slots:Number(document.documentElement.dataset.availability??0),classes:Number(document.documentElement.dataset.classes??0),occurrences:Number(document.documentElement.dataset.occurrences??0),writes:Number(document.documentElement.dataset.writes??0)}));
 expect(await counters()).toEqual({slots:0,classes:0,occurrences:0,writes:0});
 await page.getByRole("tab", { name: "Disponibilidade", exact: true }).click();
 await expect.poll(counters).toEqual({slots:1,classes:1,occurrences:1,writes:0});
 await expect(page.getByText("Carregando disponibilidade…", {exact:true})).toHaveCount(0);
 await page.getByRole("tab",{name:"Aulas e pagamentos",exact:true}).click();
 await page.getByRole("tab",{name:"Disponibilidade",exact:true}).click();
 expect(await counters()).toEqual({slots:1,classes:1,occurrences:1,writes:0});
});
test("pagamentos preservam conteúdo durante recarga e recuperam timeout inicial", async ({ page }) => {
 await page.goto("/qa-optimization"); await page.getByRole("button",{name:"Tela financeira",exact:true}).click();
 const metrics=page.locator(".payment-metric-grid");await expect(metrics).toContainText("246,91");
 await page.getByRole("button",{name:"Recarregar em segundo plano",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>Number(document.documentElement.dataset.lists))).toBe(2);
 await expect(metrics).toBeVisible();await expect(page.getByText("Atualizando pagamentos…",{exact:true})).toHaveCount(0);
 await page.getByRole("button",{name:"Liberar consulta",exact:true}).click();await expect(metrics).toBeVisible();
 await page.goto("/qa-optimization?blocked=1");await page.clock.install();await page.getByRole("button",{name:"Tela financeira",exact:true}).click();
 await expect(page.getByText("Atualizando pagamentos…",{exact:true})).toBeVisible();await page.clock.runFor(10);await expect.poll(()=>page.evaluate(()=>Number(document.documentElement.dataset.lists))).toBe(1);await page.clock.fastForward(16000);
 await expect(page.locator(".form-error")).toContainText("não respondeu no prazo");
 await expect(page.getByText("Atualizando pagamentos…",{exact:true})).toHaveCount(0);
});
test("extrato mais recente prevalece quando uma resposta antiga chega atrasada", async ({ page }) => {
 await page.goto("/qa-optimization");await page.getByRole("button",{name:"Tela financeira",exact:true}).click();
 await page.getByRole("button",{name:"Ver completo",exact:true}).click();
 const rows=page.locator(".payment-complete-row");await rows.nth(0).click();await rows.nth(1).click();
 const dialog=page.getByRole("dialog",{name:"Extrato · 2026-12",exact:true});await expect(dialog).toBeVisible();
 await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(item=>item.textContent==='Liberar primeiro extrato');button?.click();});
 await expect(dialog).toBeVisible();await expect(page.getByRole("dialog",{name:"Extrato · 2026-11",exact:true})).toHaveCount(0);
});
test("eventos de pagamentos e contatos concorrentes preservam cache de notificações",async({page})=>{
 await page.goto("/qa-optimization");await expect(page.getByTestId("notification-state")).toHaveText("ready");
 await page.evaluate(()=>{const get=Storage.prototype.getItem;document.documentElement.dataset.notificationReads="0";Storage.prototype.getItem=function(key){if(key==="nexusclass.demo.notifications.v1") document.documentElement.dataset.notificationReads=String(Number(document.documentElement.dataset.notificationReads)+1);return get.call(this,key);};});
 await page.getByRole("button",{name:"Atualizar financeiro",exact:true}).click();
 await page.getByRole("button",{name:"Atualizar contatos em lote",exact:true}).click();
 await page.waitForTimeout(200);await expect(page.getByTestId("notification-state")).toHaveText("ready");
 expect(await page.evaluate(()=>Number(document.documentElement.dataset.notificationReads))).toBe(0);
});
