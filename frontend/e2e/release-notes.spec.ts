import { expect, test } from "@playwright/test";
for (const width of [1440, 390, 320]) {
 test(`novidades aparecem no sino e abrem modal ao tocar (${width}px)`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const privateCalls:string[]=[];page.on("request",request=>{if(/firestore.googleapis.com|identitytoolkit.googleapis.com|api\/account/.test(request.url()))privateCalls.push(request.url());});
  await page.goto("/demo");
  await expect(page.getByRole("button",{name:/^Abrir novidades/})).toHaveCount(0);
  const bell=page.getByRole("button",{name:/Notificações: \d+ pendentes/});
  const dialog=page.getByRole("dialog",{name:"Novidades do NexusClass",exact:true});
  await expect(dialog).not.toBeVisible();await bell.click();
  const inbox=page.getByRole("region",{name:"Notificações",exact:true});
  await inbox.getByRole("button",{name:/Novidades da aplicação/}).click();
  await expect(inbox).not.toBeVisible();await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading",{name:"Navegação mais compacta",exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const box=await dialog.boundingBox();expect(box!.width).toBeLessThanOrEqual(width);expect(box!.height).toBeLessThanOrEqual(900);
  await dialog.getByRole("button",{name:"Entendi",exact:true}).click();await expect(dialog).not.toBeVisible();await expect(bell).toBeFocused();
  await page.reload();await bell.click();
  await inbox.getByRole("button",{name:/Novidades da aplicação/}).click();await expect(dialog).toBeVisible();
  await dialog.getByRole("link",{name:"Definir meu nick"}).click();await expect(page).toHaveURL(/demo#settings$/);await expect(dialog).not.toBeVisible();
  await bell.click();await inbox.getByRole("button",{name:/Novidades da aplicação/}).click();
  await page.keyboard.press("Escape");await expect(dialog).not.toBeVisible();await expect(bell).toBeFocused();expect(privateCalls).toEqual([]);
 });
}
test("atalho de novidades abre a configuração de notificações",async({page})=>{
 await page.setViewportSize({width:320,height:700});await page.goto("/demo#settings");
 await page.getByRole("button",{name:/Notificações: \d+ pendentes/}).click();await page.getByRole("region",{name:"Notificações",exact:true}).getByRole("button",{name:/Novidades da aplicação/}).click();
 await page.getByRole("dialog",{name:"Novidades do NexusClass",exact:true}).getByRole("link",{name:"Configurar alertas e mensagem",exact:true}).click();
 await expect(page).toHaveURL(/section=notifications#settings$/);await expect(page.getByRole("tab",{name:"Notificações",exact:true})).toHaveAttribute("aria-selected","true");
});
