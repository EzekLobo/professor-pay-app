import { expect, test } from "@playwright/test";
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
const source = readFileSync(resolve(__dirname, "../src/lib/kodland-browser-cache.ts"), "utf8");
const code = stripTypeScriptTypes(source).replace(/\bexport\s+/g, "") + ";return {readKodlandBrowser, readKodlandBrowserRows, updateKodlandBrowser};";
test("IndexedDB mantém dados após recarga e separa contas", async ({ page }) => {
 await page.goto("/demo");
 await page.evaluate(async code => {
  const api = new Function(code)() as typeof import("../src/lib/kodland-browser-cache");
  await api.updateKodlandBrowser("account-a", state => { state.active=true;state.updatedAt="2026-10-31";state.collections.kodland_groups=[{id:"g",title:"Turma persistida"}]; },()=>true);
 }, code);
 await page.reload();
 const result = await page.evaluate(async code => {
  const api = new Function(code)() as typeof import("../src/lib/kodland-browser-cache");
  return { a:await api.readKodlandBrowserRows("account-a","kodland_groups"), b:await api.readKodlandBrowserRows("account-b","kodland_groups"), own:await api.readKodlandBrowserRows("account-a","payments") };
 },code);
 expect(result.a).toEqual([{id:"g",title:"Turma persistida"}]);expect(result.b).toBeNull();expect(result.own).toBeNull();
});
test("transação recusada preserva cópia anterior e não confirma uma conta trocada", async ({ page }) => {
 await page.goto("/demo");
 const result = await page.evaluate(async code => {
  const api = new Function(code)() as typeof import("../src/lib/kodland-browser-cache");
  await api.updateKodlandBrowser("a",state=>{state.active=true;state.collections.kodland_groups=[{id:"g",title:"Anterior"}];},()=>true);
  let rejected=false;
  try { await api.updateKodlandBrowser("a",state=>{state.collections.kodland_groups=[];throw new Error("storage failure");},()=>true); } catch { rejected=true; }
  let owner=true;let switched=false;
  const update=api.updateKodlandBrowser("b",state=>{state.active=true;},()=>owner);
  owner=false;try {await update;} catch {switched=true;}
  return { rejected, switched, a:await api.readKodlandBrowserRows("a","kodland_groups"), b:await api.readKodlandBrowser("b") };
 },code);
 expect(result).toMatchObject({rejected:true,switched:true,a:[{id:"g",title:"Anterior"}],b:null});
});
