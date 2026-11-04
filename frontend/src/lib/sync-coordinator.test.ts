import { afterEach, describe, expect, it, vi } from "vitest";
import { SyncCancelledError, SyncCoordinator, type SyncJob } from "./sync-coordinator";
import { createMemorySyncStateStore, syncStateDocumentId } from "./sync-state";
import type { SyncDataEvent } from "./sync-events";

afterEach(() => vi.useRealTimers());
const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};
function setup() {
  let owner: string | null = "owner", now = 10_000;
  const events: SyncDataEvent[] = [], store = createMemorySyncStateStore();
  const coordinator = new SyncCoordinator({ uid: "owner", store, currentOwner: () => owner, now: () => now, available: () => true, publish: event => events.push(event) });
  return { coordinator, store, events, changeOwner: (value: string | null) => { owner = value; }, advance: (amount: number) => { now += amount; }, now: () => now };
}
const job = (key: string): SyncJob<string> => ({ key, scope: "attendance", resourceId: key, isDue: state => !state.completed, run: async context => { await context.assertLease(); return { value: key, domains: ["attendance"] }; } });

describe("sync coordinator", () => {
  it("shares an in-flight promise and serializes other scopes", async () => {
    const test = setup(), gate = deferred<void>(), started: string[] = [];
    const first = { ...job("first"), run: async () => { started.push("first"); await gate.promise; return { value: "first" }; } };
    const firstPromise = test.coordinator.enqueue(first);
    expect(test.coordinator.enqueue(first)).toBe(firstPromise);
    const second = test.coordinator.enqueue({ ...job("second"), run: async () => { started.push("second"); return { value: "second" }; } });
    await vi.waitFor(() => expect(started).toEqual(["first"]));
    gate.resolve();
    await Promise.all([firstPromise, second]);
    expect(started).toEqual(["first", "second"]);
  });
  it("persisted completion suppresses another coordinator after reload", async () => {
    const test = setup(), work = job("saved");
    await test.coordinator.enqueue(work);
    const restored = new SyncCoordinator({ uid: "owner", store: test.store, currentOwner: () => "owner", now: test.now, available: () => true });
    expect(await restored.enqueue(work)).toEqual({ status: "skipped", reason: "busy_or_not_due" });
    expect(test.events).toHaveLength(1);
    expect((await test.store.read(work)).completed).toBe(true);
  });
  it("allows a fresh activities entry after each completion", async () => {
    const test = setup(), run = vi.fn(async () => ({ value: 1 }));
    const work: SyncJob<number> = { key: "activities", scope: "activities", resourceId: "all", isDue: () => true, run };
    await test.coordinator.enqueue(work); await test.coordinator.enqueue(work);
    expect(run).toHaveBeenCalledTimes(2);
  });
  it("does not count failure as success, stores sanitized error and retries later", async () => {
    const test = setup(), identity = job("failure");
    await expect(test.coordinator.enqueue({ ...identity, run: async () => { throw new Error("password and private URL must not be saved"); } })).rejects.toThrow();
    const state = await test.store.read(identity);
    expect(state).toMatchObject({ completed: false, last_success_at: null, error_code: "request_failed", failures: 1 });
    expect(JSON.stringify(state)).not.toContain("password");
    expect(test.events).toHaveLength(0);
    test.advance(15_000);
    expect((await test.coordinator.enqueue(identity)).status).toBe("complete");
  });
  it("keeps a successful lookup pending until the source actually has the result", async () => {
    const test = setup(), identity = job("recording");
    expect(await test.coordinator.enqueue({ ...identity, run: async () => ({ value: null, completed: false, nextDueAt: 40_000 }) })).toEqual({ status: "pending", value: null });
    expect(await test.store.read(identity)).toMatchObject({ completed: false, status: "pending", last_success_at: 10_000, next_due_at: 40_000 });
  });
  it("aborts stale account work before it can persist or publish", async () => {
    const test = setup(), gate = deferred<void>(), mutation = vi.fn();
    const work = test.coordinator.enqueue({ ...job("changed"), run: async context => { await gate.promise; await context.assertLease(); mutation(); return { value: "bad", domains: ["attendance"] }; } });
    const rejected = expect(work).rejects.toMatchObject({ reason: "account_changed" });
    await vi.waitFor(async () => expect((await test.store.read(job("changed"))).status).toBe("running"));
    test.changeOwner("another"); gate.resolve(); await rejected;
    expect(mutation).not.toHaveBeenCalled(); expect(test.events).toHaveLength(0);
  });
  it("does not start unavailable work or consume its eligibility", async () => {
    const test = setup(), run = vi.fn();
    const coordinator = new SyncCoordinator({ uid: "owner", store: test.store, currentOwner: () => "owner", available: () => false });
    expect(await coordinator.enqueue({ ...job("offline"), run })).toEqual({ status: "skipped", reason: "unavailable" });
    expect(run).not.toHaveBeenCalled();
    expect((await test.store.read(job("offline"))).last_attempt_at).toBeNull();
  });
  it("expires lost ownership and prevents old holders from finishing another lease", async () => {
    const store = createMemorySyncStateStore(), first = job("old"), next = job("new");
    await store.claim(first, "one", 1000, 100, () => true);
    expect(await store.claim(next, "two", 1050, 100, () => true)).toBeNull();
    expect(await store.claim(next, "two", 1100, 100, () => true)).not.toBeNull();
    expect(await store.finish(first, "one", 1101, { completed: true })).toBe(false);
    expect(await store.finish(next, "two", 1101, { completed: true })).toBe(true);
    expect((await store.read(first)).completed).toBe(false);
  });
  it("deduplicates across devices through the shared lease", async () => {
    const test = setup(), gate = deferred<void>(), started = deferred<void>();
    const first = test.coordinator.enqueue({ ...job("first"), run: async () => { started.resolve(); await gate.promise; return { value: "first" }; } });
    await started.promise;
    const other = new SyncCoordinator({ uid: "owner", store: test.store, currentOwner: () => "owner", now: test.now, available: () => true });
    expect(await other.enqueue(job("different"))).toEqual({ status: "skipped", reason: "busy_or_not_due" });
    gate.resolve(); await first;
  });
  it("invalidates executor guards after timeout even if its fetch ignores abort", async () => {
    vi.useFakeTimers();
    const store = createMemorySyncStateStore(), gate = deferred<void>(), mutation = vi.fn();
    const coordinator = new SyncCoordinator({ uid: "owner", store, currentOwner: () => "owner", now: Date.now, available: () => true, timeoutMs: 100, leaseMs: 300 });
    const work = coordinator.enqueue({ ...job("timeout"), run: async context => { await gate.promise; context.assertCurrent(); mutation(); return { value: "late" }; } });
    const rejected = expect(work).rejects.toBeInstanceOf(SyncCancelledError);
    await vi.advanceTimersByTimeAsync(100);
    await rejected;
    gate.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(mutation).not.toHaveBeenCalled();
    expect((await store.read(job("timeout"))).last_success_at).toBeNull();
  });
  it("retains initial activation date and encodes occurrence IDs as one document", async () => {
    const store = createMemorySyncStateStore();
    expect(await store.initialisedAt(1000)).toBe(1000);
    expect(await store.initialisedAt(2000)).toBe(1000);
    expect(syncStateDocumentId("attendance:group/id")).not.toContain("/");
  });
});
