import { expect, test } from "@playwright/test";
test.use({ hasTouch: true });
for(const width of [320,390]) test(`barra inferior responde a arraste real por toque (${width}px)`,async({page})=>{
 await page.setViewportSize({width,height:844});await page.goto("/demo#dashboard");
 const nav=page.getByRole("navigation",{name:"Navegação principal"});await expect(nav).toBeVisible();
 const box=await nav.boundingBox();const session=await page.context().newCDPSession(page);
 const start=width-28;const y=box!.y+box!.height/2;
 await session.send("Input.dispatchTouchEvent",{type:"touchStart",touchPoints:[{x:start,y,id:1}]});
 for(let step=1;step<=15;step++){
  await session.send("Input.dispatchTouchEvent",{type:"touchMove",touchPoints:[{x:start-step*16,y,id:1}]});
  await page.waitForTimeout(16);
 }
 await session.send("Input.dispatchTouchEvent",{type:"touchEnd",touchPoints:[]});
 await expect.poll(()=>nav.evaluate(element=>element.scrollLeft)).toBeGreaterThan(20);
 const tasks=nav.getByRole("link",{name:"Tarefas",exact:true});await expect(tasks).toBeInViewport();await tasks.click();await expect(page).toHaveURL(/#tasks$/);
 await page.reload();await expect(tasks).toHaveAttribute("aria-current","page");await expect(tasks).toBeInViewport();
 await expect.poll(()=>tasks.evaluate(element=>{const box=element.getBoundingClientRect();const parent=element.parentElement!.getBoundingClientRect();return box.left>=parent.left-1&&box.right<=parent.right+1;})).toBe(true);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`/tmp/mobile-nav-${width}.png`,fullPage:false});await session.detach();
});
