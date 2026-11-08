import { test, expect } from "@playwright/test";
import { mkdir, writeFile, rm } from "node:fs/promises";
import path from "node:path";
const fixture = path.resolve(process.cwd(), process.cwd().endsWith("frontend") ? "src/app/qa-next-month-payroll" : "frontend/src/app/qa-next-month-payroll");
let created = false;
test.describe.configure({ mode: "serial" });
test.beforeAll(async () => {
 await mkdir(fixture); created = true;
 await writeFile(`${fixture}/page.tsx`, `"use client";
import { useMemo, useState } from "react";
import { calculateDashboard } from "@/lib/api";
import { normalizePayroll } from "@/lib/kodland-payroll";
import { PaymentsContent, type PaymentsAdapter } from "@/components/payments-page";
import { DashboardContent } from "@/components/dashboard-content";
const raw = { id:12, teacher:22, period_start:"2026-11-01", payout_currency:"BRL", payout_amount:"45.00", bonus_amount:"0", corrections_amount:"0", projected_lessons:1, projected_amount_local:"30.00", projected_local_currency:"BRL", entries:[{id:1,lesson_started_at:"2026-11-06T20:00:00Z",currency:"BRL",amount:"45.00",status:"calculated"},{id:2,lesson_started_at:"2026-11-27T20:00:00Z",currency:"BRL",amount:"30.00",status:"projected"}] };
const noop = async () => undefined;
export default function Fixture() {
 const [available, setAvailable] = useState(true);
 const dashboard = useMemo(() => calculateDashboard([],[],[],[],[],"2026-11-08",[],[],[],[],[],[],{periods:available?[normalizePayroll(raw,raw,"22")]:[],mode:"comparison",teacher_id:"22",last_sync:""}),[available]);
 const adapter = useMemo<PaymentsAdapter>(() => ({list:async()=>({items:dashboard.payments,next_month_forecast:dashboard.next_month_forecast}),get:async()=>{throw Error("unused");},updateLessonFinancialStatus:noop,setStatus:noop,reverse:noop,confirm:noop,createExtra:noop}),[dashboard]);
 return <main><button onClick={()=>setAvailable(false)}>Simular folha indisponível</button><PaymentsContent adapter={adapter}/><DashboardContent state="ready" dashboard={dashboard}/></main>;
}
`);
});
test.afterAll(async () => { if (created) await rm(fixture, { recursive: true, force: true }); });
for (const width of [320, 1440]) test(`saldo oficial aparece no resumo e pagamentos sem duplicar valores (${width}px)`, async ({ page }) => {
 await page.setViewportSize({width,height:900});
 await page.goto("/qa-next-month-payroll");
 const cards = page.getByRole("article",{name:"Saldo previsto para o próximo mês",exact:true});
 await expect(cards).toHaveCount(2);
 for (const card of await cards.all()) { await expect(card).toContainText("dezembro de 2026"); await expect(card).toContainText("75,00"); }
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole("button",{name:"Simular folha indisponível"}).click();
 for (const card of await cards.all()) { await expect(card).toContainText("Ainda não informado"); await expect(card).not.toContainText("75,00"); }
});
