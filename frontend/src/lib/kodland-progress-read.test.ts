import { expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({query:vi.fn(),getDocs:vi.fn()}));
vi.mock("./firebase",()=>({getFirebaseAuth:()=>({currentUser:{uid:"owner"}}),getFirebaseDb:()=>({})}));
vi.mock("firebase/firestore",async original=>({...await original<typeof import("firebase/firestore")>(),collection:(_db:unknown,path:string)=>path,query:mocks.query,getDocs:mocks.getDocs}));
import {kodlandApi} from "./api";
it("lê progresso salvo sem created_at, sem ordenação que exclui os documentos",async()=>{
 const item={id:"progress-1",external_class_id:"g",external_student_id:"s",lesson_id:"l",task_id:"t",task_title:"Atividade",state:"missing"};
 mocks.getDocs.mockResolvedValue({docs:[{id:item.id,data:()=>item}]});
 expect((await kodlandApi.taskProgress()).items).toEqual([item]);
 expect(mocks.getDocs).toHaveBeenCalledWith("users/owner/kodland_task_progress");
 expect(mocks.query).not.toHaveBeenCalled();
});
