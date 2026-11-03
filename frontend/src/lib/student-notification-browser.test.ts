import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { KodlandBrowserState } from "./kodland-browser-cache";
const mock=vi.hoisted(()=>({uid:"a",state:null as KodlandBrowserState|null,remoteSettings:null as unknown,history:[] as Array<{id:string}>,doc:null as unknown,quota:false,writes:vi.fn()}));
vi.mock("./firebase",()=>({getFirebaseAuth:()=>({currentUser:{uid:mock.uid}}),getFirebaseDb:()=>({})}));
vi.mock("./kodland-browser-cache",()=>({
 readKodlandBrowser:async(uid:string)=>uid==="a"?structuredClone(mock.state):null,
 readKodlandBrowserRows:async(uid:string,name:string)=>uid==="a"&&mock.state?.active&&name.startsWith("kodland_")?structuredClone(mock.state.collections[name]??[]):null,
 updateKodlandBrowser:async(uid:string,mutate:(state:KodlandBrowserState)=>void,owner:()=>boolean)=>{if(uid!=="a"||!owner())throw new Error("conta alterada");const state=structuredClone(mock.state!);mutate(state);mock.state=state;return state;}
}));
vi.mock("firebase/firestore",()=>({query:(value:unknown)=>value,orderBy:()=>({}),collection:()=>"cases",doc:()=>"settings",getDoc:async()=>{if(mock.quota)throw new Error("quota");return {exists:()=>Boolean(mock.remoteSettings),data:()=>mock.remoteSettings};},getDocs:async()=>{if(mock.quota)throw new Error("quota");return {docs:mock.history.map(row=>({id:row.id,data:()=>row}))};},setDoc:async()=>{if(mock.quota)throw new Error("quota");},runTransaction:async(_db:unknown,action:(transaction:unknown)=>Promise<void>)=>{if(mock.quota)throw new Error("quota");await action({get:async()=>({exists:()=>Boolean(mock.doc),data:()=>mock.doc}),set:mock.writes});}}));
import { createStudentNotificationStore, reconcileNotificationCases } from "./student-notification-store";
import { defaultNotificationSettings, evaluateStudentNotifications, needsNotificationContact } from "./student-notification-rules";
import { manualTeachingApi, manualOperationsApi, manualPedagogyApi } from "./api";
import { clearStudentNotificationSourceCache, loadStudentNotificationSource } from "./student-notification-source";
const settings={...defaultNotificationSettings("2026-10-01"),enabled:true,homework_enabled:false};
const stamp="2026-11-03T15:00:00Z";
const lesson={id:"g-l",source_lesson_id:"lesson",external_class_id:"g",external_class_name:"G",lesson_date:"2026-11-02",start_time:"18:00",end_time:"19:30",title:"M1L2",schedule_code:"M1L2",course_index:2,module_number:"1",lesson_number:2,status:"held",lesson_passed:true,materials_status:"ready",classroom_tasks:[{title:"Projeto",url:"https://learn.kodland.org/task/11/"}],homework_url:""};
beforeEach(()=>{
 clearStudentNotificationSourceCache();mock.uid="a";mock.quota=false;mock.doc=null;mock.history=[];mock.remoteSettings=settings;mock.writes.mockClear();vi.stubGlobal("indexedDB",{});
 mock.state={version:1,active:true,coreAt:stamp,updatedAt:stamp,groupCompletedAt:{g:stamp},attendanceCompletedAt:{g:stamp},automatic:{},notificationCache:{settings,settingsAt:Date.now(),cases:[],remoteCasesAt:Date.now()},collections:{
 kodland_groups:[{id:"g",external_id:"g",title:"G",archived:false},{id:"pending",external_id:"pending",title:"Outra turma incompleta",archived:false}],
 kodland_students:["absent","present"].map(id=>({id,external_id:id,external_class_id:"g",name:id,status:"active",hidden:false})),
 kodland_lessons:[lesson],kodland_attendance:["absent","present"].map(id=>({id:`a-${id}`,external_class_id:"g",external_student_id:id,lesson_id:"2",lesson_title:"M1L2",lesson_date:"",status:id==="absent"?"ABSENT":"PRESENT"})),
 kodland_task_progress:["absent","present"].map(id=>({id:`p-${id}`,external_class_id:"g",external_student_id:id,lesson_id:"lesson",task_id:"11",task_title:"Projeto",state:"missing"}))
 }};
});
afterEach(()=>{vi.unstubAllGlobals();vi.restoreAllMocks();});
it("gera falta e nenhuma entrega da última aula no cache, mesmo com Firebase sem quota e outra turma incompleta",async()=>{
 mock.quota=true;const store=createStudentNotificationStore("a");const rules=await store.settings();const source=await loadStudentNotificationSource("a",rules);
 const items=evaluateStudentNotifications(source.lessons,source.obligations,rules,new Date(stamp));
 expect(items.map(item=>[item.student_id,item.category]).sort()).toEqual([["absent","absence"],["absent","classroom"],["present","classroom"]]);
 const rows=await store.reconcile(items,stamp,source.coverage);expect(rows.filter(needsNotificationContact)).toHaveLength(3);expect(mock.writes).not.toHaveBeenCalled();
 expect((await createStudentNotificationStore("a").cases()).filter(needsNotificationContact)).toHaveLength(3);
});
it("preserva casos próprios fora da cobertura e não confunde ler com confirmação de contato",async()=>{
 mock.quota=true;const store=createStudentNotificationStore("a");const source=await loadStudentNotificationSource("a",settings);const items=evaluateStudentNotifications(source.lessons,source.obligations,settings,new Date(stamp));
 const manual={...items[0],id:"manual",source:"manual" as const};mock.state!.notificationCache!.cases=reconcileNotificationCases([],[manual],stamp);
 const rows=await store.reconcile(items,stamp,source.coverage);expect(rows.find(row=>row.id==="manual")?.active).toBe(true);
 await store.markRead(items[0].id,items[0].revision);expect(needsNotificationContact((await store.cases()).find(item=>item.id===items[0].id)!)).toBe(true);
 mock.quota=true;await expect(store.confirmContact(items[0].id,items[0].revision)).rejects.toThrow("quota");
 expect(needsNotificationContact((await store.cases()).find(item=>item.id===items[0].id)!)).toBe(true);
 mock.quota=false;await store.confirmContact(items[0].id,items[0].revision);expect(needsNotificationContact((await store.cases()).find(item=>item.id===items[0].id)!)).toBe(false);expect(mock.writes).toHaveBeenCalledOnce();
});
it("não alerta novamente por uma aula anterior quando a última aula ainda não tem presença ou progresso",async()=>{
 mock.state!.collections.kodland_lessons.push({...lesson,id:"new",source_lesson_id:"new-source",lesson_date:"2026-11-03",start_time:"08:00",end_time:"09:30",course_index:3});
 const source=await loadStudentNotificationSource("a",settings);expect(evaluateStudentNotifications(source.lessons,source.obligations,settings,new Date(stamp))).toEqual([]);
});
it("a atualização explícita relê configuração e troca de conta nunca expõe cache anterior",async()=>{
 const store=createStudentNotificationStore("a");mock.remoteSettings={...settings,enabled:false};expect((await store.settings()).enabled).toBe(true);expect((await store.settings(true)).enabled).toBe(false);
 mock.uid="b";await expect(store.cases()).rejects.toThrow("alterada");
});

it("inventário confirmado não é bloqueado por item desconhecido que não é atividade de aula",async()=>{
 mock.state!.collections.kodland_task_progress.push({id:"info",external_class_id:"g",external_student_id:"present",lesson_id:"lesson",task_id:"intro",task_title:"Informação",state:"unknown"});
 const source=await loadStudentNotificationSource("a",settings);const items=evaluateStudentNotifications(source.lessons,source.obligations,settings,new Date(stamp));
 expect(items.some(item=>item.student_id==="present"&&item.category==="classroom")).toBe(true);
 mock.state!.collections.kodland_task_progress=mock.state!.collections.kodland_task_progress.map(item=>item.id==="p-present"?{...item,state:"unknown"}:item);
 const unknown=await loadStudentNotificationSource("a",settings);expect(evaluateStudentNotifications(unknown.lessons,unknown.obligations,settings,new Date(stamp)).some(item=>item.student_id==="present"&&item.category==="classroom")).toBe(false);
});

it("continua avaliando turmas próprias quando seus dados estão disponíveis, junto dos alertas Kodland",async()=>{
 vi.spyOn(manualTeachingApi,"classes").mockResolvedValue([{id:"manual-class",name:"Própria",active:true,student_ids:["manual-student"]}] as Awaited<ReturnType<typeof manualTeachingApi.classes>>);
 vi.spyOn(manualTeachingApi,"students").mockResolvedValue([{id:"manual-student",name:"Aluno próprio",active:true,guardian_name:"",guardian_phone:""}] as Awaited<ReturnType<typeof manualTeachingApi.students>>);
 vi.spyOn(manualOperationsApi,"occurrences").mockResolvedValue([{id:"manual-lesson",class_id:"manual-class",lesson_date:"2026-11-02",start_time:"18:00",duration_minutes:90,status:"held"}] as Awaited<ReturnType<typeof manualOperationsApi.occurrences>>);
 vi.spyOn(manualOperationsApi,"attendance").mockResolvedValue([{occurrence_id:"manual-lesson",class_id:"manual-class",student_id:"manual-student",status:"ABSENT"}] as Awaited<ReturnType<typeof manualOperationsApi.attendance>>);
 vi.spyOn(manualPedagogyApi,"activities").mockResolvedValue([]);
 const source=await loadStudentNotificationSource("a",settings);expect(source.coverage?.manual).toBe(true);
 const items=evaluateStudentNotifications(source.lessons,source.obligations,settings,new Date(stamp));expect(items.filter(item=>item.source==="manual")).toHaveLength(1);expect(items.filter(item=>item.source==="kodland")).toHaveLength(3);
});

it("preserva confirmações conhecidas ao mudar do Firebase para o cache durante uma indisponibilidade",async()=>{
 const source=await loadStudentNotificationSource("a",settings);const items=evaluateStudentNotifications(source.lessons,source.obligations,settings,new Date(stamp));
 const previous=reconcileNotificationCases([],[items[0]],stamp);previous[0].confirmed_revisions=[items[0].revision];mock.history=previous;
 mock.state!.active=false;const store=createStudentNotificationStore("a");await store.cases();
 mock.state!.active=true;mock.quota=true;expect(needsNotificationContact((await store.cases())[0])).toBe(false);
});
