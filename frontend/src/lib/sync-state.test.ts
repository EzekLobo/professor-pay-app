import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({ uid: "u", values: new Map<string, Record<string, unknown>>(), reads: 0, lists: 0 }));
vi.mock("./firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: fake.uid } }), getFirebaseDb: () => ({}) }));
vi.mock("firebase/firestore", () => {
  const snapshot = (path: string) => ({ exists: () => fake.values.has(path), data: () => fake.values.get(path) });
  return {
    doc: (_db: unknown, ...parts: string[]) => parts.join("/"),
    collection: (_db: unknown, ...parts: string[]) => parts.join("/"),
    getDoc: async (path: string) => { fake.reads++; return snapshot(path); },
    getDocs: async (path: string) => { fake.lists++; return { docs: [...fake.values].filter(([key]) => key.startsWith(path + "/")).map(([key, data]) => ({ id: key.slice(path.length + 1), data: () => data })) }; },
    runTransaction: async (_db: unknown, callback: (transaction: unknown) => Promise<unknown>) => {
      const writes: Array<() => void> = [];
      const result = await callback({ get: async (path: string) => snapshot(path), set: (path: string, data: Record<string, unknown>) => writes.push(() => { fake.values.set(path, data); }) });
      writes.forEach(write => write()); return result;
    },
  };
});
import { createFirestoreSyncStateStore, emptySyncState, syncStateDocumentId } from "./sync-state";
const identity = { key: "attendance:one", scope: "attendance" as const, resourceId: "one" };
const path = (key: string) => `users/u/sync_status/${key}`;
beforeEach(() => { fake.uid = "u"; fake.values.clear(); fake.reads = 0; fake.lists = 0; });

describe("durable synchronization state", () => {
  it("bypasses the metadata TTL when a skipped claim or external revision needs authoritative state", async () => {
    const store = createFirestoreSyncStateStore("u"), reference = path(syncStateDocumentId(identity.key));
    fake.values.set(reference, { ...emptySyncState(identity), last_attempt_at: 10 });
    expect((await store.read(identity)).completed).toBe(false);
    fake.values.set(reference, { ...emptySyncState(identity), last_attempt_at: 10, completed: true });
    expect((await store.read(identity)).completed).toBe(false);
    expect((await store.read(identity, true)).completed).toBe(true);
    expect(fake.reads).toBe(2);
  });
  it("migrates an old off-state timestamp to explicit activation without deleting tracked states", async () => {
    const old = Date.parse("2026-09-01T12:00:00Z"), now = Date.parse("2026-10-30T12:00:00Z");
    fake.values.set(path("auto_config"), { initialised_at: old, policy_version: 1 });
    const pending = { ...emptySyncState(identity), last_attempt_at: old + 1, status: "error" };
    fake.values.set(path(syncStateDocumentId(identity.key)), pending);
    const store = createFirestoreSyncStateStore("u");
    expect(await store.initialisedAt(now)).toBe(now);
    expect(await store.initialisedAt(now + 1000)).toBe(now);
    expect(fake.values.get(path("auto_config"))).toMatchObject({ initialised_at: old, activation_at: now, activation_version: 1, policy_version: 1 });
    expect(fake.values.get(path(syncStateDocumentId(identity.key)))).toEqual(pending);
  });
  it("loads existing occurrence states once without adding new policy/index requirements", async () => {
    const complete = { ...emptySyncState(identity), last_attempt_at: 10, completed: true };
    const recording = { key: "recordings:two", scope: "recordings" as const, resourceId: "two" };
    fake.values.set(path(syncStateDocumentId(identity.key)), complete);
    fake.values.set(path(syncStateDocumentId(recording.key)), { ...emptySyncState(recording), last_attempt_at: 12 });
    fake.values.set(path("auto_lock"), { key: identity.key, token: "lease" });
    fake.values.set(path("auto_entry_invalid"), { ...emptySyncState(identity), policy_version: 999 });
    const store = createFirestoreSyncStateStore("u"), tracked = await store.trackedStates();
    expect(tracked.map(state => state.key).sort()).toEqual(["attendance:one", "recordings:two"]);
    expect(tracked.find(state => state.key === identity.key)?.completed).toBe(true);
    expect(fake.lists).toBe(1);
  });
});
