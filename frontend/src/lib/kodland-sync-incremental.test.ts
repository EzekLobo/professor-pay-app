import * as browserCache from "./kodland-browser-cache";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({db:new Map<string,Record<string,unknown>>(),commits:[] as number[],fail:"",reads:[] as Array<{path:string;group?:string}>,token:vi.fn(async()=>"token")}));
vi.mock("./firebase",()=>({getFirebaseAuth:()=>({currentUser:{uid:"incremental",getIdToken:mocks.token}}),getFirebaseDb:()=>({})}));
vi.mock("firebase/firestore",async original=>({
 ...await original<typeof import("firebase/firestore")>(),
 collection:(_db:unknown,path:string)=>path, doc:(path:string,id:string)=>`${path}/${id}`,query:(path:string,filter?:{group:string})=>filter?{path,group:filter.group}:path,where:(_field:string,_operator:string,group:string)=>({group}),orderBy:vi.fn(),
 getDocs:async(input:string|{path:string;group:string})=>{
  const {path,group}=typeof input==="string"?{path:input,group:undefined}:input;mocks.reads.push({path,group});
  return {docs:[...mocks.db].filter(([key,data])=>key.startsWith(`${path}/`) && (!group || data.external_class_id===group)).map(([key,data])=>({id:key.split('/').at(-1),data:()=>structuredClone(data)}))};
 },
 setDoc:async(path:string,data:Record<string,unknown>)=>{mocks.db.set(path,structuredClone(data));},
 writeBatch:()=>{
  let used=false;const writes:Array<()=>void>=[];
  return {set:(path:string,data:Record<string,unknown>)=>{writes.push(()=>mocks.db.set(path,structuredClone(data)));},update:(path:string,data:Record<string,unknown>)=>{writes.push(()=>mocks.db.set(path,{...mocks.db.get(path),...structuredClone(data)}));},delete:(path:string)=>{writes.push(()=>mocks.db.delete(path));},commit:async()=>{
   if(used) throw new Error("batch reused");used=true;
   if(mocks.fail){const code=mocks.fail;mocks.fail="";throw {code};}
   mocks.commits.push(writes.length);writes.forEach(write=>write());
  }};
 }
}));
import {kodlandApi} from "./api";
afterEach(()=>vi.unstubAllGlobals());
const lesson={id:"l",source_lesson_id:"l",external_class_id:"g",external_class_name:"G",module_number:"1",lesson_number:1,course_index:1,schedule_code:"M1L1",title:"Aula",theme:"",lesson_date:"2026-10-01",start_time:"18:00",end_time:"19:00",status:"held",lesson_passed:true,external_url:"",slides_url:"",guide_url:"",homework_url:"",homework_title:"",classroom_tasks:[]};
const snapshot=()=>({groups:[{id:"g",external_id:"g",title:"G",archived:false}],students:[{id:"s",external_id:"s",external_class_id:"g",name:"Ana",status:"active"}],lessons:[lesson],reviews:[],extra_lessons:[],availability:[],attendance:[]});
beforeEach(()=>{mocks.db.clear();mocks.commits.length=0;mocks.reads.length=0;mocks.fail="";vi.stubGlobal("fetch",vi.fn(async()=>Response.json(snapshot())));});
it("segunda importação igual limpa campos pessoais legados e preserva preferências técnicas",async()=>{
 await kodlandApi.sync("teacher","not-real","essential");expect(mocks.commits.reduce((a,b)=>a+b,0)).toBe(3);
 const student=mocks.db.get("users/incremental/kodland_students/s")!;student.local_note="Nota local";student.hidden=true;
 mocks.commits.length=0;const progress=vi.fn();
 await kodlandApi.sync("teacher","not-real","essential",{onProgress:progress});
 expect(mocks.commits).toEqual([1]);
 expect(mocks.db.get("users/incremental/kodland_students/s")).toMatchObject({hidden:true});
 expect(mocks.db.get("users/incremental/kodland_students/s")).not.toHaveProperty("local_note");
});
it("mudança em um aluno grava somente esse documento",async()=>{
 await kodlandApi.sync("teacher","not-real","essential");mocks.commits.length=0;
 vi.stubGlobal("fetch",vi.fn(async()=>{const data=snapshot();data.students[0].name="Ana atualizada";return Response.json(data);}));
 await kodlandApi.sync("teacher","not-real","essential");expect(mocks.commits).toEqual([1]);
});
it("lotes pequenos confirmam avanço e não reutilizam batch em falha transitória",async()=>{
 vi.stubGlobal("fetch",vi.fn(async()=>{const data=snapshot();data.students=Array.from({length:205},(_,i)=>({...data.students[0],id:`s-${i}`,external_id:`s-${i}`}));return Response.json(data);}));
 mocks.fail="unavailable";const progress=vi.fn();
 await kodlandApi.sync("teacher","not-real","essential",{onProgress:progress});
 expect(mocks.commits).toEqual([100,100,7]);
 expect(progress.mock.calls.some(call=>String(call[0]).includes("100/207"))).toBe(true);
 expect(progress.mock.calls.some(call=>String(call[0]).includes("207/207"))).toBe(true);
});
it("quota recusada retorna referência sem tentar um novo marcador no banco saturado",async()=>{
 mocks.fail="resource-exhausted";
 await expect(kodlandApi.sync("teacher","not-real","essential")).rejects.toMatchObject({syncId:expect.any(String),code:"resource-exhausted",message:expect.stringContaining("limite de uso")});
 expect(mocks.commits).toEqual([]);
 expect(mocks.db.get("users/incremental/sync_status/kodland")?.status).toBe("running");
});

it("automática lê só a turma de destino e não regrava histórico sem mudanças",async()=>{
 await kodlandApi.sync("teacher","not-real","essential");
 const incoming={...snapshot(),lessons:[],review_group_ids:["g"],attendance_group_ids:["g"],reviews:[{id:"review",external_class_id:"g",external_student_id:"s",student_name:"Ana",task_title:"Aguardando correção",status_key:"TASK_SUBMITTED"}],attendance:[{id:"attendance",external_class_id:"g",external_student_id:"s",student_name:"Ana",lesson_id:"l",status:"ABSENT"}],task_progress:[{id:"progress",external_class_id:"g",external_student_id:"s",lesson_id:"l",task_id:"task",task_title:"Pendente",state:"missing"}]};
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json(incoming)));
 const options={refreshSchedule:false,correctionGroupIds:["g"]};
 await kodlandApi.sync("teacher","not-real","corrections",options);
 expect(mocks.commits.at(-1)).toBe(3);mocks.commits.length=0;mocks.reads.length=0;
 const foreign="users/incremental/kodland_task_progress/foreign";
 mocks.db.set(foreign,{...incoming.task_progress[0],id:"foreign",external_class_id:"other",external_student_id:"other"});
 await kodlandApi.sync("teacher","not-real","corrections",options);
 expect(mocks.commits).toEqual([]);expect(mocks.db.has(foreign)).toBe(true);
 expect(mocks.reads.filter(item=>/kodland_(reviews|attendance|task_progress)$/.test(item.path)).every(item=>item.group==="g")).toBe(true);
 incoming.task_progress[0].state="delivered";
 await kodlandApi.sync("teacher","not-real","corrections",options);
 expect(mocks.commits).toEqual([1]);
});

it("atualização só de presença preserva atividades e não adia sua próxima consulta",async()=>{
 await kodlandApi.sync("teacher","not-real","essential");
 const progressPath="users/incremental/kodland_task_progress/p";mocks.db.set(progressPath,{id:"p",external_class_id:"g",state:"missing"});
 mocks.reads.length=0;
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...snapshot(),lessons:[],review_group_ids:[],attendance_group_ids:["g"],attendance:[{id:"a",external_class_id:"g",external_student_id:"s",status:"PRESENT"}]})));
 await kodlandApi.sync("teacher","not-real","corrections",{refreshSchedule:false,correctionGroupIds:["g"],followupScope:"attendance"});
 expect(mocks.db.get(progressPath)).toMatchObject({state:"missing"});
 expect(mocks.reads.some(read=>/kodland_(reviews|task_progress|lessons)$/.test(read.path))).toBe(false);
 expect(mocks.db.get("users/incremental/sync_status/corrections")).not.toHaveProperty("group_completed_at");
});
it("atualização só de atividades não lê nem remove presenças",async()=>{
 await kodlandApi.sync("teacher","not-real","essential");
 const path="users/incremental/kodland_attendance/a";mocks.db.set(path,{id:"a",external_class_id:"g",status:"ABSENT"});mocks.reads.length=0;
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...snapshot(),lessons:[],review_group_ids:["g"],attendance_group_ids:[],task_progress:[]})));
 await kodlandApi.sync("teacher","not-real","corrections",{refreshSchedule:false,correctionGroupIds:["g"],followupScope:"activities"});
 expect(mocks.db.get(path)).toMatchObject({status:"ABSENT"});expect(mocks.reads.some(read=>read.path.endsWith("kodland_attendance"))).toBe(false);
});

it("retorno explícito ao Firebase compara a base remota, sem confundir cache atualizado com gravação concluída",async()=>{
 await kodlandApi.sync("teacher","fixture","essential");
 mocks.db.get("users/incremental/kodland_students/s")!.name="Nome antigo remoto";
 mocks.commits.length=0;
 const local:browserCache.KodlandBrowserState={version:1,active:true,updatedAt:"2026-10-31",coreAt:"2026-10-31",collections:{},groupCompletedAt:{},automatic:{}};
 const cache=vi.spyOn(browserCache,"readKodlandBrowser").mockResolvedValue(local);
 const persist=vi.spyOn(browserCache,"updateKodlandBrowser").mockImplementation(async(_uid,mutate)=>{mutate(local);return local;});
 const reads=vi.spyOn(browserCache,"readKodlandBrowserRows").mockResolvedValue(snapshot().students);
 try {
  await kodlandApi.sync("teacher","fixture","essential",{storage:"firebase"});
  expect(mocks.commits).toEqual([1]);expect(mocks.db.get("users/incremental/kodland_students/s")?.name).toBe("Ana");
  expect(local.collections.kodland_students[0].name).toBe("Ana");
 } finally {cache.mockRestore();reads.mockRestore();persist.mockRestore();}
});

it("preserva créditos em importação essencial e atualiza zero em perfis sem reter notas locais", async () => {
 await kodlandApi.sync("teacher","not-real","essential");
 const key="users/incremental/kodland_students/s";
 Object.assign(mocks.db.get(key)!,{lesson_credits_remaining:7,lesson_credits_updated_at:"old",local_note:"Anotação"});
 await kodlandApi.sync("teacher","not-real","essential");
 expect(mocks.db.get(key)).toMatchObject({lesson_credits_remaining:7,lesson_credits_updated_at:"old"});
 expect(mocks.db.get(key)).not.toHaveProperty("local_note");
 vi.stubGlobal("fetch",vi.fn(async()=>{const data=snapshot();Object.assign(data.students[0],{lesson_credits_remaining:0,lesson_credits_updated_at:"new"});return Response.json(data);}));
 await kodlandApi.sync("teacher","not-real","profiles");
 expect(mocks.db.get(key)).toMatchObject({lesson_credits_remaining:0,lesson_credits_updated_at:"new",name:"Ana"});
 expect(mocks.db.get(key)).not.toHaveProperty("local_note");
});

it.each(["essential", "schedule", "profiles"] as const)("%s remove aluno que deixou de ser ativo apenas nas turmas confirmadas", async mode => {
 await kodlandApi.sync("teacher","fixture","essential");
 mocks.db.set("users/incremental/kodland_students/outside",{id:"outside",external_class_id:"other",status:"active",name:"Outra turma"});
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...snapshot(),students:[],student_group_ids:["g"]})));
 await kodlandApi.sync("teacher","fixture",mode);
 expect(mocks.db.has("users/incremental/kodland_students/s")).toBe(false);
 expect(mocks.db.has("users/incremental/kodland_students/outside")).toBe(true);
});
it("lista parcial sem confirmação não remove aluno salvo", async () => {
 await kodlandApi.sync("teacher","fixture","essential");
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...snapshot(),students:[]})));
 await kodlandApi.sync("teacher","fixture","essential");
 expect(mocks.db.has("users/incremental/kodland_students/s")).toBe(true);
});
