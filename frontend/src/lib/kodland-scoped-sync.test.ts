import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SyncExecutionContext } from "./sync-coordinator";
import { scopedOccurrenceKey, type KodlandScopedOccurrence } from "./kodland-scoped-sync";

const mock = vi.hoisted(() => ({ uid: "owner", records: new Map<string, Record<string, unknown>>(), commits: 0 }));
vi.mock("./firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: mock.uid, getIdToken: async () => "firebase-token" } }), getFirebaseDb: () => ({}) }));
vi.mock("firebase/firestore", async original => ({
  ...await original<typeof import("firebase/firestore")>(),
  collection: (_db: unknown, path: string) => path,
  doc: (...args: unknown[]) => args.filter(value => typeof value === "string").join("/"),
  query: (path: unknown) => path, orderBy: vi.fn(),
  getDoc: async (path: string) => ({ exists: () => mock.records.has(path), data: () => mock.records.get(path) }),
  getDocs: async (path: string) => ({ docs: [...mock.records].filter(([key]) => key.startsWith(path + "/")).map(([key, value]) => ({ id: key.split("/").at(-1), data: () => value })) }),
  writeBatch: () => {
    const operations: Array<() => void> = [];
    return { set: (path: string, value: Record<string, unknown>) => operations.push(() => mock.records.set(path, value)), update: (path: string, value: Record<string, unknown>) => operations.push(() => mock.records.set(path, { ...mock.records.get(path), ...value })), delete: (path: string) => operations.push(() => mock.records.delete(path)), commit: async () => { mock.commits++; operations.forEach(run => run()); } };
  },
  runTransaction: async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) => {
    const operations: Array<() => void> = [];
    const result = await callback({ get: async (path: string) => ({ exists: () => mock.records.has(path), data: () => mock.records.get(path) }), set: (path: string, value: Record<string, unknown>) => operations.push(() => mock.records.set(path, value)), update: (path: string, value: Record<string, unknown>) => operations.push(() => mock.records.set(path, { ...mock.records.get(path), ...value })) });
    mock.commits++; operations.forEach(run => run()); return result;
  },
}));
import { kodlandApi } from "./api";
const occurrence: KodlandScopedOccurrence = { kind: "extra", id: "kodland-extra-1", group_id: "g1", source_lesson_id: "1", lesson_date: "2026-10-28", start_time: "18:00", end_time: "19:00" };
const snapshot = (scope: string, details: Record<string, unknown> = {}, data: Record<string, unknown> = {}) => ({ groups: [], students: [], lessons: [], reviews: [], extra_lessons: [], availability: [], scoped: { scope, complete: true, updated: 0, ...details }, ...data });
const context = (assertLease = vi.fn(async () => undefined)) => ({ uid: "owner", signal: new AbortController().signal, assertCurrent: vi.fn(), assertLease } as unknown as SyncExecutionContext);
beforeEach(() => { mock.uid = "owner"; mock.records.clear(); mock.commits = 0; });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("scoped persistence", () => {
  it("patches only points of imported students and keeps unrelated reviews", async () => {
    mock.records.set("users/owner/kodland_students/kodland-student-7", { external_class_id: "g1", name: "Nome local", phone: "123", progress_summary: "1/20" });
    mock.records.set("users/owner/kodland_reviews/unrelated", { external_class_id: "g2" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(snapshot("activities", { ranking_complete: true }, { review_group_ids: ["g1"], task_progress: [], ranking: [{ id: "kodland-student-7", external_class_id: "g1", progress_summary: "15/20" }, { id: "new-student", external_class_id: "g1", progress_summary: "10/20" }] }))));
    await kodlandApi.syncScope("teacher", "secret", { scope: "activities", group_ids: ["g1"] }, context());
    expect(mock.records.get("users/owner/kodland_students/kodland-student-7")).toEqual({ external_class_id: "g1", name: "Nome local", phone: "123", progress_summary: "15/20" });
    expect(mock.records.has("users/owner/kodland_students/new-student")).toBe(false); expect(mock.records.has("users/owner/kodland_reviews/unrelated")).toBe(true);
  });
  it("does not mutate when the account changes after the response", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { mock.uid = "other"; return Response.json(snapshot("activities")); }));
    await expect(kodlandApi.syncScope("teacher", "secret", { scope: "activities" }, context())).rejects.toThrow(); expect(mock.commits).toBe(0);
  });
  it("checks the lease before any persistence", async () => {
    mock.records.set("users/owner/kodland_students/kodland-student-7", { external_class_id: "g1" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(snapshot("activities", { ranking_complete: true }, { review_group_ids: ["g1"], task_progress: [], ranking: [{ id: "kodland-student-7", external_class_id: "g1", progress_summary: "15/20" }] }))));
    await expect(kodlandApi.syncScope("teacher", "secret", { scope: "activities" }, context(vi.fn(async () => { throw new Error("lease lost"); })))).rejects.toThrow("lease lost"); expect(mock.commits).toBe(0);
  });
  it("records a valid negative final check without overriding a concurrent manual DONE", async () => {
    const path = "users/owner/kodland_extra_lessons/kodland-extra-1";
    mock.records.set(path, { external_class_id: "g1", lesson_date: occurrence.lesson_date, start_time: "18:00", end_time: "19:00", manual_status: "PENDING", completed: false });
    vi.stubGlobal("fetch", vi.fn(async () => { mock.records.set(path, { ...mock.records.get(path), manual_status: "DONE", completed: true }); return Response.json(snapshot("extra_final_check", { final_completed: false, occurrence_key: scopedOccurrenceKey(occurrence) })); }));
    await kodlandApi.syncScope("teacher", "secret", { scope: "extra_final_check", occurrence }, context());
    expect(mock.records.get(path)).toMatchObject({ manual_status: "DONE", completed: true }); expect(mock.records.get(path)?.final_checked_at).toBeTypeOf("string");
  });
  it("rejects a result after the local occurrence was rescheduled", async () => {
    mock.records.set("users/owner/kodland_extra_lessons/kodland-extra-1", { external_class_id: "g1", lesson_date: "2026-10-30", start_time: "18:00", end_time: "19:00" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(snapshot("call_link", { call_url: "https://learn.kodland.org/pt/class-room?sessionId=session", occurrence_key: scopedOccurrenceKey(occurrence) }))));
    await expect(kodlandApi.syncScope("teacher", "secret", { scope: "call_link", occurrence }, context())).rejects.toThrow(); expect(mock.commits).toBe(0);
  });
});
describe("ranking-only persistence", () => {
  it("does not remove reviews of the same group when retrying points", async () => {
    mock.records.set("users/owner/kodland_students/kodland-student-7", { external_class_id: "g1", progress_summary: "1/20" });
    mock.records.set("users/owner/kodland_reviews/existing", { external_class_id: "g1" });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(snapshot("ranking", { ranking_complete: true }, { review_group_ids: ["g1"], task_progress: [], ranking: [{ id: "kodland-student-7", external_class_id: "g1", progress_summary: "15/20" }] }))));
    const result = await kodlandApi.syncScope("teacher", "secret", { scope: "ranking", group_ids: ["g1"] }, context());
    expect(mock.records.has("users/owner/kodland_reviews/existing")).toBe(true); expect(result.domains).toEqual(["ranking"]);
  });
});
