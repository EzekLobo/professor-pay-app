import { afterEach, describe, expect, it, vi } from "vitest";
import { AutoSyncRuntime, type AutoSyncSnapshot } from "./auto-sync-runtime";
import { SyncCoordinator } from "./sync-coordinator";
import { createMemorySyncStateStore, emptySyncState } from "./sync-state";
import { occurrenceKey } from "./sync-policy";
import type { KodlandLesson } from "./kodland-lessons";
import type { KodlandExtraLesson, KodlandGroup } from "./api";
import type { KodlandScopedRequest, KodlandScopedResult } from "./kodland-scoped-sync";
const instant = (value: string) => Date.parse(value);
const lesson = (id: string, date = "2026-10-29"): KodlandLesson => ({ id, source_lesson_id: id, external_class_id: "g", lesson_date: date, start_time: "18:00", end_time: "19:00", status: "planned", recording_url: "" } as KodlandLesson);
const extra = (id: string, date = "2026-10-29", patch: Partial<KodlandExtraLesson> = {}): KodlandExtraLesson => ({ id, external_class_id: "g", external_student_id: "s", lesson_date: date, start_time: "18:00", end_time: "19:00", status: "planned", completed: false, ...patch } as KodlandExtraLesson);
const group = { external_id: "g", archived: false } as KodlandGroup;
const flush = async () => { for (let index = 0; index < 100; index++) await Promise.resolve(); };
function setup(at: string, values: Partial<AutoSyncSnapshot> = {}, respond?: (request: KodlandScopedRequest) => KodlandScopedResult | Promise<KodlandScopedResult>, store = createMemorySyncStateStore()) {
  vi.useFakeTimers();
  let clock = instant(at), online = true, owner = "u";
  const snapshot: AutoSyncSnapshot = { enabled: true, timeZone: "America/Sao_Paulo", groups: [group], lessons: [], extras: [], ...values };
  const coordinator = new SyncCoordinator({ uid: "u", store, currentOwner: () => owner, now: () => clock, available: () => online, publish: vi.fn() });
  const read = vi.spyOn(coordinator, "read");
  const execute = vi.fn(async (_credentials: unknown, request: KodlandScopedRequest) => respond ? respond(request) : ({ scope: request.scope, complete: true, updated: 0, ranking_complete: true, domains: [] }));
  const load = vi.fn(async () => structuredClone(snapshot));
  const runtime = new AutoSyncRuntime({ uid: "u", coordinator, currentOwner: () => owner, now: () => clock, available: () => online, load, credentials: async () => ({ username: "tutor", password: "secret" }), execute });
  return { runtime, coordinator, execute, read, load, store, snapshot, setTime: (value: string) => { clock = instant(value); }, setOnline: (value: boolean) => { online = value; }, changeOwner: () => { owner = "other"; }, scopes: () => execute.mock.calls.map(call => call[1].scope) };
}
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe("automatic scope runtime", () => {
  it("checks presence exactly after end +1h and retains its completed check", async () => {
    const test = setup("2026-10-29T22:59:00Z", { lessons: [lesson("one")] });
    test.runtime.attach("/classes"); await flush();
    expect(test.scopes()).toEqual([]);
    test.setTime("2026-10-29T23:00:00Z"); await test.runtime.tick();
    expect(test.scopes()).toEqual(["attendance"]);
    await test.runtime.tick(); expect(test.scopes()).toEqual(["attendance"]);
    test.runtime.dispose();
  });
  it("limits historical attendance/recordings to seven days but reconciles older pending extras", async () => {
    const test = setup("2026-10-29T23:00:00Z", { lessons: [lesson("old", "2026-10-20"), lesson("recent", "2026-10-28")], extras: [extra("old-pending", "2026-10-01"), extra("already", "2026-10-01", { completed: true }), extra("checked", "2026-10-01", { final_checked_at: "2026-10-02T12:00:00Z" }), extra("future", "2026-10-30")] });
    test.runtime.attach("/classes"); await flush();
    expect(test.scopes().sort()).toEqual(["attendance", "extra_final_check"]);
    const checked = test.execute.mock.calls.filter(call => call[1].scope === "extra_final_check");
    expect(checked[0][1].occurrence?.id).toBe("old-pending");
    await test.runtime.tick(); expect(test.execute).toHaveBeenCalledTimes(2);
    test.runtime.dispose();
  });
  it("does not read per-occurrence metadata for future lessons or closed extras", async () => {
    const test = setup("2026-10-29T12:00:00Z", { lessons: Array.from({ length: 80 }, (_, i) => lesson(`future-${i}`, "2026-12-01")), extras: [extra("taught", "2026-10-01", { completed: true })] });
    test.runtime.attach("/classes"); await flush();
    expect(test.read).toHaveBeenCalledTimes(1); // Only the durable activities/ranking recovery marker.
    expect(test.execute).not.toHaveBeenCalled(); test.runtime.dispose();
  });
  it("only retries a missing recording on a new eligible agenda visit", async () => {
    const test = setup("2026-10-29T22:01:00Z", { lessons: [lesson("one")] }, request => ({ scope: request.scope, complete: request.scope !== "recordings", updated: 0, domains: [] }));
    test.runtime.attach("/dashboard"); await flush();
    expect(test.scopes().filter(scope => scope === "recordings")).toHaveLength(1);
    test.setTime("2026-10-29T22:20:00Z"); test.runtime.setPage("/classes"); await flush(); test.runtime.setPage("/dashboard"); await flush();
    test.setTime("2026-10-29T22:35:00Z"); await test.runtime.tick();
    expect(test.scopes().filter(scope => scope === "recordings")).toHaveLength(1);
    test.runtime.setPage("/classes"); await flush(); test.runtime.setPage("/dashboard"); await flush();
    expect(test.scopes().filter(scope => scope === "recordings")).toHaveLength(2);
    test.runtime.dispose();
  });
  it("checks a call at -15min, retries at five minutes, and stops at lesson end", async () => {
    const test = setup("2026-10-29T20:44:00Z", { lessons: [lesson("one")] }, request => ({ scope: request.scope, complete: request.scope !== "call_link", updated: 0, domains: [] }));
    test.runtime.attach("/dashboard"); await flush();
    expect(test.scopes()).not.toContain("call_link");
    test.setTime("2026-10-29T20:45:00Z"); await test.runtime.tick();
    test.setTime("2026-10-29T20:49:00Z"); await test.runtime.tick();
    expect(test.scopes().filter(scope => scope === "call_link")).toHaveLength(1);
    test.setTime("2026-10-29T20:50:00Z"); await test.runtime.tick();
    expect(test.scopes().filter(scope => scope === "call_link")).toHaveLength(2);
    test.setTime("2026-10-29T22:00:00Z"); await test.runtime.tick();
    expect(test.scopes().filter(scope => scope === "call_link")).toHaveLength(2);
    test.runtime.dispose();
  });
  it("pauses offline and after authorization failure without a login loop", async () => {
    const test = setup("2026-10-29T23:00:00Z", { lessons: [lesson("one")] }, async () => { throw Object.assign(new Error("auth"), { status: 401 }); });
    test.setOnline(false); test.runtime.attach("/classes"); await flush(); expect(test.load).not.toHaveBeenCalled();
    test.setOnline(true); test.runtime.resume(); await flush();
    expect(test.execute).toHaveBeenCalledTimes(1); expect(test.runtime.getStatus().state).toBe("auth_required");
    test.runtime.resume(); await flush(); await test.runtime.tick(); expect(test.execute).toHaveBeenCalledTimes(1);
    test.runtime.dispose();
  });
  it("updates activities on every entry and recovers ranking without fetching activities again", async () => {
    let activityCalls = 0;
    const test = setup("2026-10-29T12:00:00Z", {}, request => ({ scope: request.scope, complete: true, updated: 0, ranking_complete: request.scope === "activities" ? ++activityCalls > 1 : true, domains: [] }));
    test.runtime.attach("/corrections"); await flush();
    const first = test.runtime.syncActivities(), shared = test.runtime.syncActivities(); expect(shared).toBe(first);
    await first; test.setTime("2026-10-29T12:05:00Z"); await test.runtime.tick();
    expect(test.scopes()).toEqual(["activities", "ranking"]);
    await test.runtime.syncActivities(); expect(test.scopes()).toEqual(["activities", "ranking", "activities"]);
    test.runtime.dispose();
  });
  it("stops activity automatic attempts after auth failure and ignores changed accounts", async () => {
    const test = setup("2026-10-29T12:00:00Z", {}, async () => { throw Object.assign(new Error("auth"), { status: 403 }); });
    await expect(test.runtime.syncActivities()).rejects.toThrow("auth");
    expect((await test.runtime.syncActivities()).status).toBe("skipped");
    test.changeOwner(); await test.runtime.tick(); expect(test.execute).toHaveBeenCalledTimes(1); test.runtime.dispose();
  });
  it("waits one minute when another device owns the lease rather than scheduling one-second loops", async () => {
    vi.useFakeTimers();
    const now = instant("2026-10-29T23:00:00Z"), delays: number[] = [];
    const enqueue = vi.fn(async () => ({ status: "skipped", reason: "busy_or_not_due" } as const));
    const runtime = new AutoSyncRuntime({ uid: "u", currentOwner: () => "u", now: () => now, available: () => true,
      coordinator: { read: async identity => emptySyncState(identity), initialisedAt: async () => now, enqueue },
      credentials: async () => ({ username: "tutor", password: "secret" }), execute: vi.fn(),
      load: async () => ({ enabled: true, timeZone: "America/Sao_Paulo", groups: [], lessons: [lesson("one")], extras: [] }),
      setTimer: (callback, delay) => { delays.push(delay); return setTimeout(callback, delay); },
    });
    runtime.attach("/classes"); await flush();
    expect(enqueue).toHaveBeenCalledTimes(1); expect(delays.at(-1)).toBe(60_000);
    await runtime.tick(); expect(enqueue).toHaveBeenCalledTimes(1); expect(delays.at(-1)).toBe(60_000); runtime.dispose();
  });
  it("does not activate any external scope while integration is disabled", async () => {
    const test = setup("2026-10-29T23:00:00Z", { enabled: false, lessons: [lesson("one")] });
    test.runtime.attach("/dashboard"); await flush(); await test.runtime.syncActivities(); expect(test.execute).not.toHaveBeenCalled(); test.runtime.dispose();
  });
});

describe("runtime cache and activation regressions", () => {
  it("stops claiming once another device has completed the cached pending occurrence", async () => {
    const test = setup("2026-10-29T23:00:00Z", { lessons: [lesson("remote")] });
    const identity = { key: `attendance:${occurrenceKey({ id: "remote", date: "2026-10-29", startTime: "18:00", endTime: "19:00" })}`, scope: "attendance" as const, resourceId: "remote" };
    const start = instant("2026-10-29T23:00:00Z");
    await test.store.claim(identity, "another-device", start, 120_000, () => true);
    const claim = vi.spyOn(test.store, "claim");
    test.runtime.attach("/classes"); await flush();
    expect(claim).toHaveBeenCalledTimes(1);
    await test.store.finish(identity, "another-device", start + 1000, { completed: true });
    test.setTime("2026-10-29T23:01:00Z"); await test.runtime.tick();
    test.setTime("2026-10-29T23:02:00Z"); await test.runtime.tick();
    test.setTime("2026-10-29T23:03:00Z"); await test.runtime.tick();
    expect(claim).toHaveBeenCalledTimes(2); expect(test.execute).not.toHaveBeenCalled();
    test.runtime.dispose();
  });
  it("revalidates only the resource affected by an external revision before claiming again", async () => {
    const test = setup("2026-10-29T23:00:00Z", { lessons: [lesson("remote")] });
    const identity = { key: `attendance:${occurrenceKey({ id: "remote", date: "2026-10-29", startTime: "18:00", endTime: "19:00" })}`, scope: "attendance" as const, resourceId: "remote" };
    const start = instant("2026-10-29T23:00:00Z");
    await test.store.claim(identity, "another-device", start, 120_000, () => true);
    const claim = vi.spyOn(test.store, "claim");
    test.runtime.attach("/classes"); await flush();
    await test.store.finish(identity, "another-device", start + 1000, { completed: true });
    test.runtime.invalidateRevision("attendance", "remote", false); await flush();
    test.setTime("2026-10-29T23:02:00Z"); await test.runtime.tick();
    expect(claim).toHaveBeenCalledTimes(1); expect(test.load).toHaveBeenCalledTimes(1);
    expect(test.read.mock.calls.some(call => call[0].key === identity.key && call[1] === true)).toBe(true);
    test.runtime.dispose();
  });
  it("does not create an activation marker while disabled or without imported data", async () => {
    const test = setup("2026-09-01T12:00:00Z", { enabled: false, groups: [], lessons: [] });
    const initialise = vi.spyOn(test.store, "initialisedAt"), tracked = vi.spyOn(test.store, "trackedStates");
    test.runtime.attach("/classes"); await flush();
    expect(initialise).not.toHaveBeenCalled(); expect(tracked).not.toHaveBeenCalled();
    test.snapshot.enabled = true; test.runtime.invalidate(); await flush();
    expect(initialise).not.toHaveBeenCalled();
    test.setTime("2026-10-30T12:00:00Z");
    test.snapshot.groups = [group]; test.snapshot.lessons = [lesson("old", "2026-09-20"), lesson("recent", "2026-10-29")];
    test.runtime.invalidate(); await flush();
    expect(initialise).toHaveBeenCalledOnce(); expect(initialise).toHaveBeenCalledWith(instant("2026-10-30T12:00:00Z"));
    expect(tracked).toHaveBeenCalledOnce();
    expect(test.execute.mock.calls.filter(call => call[1].scope === "attendance").map(call => call[1].occurrence?.id)).toEqual(["recent"]);
    test.runtime.dispose();
  });
  it("reanchors legacy pre-activation metadata but retains an older pending check", async () => {
    const store = createMemorySyncStateStore({ initialised_at: instant("2026-09-01T12:00:00Z") });
    const identity = { key: `attendance:${occurrenceKey({ id: "tracked", date: "2026-09-20", startTime: "18:00", endTime: "19:00" })}`, scope: "attendance" as const, resourceId: "tracked" };
    await store.claim(identity, "old-run", instant("2026-09-21T12:00:00Z"), 120_000, () => true);
    await store.fail(identity, "old-run", instant("2026-09-21T12:00:01Z"), "request_failed");
    const test = setup("2026-10-30T12:00:00Z", { lessons: [lesson("untracked", "2026-09-20"), lesson("tracked", "2026-09-20"), lesson("recent", "2026-10-29")] }, undefined, store);
    test.runtime.attach("/classes"); await flush();
    expect(await store.initialisedAt(instant("2026-11-01T12:00:00Z"))).toBe(instant("2026-10-30T12:00:00Z"));
    expect(test.execute.mock.calls.map(call => call[1].occurrence?.id).sort()).toEqual(["recent", "tracked"]);
    test.runtime.dispose();
  });
});

describe("preference and lost-link regressions", () => {
  it("stops immediately without navigation and reconnect cannot override a disabled preference", async () => {
    const test = setup("2026-10-29T22:59:00Z", { lessons: [lesson("one")] });
    test.runtime.attach("/classes"); await flush();
    test.snapshot.enabled = false; test.runtime.setIntegrationEnabled(false); test.setTime("2026-10-29T23:00:00Z");
    test.runtime.resume(); test.runtime.reconnect(); await flush();
    expect(test.execute).not.toHaveBeenCalled();
    test.snapshot.enabled = true; test.runtime.setIntegrationEnabled(true); await flush();
    expect(test.scopes()).toEqual(["attendance"]); test.runtime.dispose();
  });
  it("does not start a scope disabled after its lease claim but before execution", async () => {
    const test = setup("2026-10-29T23:00:00Z", { lessons: [lesson("one")] });
    const original = test.store.claim.bind(test.store);
    vi.spyOn(test.store, "claim").mockImplementation(async (...args) => {
      const value = await original(...args);
      if (args[0].scope === "attendance") test.runtime.setIntegrationEnabled(false);
      return value;
    });
    test.runtime.attach("/classes"); await flush();
    expect(test.execute).not.toHaveBeenCalled();
    const identity = { key: "attendance:" + occurrenceKey({ id: "one", date: "2026-10-29", startTime: "18:00", endTime: "19:00" }), scope: "attendance" as const, resourceId: "one" };
    expect((await test.store.read(identity)).last_success_at).toBeNull(); test.runtime.dispose();
  });
  it("lets in-flight work finish without starting the next automatic occurrence", async () => {
    let release!: () => void; const gate = new Promise<void>(done => { release = done; });
    const test = setup("2026-10-29T23:00:00Z", { lessons: [lesson("one"), lesson("two")] }, async request => {
      await gate; return { scope: request.scope, complete: true, updated: 0, domains: [] };
    });
    test.runtime.attach("/classes"); await flush(); expect(test.execute).toHaveBeenCalledTimes(1);
    test.runtime.setIntegrationEnabled(false); release(); await flush();
    expect(test.execute).toHaveBeenCalledTimes(1); test.runtime.dispose();
  });
  it("recovers only a previously tracked old recording whose persisted URL was lost", async () => {
    const store = createMemorySyncStateStore();
    const id = "tracked-old", key = occurrenceKey({ id, date: "2026-09-20", startTime: "18:00", endTime: "19:00" });
    const identity = { key: "recordings:" + key, scope: "recordings" as const, resourceId: id };
    await store.claim(identity, "previous", instant("2026-09-21T12:00:00Z"), 120_000, () => true);
    await store.finish(identity, "previous", instant("2026-09-21T12:00:01Z"), { completed: true });
    const test = setup("2026-10-30T12:00:00Z", { lessons: [lesson(id, "2026-09-20"), lesson("never-tracked", "2026-09-20")] }, request => ({ scope: request.scope, complete: true, updated: 1, recording_url: request.scope === "recordings" ? "https://example.test/recording" : undefined, domains: [] }), store);
    test.runtime.attach("/dashboard"); await flush();
    const records = test.execute.mock.calls.filter(call => call[1].scope === "recordings");
    expect(records.map(call => call[1].occurrence?.id)).toEqual([id]);
    test.runtime.setPage("/classes"); await flush(); test.runtime.setPage("/dashboard"); await flush();
    expect(test.execute.mock.calls.filter(call => call[1].scope === "recordings")).toHaveLength(1); test.runtime.dispose();
  });
});

it("keeps a late pre-switch load disabled and accepts a later authoritative enabled source", async () => {
  vi.useFakeTimers(); let release!: () => void;
  const gate = new Promise<void>(done => { release = done; }); let first = true;
  const store = createMemorySyncStateStore(), now = instant("2026-10-29T23:00:00Z");
  const coordinator = new SyncCoordinator({ uid: "u", store, currentOwner: () => "u", now: () => now, available: () => true, publish: vi.fn() });
  const execute = vi.fn(async (_c: unknown, request: KodlandScopedRequest) => ({ scope: request.scope, complete: true, updated: 0, domains: [] }));
  const runtime = new AutoSyncRuntime({ uid: "u", coordinator, currentOwner: () => "u", now: () => now, available: () => true, credentials: async () => ({ username: "fixture", password: "fixture" }), execute,
    load: async () => { if (first) { first = false; await gate; } return { enabled: true, timeZone: "America/Sao_Paulo", groups: [group], lessons: [lesson("one")], extras: [] }; },
  });
  runtime.attach("/classes"); await flush(); runtime.setIntegrationEnabled(false); release(); await flush();
  expect(execute).not.toHaveBeenCalled();
  runtime.resume(); await flush(); expect(execute).toHaveBeenCalledOnce(); runtime.dispose();
});
