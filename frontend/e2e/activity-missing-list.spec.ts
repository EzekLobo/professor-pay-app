import { expect, test } from "@playwright/test";
for (const [width, emptyCurrent] of [[320, false], [390, false], [1440, false], [390, true]] as const) test(`mensagem lista não entregas por módulo sem perder edição (${width}px, vazio=${emptyCurrent})`, async ({ page }) => {
 await page.setViewportSize({width,height:900});
 await page.goto('/demo#corrections');
 await expect(page.getByRole('button',{name:'Compacto',exact:true})).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>!!localStorage.getItem('nexusclass.demo.v2'))).toBe(true);
 const className=await page.evaluate((emptyCurrent)=>{
  const state=JSON.parse(localStorage.getItem('nexusclass.demo.v2')!); const s=state.snapshot;
  const classroom=s.manualClasses[0]; const student=classroom.student_ids[0]; const original=s.manualOccurrences.find((x:{class_id:string})=>x.class_id===classroom.id);
  const modules=[1,2,3];
  s.manualOccurrences=modules.map(module=>({...original,id:`demo-manual-qa-occ-${module}`,lesson_date:module===3?'2099-01-01':`2026-10-0${module}`,course_code:`M${module}L1`,status:module===3?'planned':'held'}));
  const base={class_id:classroom.id,student_id:student,description:'',submission_text:'',submission_url:'',feedback:'',status:'assigned',kind:'classroom',required:true,exempt:false,created_at:'2026-10-01',updated_at:'2026-10-01'};
  s.manualActivities=modules.map(module=>({...base,id:`demo-manual-qa-task-${module}`,occurrence_id:`demo-manual-qa-occ-${module}`,title:`Pendente módulo ${module}`,status:emptyCurrent && module===2?'completed':'assigned'}));
  s.manualActivities.push({...base,id:'demo-manual-qa-delivered',occurrence_id:'demo-manual-qa-occ-2',title:'Já entregue',status:'submitted',submission_text:'Minha entrega'});
  localStorage.setItem('nexusclass.demo.v2',JSON.stringify(state));return classroom.name;
 }, emptyCurrent);
 await page.reload(); await page.getByRole('button',{name:'Compacto',exact:true}).click();
 const group=page.locator('details.compact-activities-class').filter({hasText:className});
 await group.locator('summary').click();
 await group.getByRole('button',{name:/Mensagem aos responsáveis de/}).first().click();
 const modal=page.getByRole('dialog',{name:'Mensagem pelo WhatsApp',exact:true});
 await modal.getByLabel('Mensagem',{exact:true}).fill('Texto personalizado.');
 await modal.getByRole('checkbox',{name:'Listar atividades não feitas'}).check();
 const modules=modal.getByRole('combobox',{name:'Módulo das atividades'});
 await expect(modules).toHaveValue('2');
 const viewport=page.viewportSize()!;
 const bounds=(await modal.boundingBox())!;
 expect(bounds.y).toBeGreaterThanOrEqual(0);expect(bounds.y+bounds.height).toBeLessThanOrEqual(viewport.height+1);
 if(emptyCurrent) {
  await expect(modal.getByRole('button',{name:'Inserir lista na mensagem'})).toHaveCount(0);
  await expect(modal.getByText('Não há atividades não feitas neste módulo. Há pendências em outros módulos.')).toBeVisible();
  await modal.getByRole('button',{name:'Ver todos os módulos'}).click();
  await modal.getByRole('button',{name:'Inserir lista na mensagem'}).click();
  await expect(modal.getByLabel('Mensagem',{exact:true})).toHaveValue(/Pendente módulo 1/);
  await page.setViewportSize({width,height:520});
  await modal.getByLabel('Mensagem',{exact:true}).scrollIntoViewIfNeeded();
  const small=(await modal.boundingBox())!;expect(small.y+small.height).toBeLessThanOrEqual(521);
  await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
  await expect(modal).not.toBeVisible();
  return;
 }

 await expect(modal.locator('.activity-missing-preview')).toContainText('Pendente módulo 2');
 await expect(modal.locator('.activity-missing-preview')).not.toContainText('Já entregue');
 await modal.getByRole('button',{name:'Inserir lista na mensagem'}).click();
 await expect(modal.getByLabel('Mensagem',{exact:true})).toHaveValue(/Texto personalizado\.[\s\S]*M2L1 — Pendente módulo 2/);
 await modules.selectOption('all');
 await modal.getByRole('button',{name:'Inserir lista na mensagem'}).click();
 const message=await modal.getByLabel('Mensagem',{exact:true}).inputValue();
 expect(message).toContain('Pendente módulo 1');expect(message).not.toContain('Pendente módulo 3');
 expect(message.match(/Atividades não feitas/g)).toHaveLength(1);
 await modules.selectOption('1');await modal.getByRole('button',{name:'Inserir lista na mensagem'}).click();
 await expect(modal.getByLabel('Mensagem',{exact:true})).not.toHaveValue(/Pendente módulo 2/);
 await modal.screenshot({path:`/tmp/nexus-missing-activities-${width}.png`});
 expect(await modal.evaluate(el=>el.scrollWidth-el.clientWidth)).toBeLessThanOrEqual(1);
 await modal.getByRole('button',{name:'Cancelar',exact:true}).click();
 await expect(modal).not.toBeVisible();
});
