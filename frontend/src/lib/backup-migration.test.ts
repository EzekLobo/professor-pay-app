import { createTaskCard, defaultTaskLists } from "./task-board";
import { defaultNotificationSettings, evaluateStudentNotifications } from "./student-notification-rules";
import { reconcileNotificationCases } from "./student-notification-store";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  batchSizes: [] as number[],
  failMigration: false,
  failBatch: false,
  userId: "test-user",
}));

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: fake.userId, email: "teacher@example.test", displayName: "Teacher", getIdToken: async () => "firebase-token" } }),
  getFirebaseDb: () => ({}),
}));
vi.mock("@/lib/firebase-auth", () => ({ reauthenticateWithFirebase: vi.fn(async () => undefined) }));
vi.mock("firebase/firestore", () => {
  const path = (value: unknown) => String(value);
  const snapshot = (key: string) => ({
    id: key.split("/").at(-1)!,
    exists: () => fake.docs.has(key),
    data: () => fake.docs.get(key),
  });
  const set = (key: string, value: Record<string, unknown>, merge = false) =>
    fake.docs.set(key, merge ? { ...(fake.docs.get(key) ?? {}), ...value } : value);
  return {
    collection: (_db: unknown, key: string) => key,
    doc: (collection: unknown, id: string) => `${path(collection)}/${id}`,
    query: (collection: unknown) => collection,
    orderBy: () => ({}),
    getDocs: async (collection: unknown) => ({ docs: [...fake.docs]
      .filter(([key]) => key.startsWith(`${path(collection)}/`) && key.slice(path(collection).length + 1).indexOf("/") < 0)
      .map(([key]) => ({ id: key.split("/").at(-1)!, data: () => fake.docs.get(key)! })) }),
    getDoc: async (key: unknown) => snapshot(path(key)),
    setDoc: async (key: unknown, value: Record<string, unknown>, options?: { merge: boolean }) => {
      set(path(key), value, options?.merge);
    },
    updateDoc: async (key: unknown, value: Record<string, unknown>) => { set(path(key), value, true); },
    deleteDoc: async (key: unknown) => { fake.docs.delete(path(key)); },
    writeBatch: () => {
      const writes: Array<() => void> = [];
      return {
        set: (key: unknown, value: Record<string, unknown>, options?: { merge: boolean }) =>
          writes.push(() => set(path(key), value, options?.merge)),
        update: (key: unknown, value: Record<string, unknown>) =>
          writes.push(() => set(path(key), value, true)),
        delete: (key: unknown) => writes.push(() => { fake.docs.delete(path(key)); }),
        commit: async () => { if (fake.failBatch) throw new Error("write failed"); fake.batchSizes.push(writes.length); writes.forEach((write) => write()); },
      };
    },
    runTransaction: async (_db: unknown, update: (transaction: {
      get: (key: unknown) => Promise<ReturnType<typeof snapshot>>;
      update: (key: unknown, value: Record<string, unknown>) => void;
    }) => Promise<unknown>) => {
      if (fake.failMigration) throw new Error("temporarily unavailable");
      const writes: Array<() => void> = [];
      const result = await update({
        get: async (key) => snapshot(path(key)),
        update: (key, value) => { writes.push(() => set(path(key), value, true)); },
      });
      writes.forEach((write) => write());
      return result;
    },
  };
});

import { dashboardApi, dataApi, kodlandApi, kodlandPayrollApi, manualTeachingApi } from "./api";
import { normalizePayroll } from "./kodland-payroll";

const key = (collection: string, id: string) => `users/test-user/${collection}/${id}`;
const lesson = (id: string, date = "2026-10-13") => ({
  id, class_id: "class-1", class_name_snapshot: "Particular", number: 1,
  lesson_date: date, type: "NORMAL", duration_minutes: 60,
  hourly_rate_cents: 3000, active: true, canceled: false, created_at: "2026-10-01",
});

beforeEach(() => {
  fake.docs.clear();
  fake.batchSizes.length = 0;
  fake.failMigration = false;
  fake.failBatch = false;
  fake.userId = "test-user";
});
afterEach(() => vi.unstubAllGlobals());

describe("payroll persistence", () => {
  const install = (fail = false, changeUser = false) => {
    const year = new Date().getUTCFullYear();
    const raw = { id: "p1", teacher: "22", period_start: `${year}-10-01`, payout_currency: "BRL", payout_amount: "0", projected_lessons: 0, entries: [] };
    const period = normalizePayroll(raw, raw, "22");
    vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
      const body = JSON.parse(String(options.body));
      if (changeUser) fake.userId = "another-user";
      if (fail && body.payroll_period_id) return Response.json({ code: "payroll_unavailable" }, { status: 503 });
      return Response.json({ groups: [], students: [], reviews: [], lessons: [], extra_lessons: [], availability: [],
        payroll_teacher_id: "22", payroll_period_ids: body.payroll_year === year ? ["p1"] : [], payroll_periods: body.payroll_period_id ? [period] : [] });
    }));
  };
  it("is idempotent and leaves received payments intact", async () => {
    install();
    const received = { status: "RECEIVED", total_cents: 999, payment_date: "2026-11-15" };
    fake.docs.set(key("payments", "2026-11-15"), received);
    await kodlandPayrollApi.sync("tutor", "password");
    await kodlandPayrollApi.sync("tutor", "password");
    expect((await kodlandPayrollApi.get()).periods).toHaveLength(1);
    expect(fake.docs.get(key("payments", "2026-11-15"))).toEqual(received);
  });
  it("does not overwrite the last import when a detail request fails", async () => {
    install(); await kodlandPayrollApi.sync("tutor", "password");
    const before = JSON.stringify([...fake.docs]);
    install(true);
    await expect(kodlandPayrollApi.sync("tutor", "password")).rejects.toThrow();
    expect(JSON.stringify([...fake.docs])).toBe(before);
  });
  it("rejects account switching and an existing binding to another teacher", async () => {
    install(false, true);
    await expect(kodlandPayrollApi.sync("tutor", "password")).rejects.toThrow("conta mudou");
    expect(fake.docs.size).toBe(0);
    fake.userId = "test-user";
    fake.docs.set(key("kodland_payroll_settings", "connection"), { teacher_id: "33" });
    install();
    await expect(kodlandPayrollApi.sync("tutor", "password")).rejects.toThrow("outro professor");
    expect(fake.docs.size).toBe(1);
  });
});

describe("backup e migração", () => {
  it("aceita backup v1, grava em lotes e restaura sem duplicar registros", async () => {
    const legacy = {
      schema_version: "1.0", exported_at: "2026-10-15T00:00:00Z",
      classes: [{ id: "class-1", name: "Particular", week_day: 1, start_time: "19:00",
        first_lesson_date: "2026-10-13", lesson_count: 1, duration_minutes: 60,
        hourly_rate_cents: 3000, active: true, created_at: "2026-10-01" }],
      lessons: Array.from({ length: 405 }, (_, index) => lesson(`lesson-${index}`, "2026-10-13")),
      payment_confirmations: [{ payment_date: "2026-11-15", status: "RECEIVED", received_at: "2026-11-15T00:00:00Z" }],
    };
    const preview = await dataApi.previewImport(legacy);
    expect(preview).toMatchObject({ lesson_count: 405, manual_class_count: 0, already_imported: false });
    await dataApi.import(legacy);
    expect(Math.max(...fake.batchSizes)).toBeLessThanOrEqual(400);
    expect(fake.docs.size).toBe(408);
    expect((await dataApi.import(legacy)).already_imported).toBe(true);
    expect(fake.docs.size).toBe(408);
    await dataApi.reset("password");
    expect(fake.docs.size).toBe(0);
    expect(Math.max(...fake.batchSizes)).toBeLessThanOrEqual(400);
  });

  it("exporta e restaura backup v4 com registros manuais, folhas oficiais e extrato fechado", async () => {
    const closed = { payment_date: "2026-11-15", period: "10/2026", lesson_count: 1,
      normal_count: 1, extra_count: 0, normal_total_cents: 3000,
      extra_total_cents: 0, total_cents: 3000, status: "RECEIVED", lessons: [] };
    fake.docs.set(key("manual_students", "student-1"), { id: "student-1", name: "Ana", created_at: "2026-10-01" });
    fake.docs.set(key("manual_class_groups", "personal-1"), { id: "personal-1", name: "Autônomas", order: 0, active: true, created_at: "2026-10-01" });
    fake.docs.set(key("manual_classes", "own-1"), { id: "own-1", name: "Própria", source: "manual",
      first_lesson_date: "2026-10-13", active: true, schedule_slots: [],
      group_id: "personal-1",
      rate_history: [{ effective_from: "2026-10-13", hourly_rate_cents: 5000 }], created_at: "2026-10-01" });
    fake.docs.set(key("manual_lesson_content", "content-1"), { id: "content-1", title: "Aula", created_at: "2026-10-01" });
    fake.docs.set(key("manual_activities", "activity-1"), { id: "activity-1", status: "completed", created_at: "2026-10-01" });
    fake.docs.set(key("manual_courses", "course-1"), { id: "course-1", name: "Curso", modules: [], created_at: "2026-10-01" });
    fake.docs.set(key("manual_occurrences", "occurrence-1"), { id: "occurrence-1", class_id: "own-1", lesson_date: "2026-10-13", status: "held", created_at: "2026-10-01" });
    fake.docs.set(key("manual_attendance", "attendance-1"), { id: "attendance-1", occurrence_id: "occurrence-1", student_id: "student-1", status: "PRESENT", created_at: "2026-10-01" });
    fake.docs.set(key("manual_availability", "availability-1"), { id: "availability-1", week_day: 1, start_time: "18:00", end_time: "21:00", created_at: "2026-10-01" });
    fake.docs.set(key("kodland_class_settings", "group-1"), { id: "group-1", payment_day: 20, created_at: "2026-10-01" });
    fake.docs.set(key("kodland_financial_overrides", "override-1"), { id: "override-1", financial_status: "HOLIDAY", created_at: "2026-10-01" });
    fake.docs.set(key("teaching_settings", "finance"), { rate_history: [{ effective_from: "2026-10-13", hourly_rate_cents: 4000 }] });
    fake.docs.set(key("teaching_settings", "preferences"), { default_duration_minutes: 60, kodland_enabled: false });
    fake.docs.set(key("kodland_payroll_periods", "teacher-period"), { teacher_id: "teacher", period_start: "2026-10-01", entries: [], created_at: "2026-10-01" });
    fake.docs.set(key("payments", "2026-11-15"), { payment_date: "2026-11-15", status: "RECEIVED",
      payment_snapshot: closed, created_at: "2026-10-01" });
    fake.docs.set(key("task_cards", "task-backup"), createTaskCard({ id: "task-backup", title: "Tarefa no backup" }));
    fake.docs.set(key("task_settings", "lists"), { lists: defaultTaskLists().filter((list) => list.id !== "waiting") });
    const notificationSettings = { ...defaultNotificationSettings("2026-10-01"), enabled: true };
    const notification = evaluateStudentNotifications([{ source: "manual", class_id: "c", class_name: "Turma", student_id: "s", student_name: "Ana", occurrence_id: "l", lesson_label: "M1L1", lesson_date: "2026-10-13", ended_at: "2026-10-13T20:00:00Z", active: true, cancelled: false, attendance: "absent", guardian_name: "Maria", guardian_phone: "55" }], [], notificationSettings, new Date("2026-10-15T12:00:00Z"))[0];
    const notificationCase = reconcileNotificationCases([], [notification], "2026-10-15T12:00:00Z")[0];
    fake.docs.set(key("notification_settings", "default"), notificationSettings);
    fake.docs.set(key("notification_cases", notification.id), notificationCase);
    fake.docs.set(key("kodland_task_progress", "progress-1"), { id: "progress-1", external_class_id: "k", external_student_id: "s", lesson_id: "l", task_id: "t", task_title: "Exercício", state: "missing" });
    const exported = await dataApi.export();
    expect(exported).toMatchObject({ schema_version: "4.0", kodland_payroll_periods: [{ teacher_id: "teacher" }], manual_students: [{ name: "Ana" }],
      manual_class_groups: [{ name: "Autônomas" }], manual_classes: [{ name: "Própria", group_id: "personal-1" }], teaching_settings: { id: "finance" },
      payment_confirmations: [{ payment_snapshot: closed }] });
    fake.docs.clear();
    const preview = await dataApi.previewImport(exported);
    expect(preview.task_card_count).toBe(1);
    expect(exported.task_settings).toHaveLength(1);
    expect(preview).toMatchObject({ manual_student_count: 1, manual_class_group_count: 1, manual_class_count: 1,
      manual_lesson_count: 1, manual_activity_count: 1, manual_course_count: 1,
      manual_occurrence_count: 1, manual_attendance_count: 1, manual_availability_count: 1 });
    await dataApi.import(exported);
    expect(fake.docs.get(key("task_cards", "task-backup"))?.title).toBe("Tarefa no backup");
    expect(fake.docs.get(key("task_settings", "lists"))?.lists).toHaveLength(3);
    expect(fake.docs.get(key("notification_settings", "default"))).toEqual(notificationSettings);
    expect(fake.docs.get(key("notification_cases", notification.id))).toMatchObject(notificationCase);
    expect(fake.docs.get(key("kodland_task_progress", "progress-1"))?.state).toBe("missing");
    expect(fake.docs.get(key("kodland_payroll_periods", "teacher-period"))?.teacher_id).toBe("teacher");
    expect(fake.docs.get(key("manual_classes", "own-1"))?.rate_history).toEqual([
      { effective_from: "2026-10-13", hourly_rate_cents: 5000 },
    ]);
    expect(fake.docs.get(key("payments", "2026-11-15"))?.payment_snapshot).toEqual(closed);
    expect(fake.docs.get(key("teaching_settings", "finance"))?.rate_history).toEqual([
      { effective_from: "2026-10-13", hourly_rate_cents: 4000 },
    ]);
    expect(fake.docs.get(key("teaching_settings", "preferences"))?.kodland_enabled).toBe(false);
  });

  it("mantém turmas legadas sem grupo e protege a exclusão de grupos com turmas", async () => {
    fake.docs.set(key("manual_classes", "legacy-own"), { id: "legacy-own", name: "Legada", source: "manual", created_at: "2026-10-01" });
    expect((await manualTeachingApi.classes())[0].group_id).toBeUndefined();

    const first = await manualTeachingApi.saveGroup({ name: "Depois", order: 4 });
    const renamed = await manualTeachingApi.saveGroup({ id: first.id, name: "Autônomas", order: 0, active: false });
    expect(renamed).toMatchObject({ name: "Autônomas", order: 0, active: false });
    const second = await manualTeachingApi.saveGroup({ name: "Ativas", order: 1 });
    expect((await manualTeachingApi.groups()).map((item) => item.id)).toEqual([renamed.id, second.id]);

    await manualTeachingApi.saveClass({ name: "Vinculada", group_id: second.id, first_lesson_date: "2026-10-13", schedule_slots: [{ id: "seg", week_day: 0, start_time: "19:00", duration_minutes: 60 }], student_ids: [], hourly_rate_cents: 5000, payment_day: 15 });
    await expect(manualTeachingApi.deleteGroup(second.id)).rejects.toMatchObject({ status: 409 });
    await expect(manualTeachingApi.saveClass({ name: "Sem grupo", first_lesson_date: "2026-10-13", schedule_slots: [{ id: "seg", week_day: 0, start_time: "19:00", duration_minutes: 60 }], student_ids: [], hourly_rate_cents: 5000, payment_day: 15 })).rejects.toMatchObject({ status: 400 });
    const empty = await manualTeachingApi.saveGroup({ name: "Vazio" });
    await manualTeachingApi.deleteGroup(empty.id);
    expect((await manualTeachingApi.groups()).some((item) => item.id === empty.id)).toBe(false);
  });

  it("congela recibo legado no primeiro acesso, mantém valor após tarifa e tolera falha parcial", async () => {
    fake.docs.set(key("lessons", "lesson-1"), lesson("lesson-1"));
    fake.docs.set(key("payments", "2026-11-15"), { payment_date: "2026-11-15",
      status: "RECEIVED", received_at: "2026-11-15T00:00:00Z", created_at: "2026-10-01" });
    fake.failMigration = true;
    expect((await dashboardApi.get()).payments.find((item) => item.payment_date === "2026-11-15")?.total_cents).toBe(3000);
    expect(fake.docs.get(key("payments", "2026-11-15"))?.payment_snapshot).toBeUndefined();
    fake.failMigration = false;
  fake.failBatch = false;
    await dashboardApi.get();
    expect((fake.docs.get(key("payments", "2026-11-15"))?.payment_snapshot as { total_cents: number }).total_cents).toBe(3000);
    fake.docs.set(key("lessons", "lesson-1"), { ...lesson("lesson-1"), hourly_rate_cents: 9000 });
    expect((await dashboardApi.get()).payments.find((item) => item.payment_date === "2026-11-15")?.total_cents).toBe(3000);
  });

  it("não duplica a aula materializada quando uma turma legada recebe recorrência", async () => {
    fake.docs.set(key("classes", "class-1"), {
      id: "class-1", name: "Particular", source: "manual", active: true,
      first_lesson_date: "2026-10-13", hourly_rate_cents: 3000,
      schedule_slots: [{ id: "tuesday", week_day: 1, start_time: "19:00",
        duration_minutes: 60, effective_from: "2026-10-13" }],
      created_at: "2026-10-01",
    });
    fake.docs.set(key("lessons", "old-lesson"), lesson("old-lesson"));
    const result = await dashboardApi.get();
    const sameDay = result.payments.flatMap((payment) => payment.lessons)
      .filter((item) => item.class_id === "class-1" && item.lesson_date === "2026-10-13");
    expect(sameDay).toHaveLength(1);
    expect(sameDay[0].id).toBe("old-lesson");
  });
});


describe("persistência e atualização dos alertas Kodland", () => {
  const install = (groups: Array<{ external_id: string; archived: boolean }> = []) => {
    fake.docs.set(key("kodland_students", "s"), { guardian_phone: "5511999990000", local_note: "Preservar" });
    fake.docs.set(key("kodland_lessons", "l"), { title: "M1L1", classroom_tasks: [{ title: "Projeto", url: "https://example.test/task/1" }], materials_status: "ready" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ groups, students: [], reviews: [], lessons: [], extra_lessons: [], availability: [], review_group_ids: ["g"], attendance_group_ids: ["g"], attendance: [{ id: "a", external_class_id: "g", external_student_id: "s", status: "ABSENT" }], task_progress: [{ id: "p", external_class_id: "g", external_student_id: "s", lesson_id: "l", task_id: "t", task_title: "Projeto", state: "missing" }] })));
  };
  it("sinaliza notificações somente após persistir presença/progresso e concluir os marcadores", async () => {
    install();
    const event = vi.fn(() => {
      expect(fake.docs.get(key("sync_status", "kodland"))?.status).toBe("complete");
      expect(fake.docs.get(key("sync_status", "corrections"))?.status).toBe("complete");
      expect(fake.docs.get(key("kodland_attendance", "a"))?.status).toBe("ABSENT");
      expect(fake.docs.get(key("kodland_task_progress", "p"))?.state).toBe("missing");
      return true;
    });
    vi.stubGlobal("window", { dispatchEvent: event });
    await kodlandApi.sync("fixture", "fixture", "corrections", { correctionGroupIds: ["g"], refreshSchedule: false });
    expect(event).toHaveBeenCalledOnce();
    expect(fake.docs.get(key("kodland_students", "s"))?.guardian_phone).toBe("5511999990000");
    expect(fake.docs.get(key("kodland_lessons", "l"))?.materials_status).toBe("ready");
    expect((await kodlandApi.followupState()).updatedAt.g).toBeTruthy();
  });
  it("desativa uma turma arquivada na Kodland sem substituir contatos e materiais", async () => {
    install([{ external_id: "g", archived: true }]);
    fake.docs.set(key("kodland_groups", "g"), { id: "g", external_id: "g", archived: false, local_class_id: "own-link" });
    await kodlandApi.sync("fixture", "fixture", "corrections", { refreshSchedule: false });
    expect(fake.docs.get(key("kodland_groups", "g"))).toMatchObject({ archived: true, local_class_id: "own-link" });
    expect(fake.docs.get(key("kodland_students", "s"))?.guardian_phone).toBe("5511999990000");
  });
  it("falha de gravação não notifica nem pode ser encoberta por outra sincronização", async () => {
    install(); fake.failBatch = true;
    const event = vi.fn(); vi.stubGlobal("window", { dispatchEvent: event });
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(kodlandApi.sync("fixture", "fixture", "corrections", { refreshSchedule: false })).rejects.toThrow("NexusClass");
      expect(event).not.toHaveBeenCalled();
      fake.docs.set(key("sync_status", "kodland"), { status: "complete", sync_id: "schedule-refresh" });
      expect(await kodlandApi.notificationSyncStatus()).toMatchObject({ status: "failed", followup_status: "failed" });
    } finally { errorLog.mockRestore(); }
  });
});

it("uma turma atualizada não encobre uma turma cujo progresso ficou incompleto", async () => {
  fake.docs.set(key("sync_status", "kodland"), { status: "complete", sync_id: "newer" });
  fake.docs.set(key("sync_status", "corrections"), { status: "complete", group_status: { a: "failed", b: "complete" } });
  expect(await kodlandApi.notificationSyncStatus()).toMatchObject({ status: "failed" });
});
