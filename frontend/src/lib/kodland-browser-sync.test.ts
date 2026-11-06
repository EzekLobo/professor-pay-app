import { scopedOccurrenceKey, type KodlandScopedOccurrence } from "./kodland-scoped-sync";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { KodlandBrowserState } from "./kodland-browser-cache";
const state = vi.hoisted(() => ({ uid: "local-owner", disk: null as KodlandBrowserState | null, fail: false, calls: [] as string[] }));
vi.mock("./kodland-storage-policy", () => ({ kodlandStoragePolicy: async () => "browser" }));
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

it("inicializa o cache ao adotar política do administrador numa atualização automática parcial",async()=>{
 const fetch=vi.fn(async(_url,request)=>Response.json({...base(),review_group_ids:["g"],attendance_group_ids:JSON.parse(request.body).followup_scope === "activities" ? [] : ["g"],task_progress:[]}));vi.stubGlobal("fetch",fetch);
 await kodlandApi.sync("teacher","fixture","corrections",{automatic:true,refreshSchedule:false,correctionGroupIds:["g"],followupScope:"activities"});
 expect(fetch.mock.calls.map(call=>JSON.parse(call[1].body).mode)).toEqual(["essential","corrections"]);
 expect((await kodlandApi.groups()).items).toHaveLength(1);expect(state.disk!.attendanceCompletedAt?.g).toBeTruthy();
 await kodlandApi.sync("teacher","fixture","corrections",{automatic:true,refreshSchedule:false,correctionGroupIds:["g"],followupScope:"activities"});
 expect(JSON.parse(fetch.mock.lastCall![1].body).followup_scope).toBe("activities");
});

it("sincronização total busca materiais pendentes e os reutiliza", async () => {
 const lesson = { id: "l", source_lesson_id: "source", external_class_id: "g", title: "Aula", classroom_tasks: [], materials_status: "pending" };
 vi.stubGlobal("fetch", vi.fn(async (_url, request) => {
  const body = JSON.parse(request.body); state.calls.push(body.mode);
  if (body.mode === "materials") return Response.json({ ...base(), materials: body.material_requests.map((item: object) => ({ ...item, materials_status: "ready", slides_url: "https://example.test/slides", guide_url: "", homework_url: "", homework_title: "", classroom_tasks: [] })) });
  if (body.mode === "corrections") return Response.json({ ...base(), review_group_ids: ["g"], attendance_group_ids: ["g"], task_progress: [] });
  return Response.json({ ...base(), lessons: [lesson] });
 }));
 const result = await kodlandApi.syncAll("teacher", "fixture", undefined, { storage: "browser" });
 expect(result.material_count).toBe(1);
 expect(state.disk!.collections.kodland_lessons).toEqual(expect.arrayContaining([expect.objectContaining({ materials_status: "ready", slides_url: "https://example.test/slides" })]));
 await kodlandApi.syncAll("teacher", "fixture", undefined, { storage: "browser" });
 expect(state.calls.filter(mode => mode === "materials")).toHaveLength(1);
});


it("persiste a sessão exata no navegador sem depender de Firestore ou da fila remota", async () => {
  await kodlandApi.sync("teacher", "fixture", "essential", { storage: "browser" });
  const occurrence: KodlandScopedOccurrence = { kind: "lesson", id: "local-lesson", group_id: "g", source_lesson_id: "source", lesson_date: "2026-11-04", start_time: "18:00", end_time: "19:00" };
  state.disk!.collections.kodland_lessons = [{ id: occurrence.id, external_class_id: "g", source_lesson_id: "source", lesson_date: occurrence.lesson_date, start_time: occurrence.start_time, end_time: occurrence.end_time }];
  const url = "https://learn.kodland.org/pt/class-room?sessionId=classroom-session";
  const fetch = vi.fn(async (_url, init) => {
    expect(JSON.parse(init.body)).toMatchObject({ mode: "scoped", browser_occurrence: true, scoped_request: { scope: "call_link" } });
    return Response.json({ ...base(), scoped: { scope: "call_link", complete: true, occurrence_key: scopedOccurrenceKey(occurrence), call_url: url } });
  });
  vi.stubGlobal("fetch", fetch);
  expect(await kodlandApi.syncScope("teacher", "fixture", { scope: "call_link", occurrence }, undefined, { automatic: true })).toMatchObject({ updated: 1, call_url: url });
  expect(state.disk!.collections.kodland_lessons[0]).toMatchObject({ call_url: url, call_occurrence_key: scopedOccurrenceKey(occurrence) });
  const before = structuredClone(state.disk);
  await expect(kodlandApi.syncScope("teacher", "fixture", { scope: "call_link", occurrence: { ...occurrence, start_time: "17:00" } })).rejects.toThrow("horário");
  expect(state.disk).toEqual(before);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("descobre extras da semana e busca suas gravações usando somente o cache do navegador", async () => {
  const extra: KodlandBrowserState["collections"][string][number] = { id: "kodland-extra-new", external_id: "provider-extra", external_student_id: "s", external_class_id: "g", external_class_name: "Turma", student_name: "Ana", lesson_date: "2026-11-04", start_time: "18:00", end_time: "19:00", status: "planned", completed: false };
  state.disk = { version: 1, active: true, updatedAt: "", coreAt: "", collections: { kodland_groups: [{ id: "g", external_id: "g", title: "Turma" }], kodland_students: [{ id: "s", external_id: "s", external_class_id: "g", external_class_name: "Turma", name: "Ana" }], kodland_lessons: [], kodland_extra_lessons: [] }, groupCompletedAt: {}, automatic: {} };
  const fetch = vi.fn(async (_url, init) => {
    const request = JSON.parse(init.body);
    if (request.scoped_request.scope === "extras_discovery") return Response.json({ ...base(), scoped: { scope: "extras_discovery", complete: true, updated: 0 }, extra_lessons: [extra] });
    return Response.json({ ...base(), scoped: { scope: "recordings", complete: true, updated: 0, occurrence_key: scopedOccurrenceKey({ kind: "extra", id: "kodland-extra-new", group_id: "g", source_lesson_id: "kodland-extra-new", lesson_date: "2026-11-04", start_time: "18:00", end_time: "19:00" }), recording_url: "https://example.test/recording" } });
  });
  vi.stubGlobal("fetch", fetch);
  await kodlandApi.syncScope("teacher", "fixture", { scope: "extras_discovery", week_date: "2026-11-04", known_extra_ids: [], time_zone: "America/Sao_Paulo" }, undefined, { automatic: true });
  expect(state.disk!.collections.kodland_extra_lessons).toMatchObject([{ id: "kodland-extra-new", external_class_id: "g", student_name: "Ana", manual_status: "PENDING" }]);
  const occurrence: KodlandScopedOccurrence = { kind: "extra", id: "kodland-extra-new", group_id: "g", source_lesson_id: "kodland-extra-new", lesson_date: "2026-11-04", start_time: "18:00", end_time: "19:00" };
  await kodlandApi.syncScope("teacher", "fixture", { scope: "recordings", occurrence }, undefined, { automatic: true });
  expect(state.disk!.collections.kodland_extra_lessons[0]).toMatchObject({ recording_url: "https://example.test/recording" });
  expect(fetch.mock.calls.map(call => JSON.parse(call[1].body).browser_occurrence)).toEqual([true, true]);
});

it("grava presença da ocorrência no cache local sem depender de Firestore", async () => {
  const occurrence: KodlandScopedOccurrence = { kind: "lesson", id: "local-lesson", group_id: "g", source_lesson_id: "source", lesson_date: "2026-11-04", start_time: "18:00", end_time: "19:00" };
  state.disk = { version: 1, active: true, updatedAt: "", coreAt: "", collections: { kodland_groups: [{ id: "g", external_id: "g", title: "Turma" }], kodland_students: [], kodland_lessons: [{ id: occurrence.id, external_class_id: "g", source_lesson_id: "source", lesson_date: occurrence.lesson_date, start_time: occurrence.start_time, end_time: occurrence.end_time }], kodland_attendance: [] }, groupCompletedAt: {}, automatic: {} };
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ...base(), scoped: { scope: "attendance", complete: true, occurrence_key: scopedOccurrenceKey(occurrence) }, attendance: [{ id: "attendance-1", external_class_id: "g", external_student_id: "s", lesson_id: "source", lesson_title: "Aula", status: "PRESENT" }] })));
  await kodlandApi.syncScope("teacher", "fixture", { scope: "attendance", occurrence }, undefined, { automatic: true });
  expect(state.disk!.collections.kodland_attendance).toMatchObject([{ id: "attendance-1", external_class_id: "g", lesson_id: "source", status: "PRESENT" }]);
});

it("preserva saldo de aulas no cache e aceita um zero confirmado na leitura de perfis", async () => {
 await kodlandApi.sync("teacher","fixture","essential",{storage:"browser"});
 Object.assign(state.disk!.collections.kodland_students[0],{lesson_credits_remaining:9,lesson_credits_updated_at:"old",local_note:"Nota"});
 await kodlandApi.sync("teacher","fixture","essential",{storage:"browser"});
 expect(state.disk!.collections.kodland_students[0]).toMatchObject({lesson_credits_remaining:9,lesson_credits_updated_at:"old"});
 vi.stubGlobal("fetch",vi.fn(async()=>{const payload=base();Object.assign(payload.students[0],{lesson_credits_remaining:0,lesson_credits_updated_at:"new"});return Response.json(payload);}));
 await kodlandApi.sync("teacher","fixture","profiles",{storage:"browser"});
 expect(state.disk!.collections.kodland_students[0]).toMatchObject({lesson_credits_remaining:0,lesson_credits_updated_at:"new"});
 expect(state.disk!.collections.kodland_students[0]).not.toHaveProperty("local_note");
});

it("atualiza saldos em IDs locais legados sem inserir aluno duplicado", async () => {
 await kodlandApi.sync("teacher","fixture","essential",{storage:"browser"});
 const student=state.disk!.collections.kodland_students[0];
 student.id="legacy-local";
 const externalId=student.external_id;
 state.disk!.collections.kodland_students.push({...student,id:"second-enrolment",external_class_id:"other"});
 vi.stubGlobal("fetch",vi.fn(async()=>{const payload=base();Object.assign(payload.students[0],{external_id:externalId,lesson_credits_remaining:17,lesson_credits_updated_at:"new"});return Response.json(payload);}));
 await kodlandApi.sync("teacher","fixture","profiles",{storage:"browser"});
 expect(state.disk!.collections.kodland_students).toMatchObject([
  {id:"legacy-local",lesson_credits_remaining:17},
  {id:"second-enrolment",external_class_id:"other",lesson_credits_remaining:17},
 ]);
 expect(state.disk!.collections.kodland_students).toHaveLength(2);
});
