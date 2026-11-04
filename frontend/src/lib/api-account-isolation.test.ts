import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const data = vi.hoisted(() => ({ uid: "A" as string | null, records: new Map<string, Record<string, unknown>>(), writes: [] as string[], onRead: undefined as undefined | (() => void) }));
vi.mock("./firebase", () => ({ getFirebaseAuth: () => ({ currentUser: data.uid ? { uid: data.uid, getIdToken: async () => "synthetic" } : null }), getFirebaseDb: () => ({}) }));
vi.mock("firebase/firestore", async original => ({
  ...await original<typeof import("firebase/firestore")>(),
  collection: (_db: unknown, path: string) => path,
  doc: (...parts: unknown[]) => parts.filter(value => typeof value === "string").join("/"),
  query: (path: unknown) => path, orderBy: vi.fn(),
  getDoc: async (path: string) => { const value = data.records.get(path); data.onRead?.(); return { exists: () => !!value, data: () => value }; },
  getDocs: async (path: string) => { const docs = [...data.records].filter(([key]) => key.startsWith(path + "/")).map(([key, value]) => ({ id: key.split("/").at(-1), data: () => value })); data.onRead?.(); return { docs }; },
  setDoc: async (path: string, value: Record<string, unknown>) => { data.writes.push(path); data.records.set(path, value); },
  updateDoc: async (path: string, value: Record<string, unknown>) => { data.writes.push(path); data.records.set(path, { ...data.records.get(path), ...value }); },
  deleteDoc: async (path: string) => { data.writes.push(path); data.records.delete(path); },
  writeBatch: () => { const operations: Array<() => void> = []; return {
    set: (path: string, value: Record<string, unknown>) => operations.push(() => { data.writes.push(path); data.records.set(path, value); }),
    update: (path: string, value: Record<string, unknown>) => operations.push(() => { data.writes.push(path); data.records.set(path, { ...data.records.get(path), ...value }); }),
    delete: (path: string) => operations.push(() => { data.writes.push(path); data.records.delete(path); }),
    commit: async () => operations.forEach(operation => operation()),
  }; },
}));
import { classesApi, dashboardApi, lessonsApi, manualTeachingApi, paymentsApi, tutorPreferencesApi } from "./api";
const date = "2026-11-15";
const payment = { payment_date: date, status: "EXPECTED", total_cents: 10000, lessons: [] };
beforeEach(() => { data.uid = "A"; data.records.clear(); data.writes.length = 0; data.onRead = undefined; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("account-bound asynchronous mutations", () => {
  for (const next of ["B", null]) it(`does not confirm under another session (${next ?? "logout"})`, async () => {
    vi.spyOn(dashboardApi, "get").mockImplementation(async () => { data.uid = next; return { payments: [payment] } as never; });
    await expect(paymentsApi.confirm(date)).rejects.toMatchObject({ status: 401 });
    expect(data.writes).toEqual([]);
  });
  it("confirms in the initiating account when its session remains active", async () => {
    vi.spyOn(dashboardApi, "get").mockResolvedValue({ payments: [payment] } as never);
    await paymentsApi.confirm(date);
    expect(data.writes).toEqual([`users/A/payments/${date}`]);
    expect(data.records.get(`users/A/payments/${date}`)).toMatchObject({ status: "RECEIVED", payment_snapshot: { total_cents: 10000 } });
  });
  it("does not save a student after the previous-record lookup changes accounts", async () => {
    data.onRead = () => { data.uid = "B"; };
    await expect(manualTeachingApi.saveStudent({ id: "student", name: "Synthetic" })).rejects.toMatchObject({ status: 401 });
    expect(data.writes).toEqual([]);
  });
  it("does not change a class after an account switch during its lookup", async () => {
    data.records.set("users/A/classes/group", { name: "Original", active: true });
    data.onRead = () => { data.uid = "B"; };
    await expect(classesApi.update("group", { name: "Changed" })).rejects.toMatchObject({ status: 401 });
    expect(data.writes).toEqual([]);
  });
  it("does not save preferences after their read belongs to a previous session", async () => {
    vi.spyOn(tutorPreferencesApi, "get").mockImplementation(async () => { data.uid = "B"; return {} as never; });
    await expect(tutorPreferencesApi.save({ kodland_enabled: false })).rejects.toMatchObject({ status: 401 });
    expect(data.writes).toEqual([]);
  });
});

describe("only received payments freeze their lessons", () => {
  it("allows editing an overdue unpaid lesson", async () => {
    data.records.set(`users/A/payments/${date}`, { payment_date: date, status: "OVERDUE", received_at: "" });
    data.records.set("users/A/lessons/lesson", { lesson_date: "2026-10-29", active: true });
    await paymentsApi.updateLessonFinancialStatus(date, "lesson", undefined, "BILLABLE");
    expect(data.records.get("users/A/lessons/lesson")?.financial_status).toBe("BILLABLE");
  });
  for (const record of [{ status: "RECEIVED", received_at: "" }, { status: "", received_at: "2026-10-30T12:00:00Z" }]) it(`keeps received protection (${record.status || "legacy receipt"})`, async () => {
    data.records.set(`users/A/payments/${date}`, { payment_date: date, ...record });
    await expect(paymentsApi.updateLessonFinancialStatus(date, "lesson", undefined, "BILLABLE")).rejects.toMatchObject({ status: 409 });
    expect(data.writes).toEqual([]);
  });
  it("allows canceling a lesson whose payment is only overdue", async () => {
    data.records.set(`users/A/payments/${date}`, { payment_date: date, status: "OVERDUE", received_at: "" });
    data.records.set("users/A/lessons/lesson", { lesson_date: "2026-10-29", active: true, duration_minutes: 60, hourly_rate_cents: 5000 });
    await lessonsApi.cancel("lesson");
    expect(data.records.get("users/A/lessons/lesson")?.canceled).toBe(true);
  });
});

it("keeps the automatic extra recording and final check across a real manual schedule persistence", async () => {
  const extra = { id: "kodland-extra-1", external_student_id: "s", student_name: "Synthetic", external_class_id: "g", external_class_name: "Group", lesson_date: "2026-10-29", start_time: "18:00", end_time: "19:00", status: "planned", completed: false };
  const saved = { ...extra, recording_url: "https://example.test/extra-recording", final_checked_at: "2026-10-30T03:00:00Z", created_at: "2026-10-01" };
  data.records.set("users/A/kodland_extra_lessons/kodland-extra-1", saved);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ groups: [], students: [], reviews: [], attendance: [], lessons: [], extra_lessons: [extra], extra_lessons_synced: true, extra_lessons_complete: true, availability: [], availability_synced: false })));
  const { kodlandApi } = await import("./api");
  const context = { uid: "A", signal: new AbortController().signal, assertCurrent: () => undefined, assertLease: async () => undefined, previous: {} };
  await kodlandApi.sync("synthetic", "synthetic", "schedule", {}, context as never);
  expect(data.records.get("users/A/kodland_extra_lessons/kodland-extra-1")).toMatchObject({ recording_url: saved.recording_url, final_checked_at: saved.final_checked_at });
});
it("cancels dashboard materialization before backfilling records from a different session", async () => {
  data.records.set(`users/A/payments/${date}`, { payment_date: date, status: "RECEIVED", received_at: "2026-10-30T12:00:00Z" });
  data.onRead = () => { data.uid = "B"; };
  await expect(dashboardApi.get()).rejects.toMatchObject({ status: 401 });
  expect(data.writes).toEqual([]);
});
