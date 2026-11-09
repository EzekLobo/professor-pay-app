import { expect, test } from "@playwright/test";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
const fixture=path.resolve(process.cwd(),process.cwd().endsWith("frontend")?"src/app/qa-logic-races":"frontend/src/app/qa-logic-races");
let created=false;
test.describe.configure({mode:"serial"});
test.beforeAll(async()=>{
 await mkdir(fixture);created=true;
 await writeFile(`${fixture}/page.tsx`, `"use client";
import { useMemo, useState } from "react";
import { PaymentsContent, type PaymentsAdapter } from "@/components/payments-page";
import { LessonsContent } from "@/components/lessons-page";
import { kodlandApi, type DashboardPayment } from "@/lib/api";
import { createDemoManualAdapter } from "@/lib/demo-manual-adapter";
import { createDemoSnapshot } from "@/lib/demo-snapshot";
let confirmed=false; const row: DashboardPayment={payment_date:"2026-12-15",period:"2026-11",lesson_count:1,normal_count:1,extra_count:0,normal_total_cents:3000,extra_total_cents:0,total_cents:3000,status:"EXPECTED",lessons:[]};
const noop=async()=>undefined;
const payments: PaymentsAdapter={list:async()=>({items:[{...row,status:confirmed?"RECEIVED":"EXPECTED"}]}),get:async()=>{if(confirmed)throw Error("followup unavailable");return {...row,received_at:null,confirmation_note:null};},updateLessonFinancialStatus:noop,setStatus:noop,reverse:noop,confirm:async()=>{confirmed=true;document.documentElement.dataset.confirmations=String(Number(document.documentElement.dataset.confirmations??0)+1);},createExtra:noop};
kodlandApi.browserState=async()=>({active:true}) as never;
kodlandApi.groups=async()=>{document.documentElement.dataset.groupReads=String(Number(document.documentElement.dataset.groupReads??0)+1);return {items:[]};};kodlandApi.lessons=async()=>({items:[]});
const demo=createDemoSnapshot();const base=createDemoManualAdapter(()=>demo,()=>undefined);
export default function Fixture(){const [courses,setCourses]=useState(false);const adapter=useMemo(()=>({...base,courses:{...base.courses,list:async()=>[]},preferences:{...base.preferences,get:async()=>({...demo.tutorPreferences,kodland_enabled:false})}}),[]);return <main><button onClick={()=>setCourses(true)}>Abrir cursos desativados</button>{courses?<LessonsContent manualAdapter={adapter}/>:<PaymentsContent adapter={payments}/>}</main>;}
`);
});
test.afterAll(async()=>{if(created)await rm(fixture,{recursive:true,force:true});});
for(const width of [390,1440])test(`confirmação salva não volta a pedir gravação se a releitura falhar (${width}px)`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.addInitScript(()=>localStorage.setItem("nexusclass:modal-guide:demo-payment-statement:v2","seen"));
 await page.goto("/qa-logic-races");await page.locator(".payment-carousel-card.is-focus").click();
 const statement=page.getByRole("dialog",{name:"Extrato · 2026-11",exact:true});await expect(statement).toBeVisible();
 await statement.getByRole("button",{name:"Confirmar recebimento",exact:true}).click();
 const confirm=page.getByRole("dialog",{name:"Confirmar recebimento",exact:true});await confirm.getByRole("button",{name:"Confirmar recebimento",exact:true}).click();
 await expect(confirm).not.toBeVisible();await expect(statement).not.toBeVisible();await expect(page.locator(".notice")).toHaveText("Pagamento confirmado.");
 await expect(page.locator(".form-error")).toContainText("Alteração salva");expect(await page.evaluate(()=>Number(document.documentElement.dataset.confirmations))).toBe(1);
});
test("cursos não consultam a Kodland só porque existe cache ativo",async({page})=>{
 await page.goto("/qa-logic-races");await page.getByRole("button",{name:"Abrir cursos desativados",exact:true}).click();
 await expect(page.getByText("Nenhum curso cadastrado. Crie o primeiro para organizar módulos, aulas e materiais.",{exact:true})).toBeVisible();
 expect(await page.evaluate(()=>Number(document.documentElement.dataset.groupReads??0))).toBe(0);
 await expect(page.getByRole("button",{name:"Atualizar cursos",exact:true})).toHaveCount(0);
});
