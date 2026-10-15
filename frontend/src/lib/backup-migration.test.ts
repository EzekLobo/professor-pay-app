import { beforeEach, describe, expect, it, vi } from "vitest";

const fake = vi.hoisted(() => ({
  docs: new Map<string, Record<string, unknown>>(),
  batchSizes: [] as number[],
  failMigration: false,
}));

vi.mock("@/lib/firebase", () => ({
  getFirebaseAuth: () => ({ currentUser: { uid: "test-user", email: "teacher@example.test", displayName: "Teacher" } }),
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
        commit: async () => { fake.batchSizes.push(writes.length); writes.forEach((write) => write()); },
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

import { dashboardApi, dataApi } from "./api";

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

  it("exporta e restaura backup v2 com registros manuais, tarifas e extrato fechado", async () => {
    const closed = { payment_date: "2026-11-15", period: "10/2026", lesson_count: 1,
      normal_count: 1, extra_count: 0, normal_total_cents: 3000,
      extra_total_cents: 0, total_cents: 3000, status: "RECEIVED", lessons: [] };
    fake.docs.set(key("manual_students", "student-1"), { id: "student-1", name: "Ana", created_at: "2026-10-01" });
    fake.docs.set(key("manual_classes", "own-1"), { id: "own-1", name: "Própria", source: "manual",
      first_lesson_date: "2026-10-13", active: true, schedule_slots: [],
      rate_history: [{ effective_from: "2026-10-13", hourly_rate_cents: 5000 }], created_at: "2026-10-01" });
    fake.docs.set(key("manual_lesson_content", "content-1"), { id: "content-1", title: "Aula", created_at: "2026-10-01" });
    fake.docs.set(key("manual_activities", "activity-1"), { id: "activity-1", status: "completed", created_at: "2026-10-01" });
    fake.docs.set(key("kodland_class_settings", "group-1"), { id: "group-1", payment_day: 20, created_at: "2026-10-01" });
    fake.docs.set(key("kodland_financial_overrides", "override-1"), { id: "override-1", financial_status: "HOLIDAY", created_at: "2026-10-01" });
    fake.docs.set(key("teaching_settings", "finance"), { rate_history: [{ effective_from: "2026-10-13", hourly_rate_cents: 4000 }] });
    fake.docs.set(key("payments", "2026-11-15"), { payment_date: "2026-11-15", status: "RECEIVED",
      payment_snapshot: closed, created_at: "2026-10-01" });
    const exported = await dataApi.export();
    expect(exported).toMatchObject({ schema_version: "2.0", manual_students: [{ name: "Ana" }],
      manual_classes: [{ name: "Própria" }], teaching_settings: { id: "finance" },
      payment_confirmations: [{ payment_snapshot: closed }] });
    fake.docs.clear();
    const preview = await dataApi.previewImport(exported);
    expect(preview).toMatchObject({ manual_student_count: 1, manual_class_count: 1,
      manual_lesson_count: 1, manual_activity_count: 1 });
    await dataApi.import(exported);
    expect(fake.docs.get(key("manual_classes", "own-1"))?.rate_history).toEqual([
      { effective_from: "2026-10-13", hourly_rate_cents: 5000 },
    ]);
    expect(fake.docs.get(key("payments", "2026-11-15"))?.payment_snapshot).toEqual(closed);
    expect(fake.docs.get(key("teaching_settings", "finance"))?.rate_history).toEqual([
      { effective_from: "2026-10-13", hourly_rate_cents: 4000 },
    ]);
  });

  it("congela recibo legado no primeiro acesso, mantém valor após tarifa e tolera falha parcial", async () => {
    fake.docs.set(key("lessons", "lesson-1"), lesson("lesson-1"));
    fake.docs.set(key("payments", "2026-11-15"), { payment_date: "2026-11-15",
      status: "RECEIVED", received_at: "2026-11-15T00:00:00Z", created_at: "2026-10-01" });
    fake.failMigration = true;
    expect((await dashboardApi.get()).payments.find((item) => item.payment_date === "2026-11-15")?.total_cents).toBe(3000);
    expect(fake.docs.get(key("payments", "2026-11-15"))?.payment_snapshot).toBeUndefined();
    fake.failMigration = false;
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
