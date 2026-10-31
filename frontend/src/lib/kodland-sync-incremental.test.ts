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
it("segunda importação igual não regrava documentos e preserva campos locais",async()=>{
 await kodlandApi.sync("teacher","not-real","essential");expect(mocks.commits.reduce((a,b)=>a+b,0)).toBe(3);
 const student=mocks.db.get("users/incremental/kodland_students/s")!;student.local_note="Nota local";student.hidden=true;
 mocks.commits.length=0;const progress=vi.fn();
 await kodlandApi.sync("teacher","not-real","essential",{onProgress:progress});
 expect(mocks.commits).toEqual([]);
 expect(mocks.db.get("users/incremental/kodland_students/s")).toMatchObject({local_note:"Nota local",hidden:true});
 expect(progress.mock.calls.some(call=>String(call[0]).includes("3 registros sem mudanças"))).toBe(true);
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
