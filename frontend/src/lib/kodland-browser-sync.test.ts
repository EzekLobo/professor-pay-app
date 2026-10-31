import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { KodlandBrowserState } from "./kodland-browser-cache";
const state = vi.hoisted(() => ({ uid: "local-owner", disk: null as KodlandBrowserState | null, fail: false, calls: [] as string[] }));
vi.mock("./kodland-sync-lock", async original => ({
 ...await original<typeof import("./kodland-sync-lock")>(),
 withKodlandSyncLock: () => { throw new Error("Remote write queue must not block local sync"); },
 withKodlandAutoSyncLock: () => { throw new Error("Remote write queue must not block local sync"); },
 withKodlandManualPriority: () => { throw new Error("Remote write queue must not block local sync"); },
}));
vi.mock("./firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: state.uid, getIdToken: async () => "fixture-token" } }), getFirebaseDb: vi.fn(() => { throw new Error("Firestore must not be used"); }) }));
vi.mock("./kodland-browser-cache", () => ({
  readKodlandBrowser: async (uid: string) => uid === "local-owner" ? structuredClone(state.disk) : null,
  readKodlandBrowserRows: async (uid: string, name: string) => uid === "local-owner" && state.disk?.active && name.startsWith("kodland_") ? structuredClone(state.disk.collections[name] ?? []) : null,
  updateKodlandBrowser: async (uid: string, mutate: (value: KodlandBrowserState) => void, owner: () => boolean) => {
    if (state.fail || uid !== "local-owner" || !owner()) throw new Error("Storage refused");
    const value = structuredClone(state.disk ?? { version: 1 as const, active: false, updatedAt: "", coreAt: "", collections: {}, groupCompletedAt: {}, automatic: {} });
    mutate(value); state.disk = value; return value;
  },
}));
import { kodlandApi } from "./api";
const base = () => ({ groups: [{ external_id: "g", title: "Turma", archived: false }], students: [{ id: "s", external_id: "s", external_class_id: "g", name: "Ana", hidden: false }], lessons: [], reviews: [], attendance: [], extra_lessons: [], availability: [], extra_lessons_synced: false, availability_synced: false });
beforeEach(() => {
 state.disk = null; state.uid = "local-owner"; state.fail = false; state.calls = [];
 vi.stubGlobal("fetch", vi.fn(async (_url, request) => {
  const body = JSON.parse(request.body); state.calls.push(body.mode);
  if (body.mode === "corrections") return Response.json({ ...base(), reviews: [], task_progress: [{ id: "p", external_class_id: "g", external_student_id: "s", lesson_id: "l", task_id: "t", task_title: "Projeto", state: "missing" }], review_group_ids: ["g"], attendance_group_ids: ["g"], attendance: [{ id: "a", external_class_id: "g", external_student_id: "s", lesson_id: "l", lesson_title: "Aula", status: "ABSENT" }] });
  return Response.json(base());
 }));
});
afterEach(() => vi.unstubAllGlobals());
it("sincroniza turmas e acompanhamento sem nenhuma dependência de Firestore", async () => {
 const result = await kodlandApi.syncAll("teacher", "not-a-real-password", undefined, { storage: "browser" });
 expect(result).toMatchObject({ storage: "browser", group_count: 1, student_count: 1 });
 expect(state.calls).toEqual(["essential", "corrections"]);
 expect((await kodlandApi.groups()).items).toMatchObject([{ title: "Turma" }]);
 expect((await kodlandApi.attendance()).items).toMatchObject([{ status: "ABSENT" }]);
 expect((await kodlandApi.taskProgress()).items).toMatchObject([{ state: "missing" }]);
 expect(JSON.stringify(state.disk)).not.toContain("not-a-real-password");
 expect(JSON.stringify(state.disk)).not.toContain("fixture-token");
});
it("uma falha local não descarta o snapshot anterior nem anuncia sucesso", async () => {
 await kodlandApi.sync("teacher", "fixture", "essential", { storage: "browser" });
 const before=structuredClone(state.disk);state.fail=true;
 await expect(kodlandApi.sync("teacher", "fixture", "corrections", { storage: "browser" })).rejects.toThrow("Storage refused");
 expect(state.disk).toEqual(before);
});
it("consulta parcial de presença preserva tarefas e o horário das atividades", async () => {
 await kodlandApi.syncAll("teacher", "fixture", undefined, { storage: "browser" });
 const before=structuredClone(state.disk!.groupCompletedAt);
 await kodlandApi.sync("teacher", "fixture", "corrections", { followupScope: "attendance", correctionGroupIds: ["g"], refreshSchedule: false });
 expect(state.disk!.groupCompletedAt).toEqual(before);
 expect((await kodlandApi.taskProgress()).items).toHaveLength(1);
});
it("troca de conta durante a consulta não grava o resultado nem expõe o cache anterior", async () => {
 vi.stubGlobal("fetch",vi.fn(async()=>{state.uid="other-owner";return Response.json(base());}));
 await expect(kodlandApi.sync("teacher", "fixture", "essential", { storage: "browser" })).rejects.toThrow("conta");
 expect(state.disk).toBeNull();
});

it("carrega materiais sob demanda e persiste apenas os links no cache local",async()=>{
 await kodlandApi.sync("teacher","fixture","essential",{storage:"browser"});
 const lesson={id:"l",source_lesson_id:"source",external_class_id:"g",classroom_tasks:[],slides_url:"",guide_url:"",homework_url:"",homework_title:"",materials_status:"pending"};
 state.disk!.collections.kodland_lessons=[lesson];
 vi.stubGlobal("fetch",vi.fn(async()=>Response.json({...base(),materials:[{group_id:"g",source_lesson_id:"source",materials_status:"ready",slides_url:"https://example.test/slides",guide_url:"",homework_url:"",homework_title:"",classroom_tasks:[]}]})));
 const updated=await kodlandApi.loadLessonMaterials(lesson,"teacher","fixture");
 expect(updated.slides_url).toBe("https://example.test/slides");
 expect(state.disk!.collections.kodland_lessons[0]).toMatchObject({materials_status:"ready",slides_url:"https://example.test/slides"});
});

it("não apresenta importação local parcial como acompanhamento completo para os alertas",async()=>{
 await kodlandApi.sync("teacher","fixture","essential",{storage:"browser"});
 expect(await kodlandApi.notificationSyncStatus()).toMatchObject({status:"running"});
 await kodlandApi.sync("teacher","fixture","corrections",{storage:"browser",refreshSchedule:false,correctionGroupIds:["g"]});
 expect(await kodlandApi.notificationSyncStatus()).toMatchObject({status:"complete"});
});
