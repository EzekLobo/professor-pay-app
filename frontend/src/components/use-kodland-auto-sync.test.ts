import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { KodlandLesson } from "@/lib/kodland-lessons";
import type { KodlandScopedOccurrence } from "@/lib/kodland-scoped-sync";
import type { AutoSyncDependencies } from "@/lib/kodland-auto-sync";
import type { TutorPreferencesChange } from "@/lib/tutor-preference-events";

const state = vi.hoisted(() => ({
  deps: null as AutoSyncDependencies | null,
  preferenceChanged: null as ((change: TutorPreferencesChange) => void) | null,
  cleanups: [] as Array<() => void>,
  status: vi.fn(), tick: vi.fn(async () => undefined),
  preferences: vi.fn(), browserState: vi.fn(), groups: vi.fn(), saveTask: vi.fn(), syncScope: vi.fn(), sync: vi.fn(), payroll: vi.fn(),
}));
vi.mock("react", () => ({
  useState: () => [{ phase: "idle" }, state.status],
  useRef: (current: unknown) => ({ current }),
  useEffect: (effect: () => (() => void) | undefined) => { const cleanup = effect(); if (cleanup) state.cleanups.push(cleanup); },
}));
vi.mock("@/lib/firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: "account" } }) }));
vi.mock("@/lib/api", () => ({
  tutorPreferencesApi: { get: state.preferences },
  kodlandApi: {
    browserState: state.browserState,
    groups: state.groups,
    lessons: async () => ({ items: [{ id: "lesson", external_class_id: "group", source_lesson_id: "source", lesson_date: "2026-11-04", start_time: "18:00", end_time: "19:00" }] }),
    extraLessons: async () => ({ items: [] }),
    students: async () => ({ items: [] }), followupState: async () => ({ updatedAt: {}, blockedGroups: [] }),
    automaticState: async () => ({}), scheduleLastUpdatedAt: async () => "2026-11-04T10:00:00Z",
    saveAutomaticTask: state.saveTask, syncScope: state.syncScope, sync: state.sync,
  },
}));
vi.mock("@/lib/tutor-preference-events", () => ({ subscribeTutorPreferencesChanged: (_uid: string, listener: (change: TutorPreferencesChange) => void) => { state.preferenceChanged = listener; return () => { state.preferenceChanged = null; }; } }));
vi.mock("@/lib/auto-sync-payroll", () => ({ setAutomaticPayrollEnabled: state.payroll }));
vi.mock("@/lib/browser-credentials", () => ({ restoreKodlandCredentials: async () => ({ username: "test", password: "test" }) }));
vi.mock("@/lib/student-notification-store", () => ({ subscribeStudentNotifications: () => () => undefined }));
vi.mock("@/lib/operation-log-client", () => ({ reportOperation: vi.fn() }));
vi.mock("@/lib/kodland-sync-client", () => ({ readKodlandLocal: (read: () => Promise<unknown>) => read(), watchKodlandSync: vi.fn() }));
vi.mock("@/lib/kodland-auto-sync", () => ({ createKodlandAutoSync: (deps: AutoSyncDependencies) => { state.deps = deps; return { tick: state.tick }; } }));

import { useKodlandAutoSync } from "./use-kodland-auto-sync";

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers();
  const browser = new EventTarget();
  Object.assign(browser, { setTimeout, clearTimeout, setInterval, clearInterval, location: { pathname: "/classes" } });
  vi.stubGlobal("window", browser);
  const document = new EventTarget(); Object.assign(document, { visibilityState: "visible" }); vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", { onLine: true });
  state.preferences.mockResolvedValue({ kodland_enabled: true }); state.browserState.mockResolvedValue({ active: true });
  state.groups.mockResolvedValue({ items: [{ external_id: "group", archived: false }] });
  state.saveTask.mockResolvedValue(undefined); state.syncScope.mockResolvedValue({ complete: true, call_url: "https://learn.kodland.org/pt/class-room?sessionId=session" });
});
afterEach(() => {
  state.cleanups.splice(0).forEach(cleanup => cleanup());
  vi.unstubAllGlobals(); vi.useRealTimers();
});

describe("single Kodland scheduler integration", () => {
  it("honors authoritative disabled preferences after reload even with an active browser cache", async () => {
    state.preferences.mockResolvedValue({ kodland_enabled: false });
    useKodlandAutoSync("account", false);
    expect(await state.deps!.context()).toEqual({ enabled: false, groups: [], updatedAt: {} });
    state.cleanups.splice(0).forEach(cleanup => cleanup());
    useKodlandAutoSync("account", false);
    expect((await state.deps!.context()).enabled).toBe(false);
    expect(state.preferences).toHaveBeenCalledTimes(2);
    expect(state.groups).not.toHaveBeenCalled();
  });
  it("stops queued work and rejects an older enabled preference read after disable", async () => {
    let resolve!: (value: { kodland_enabled: boolean }) => void;
    state.preferences.mockReturnValue(new Promise(value => { resolve = value; }));
    useKodlandAutoSync("account", false);
    const pending = state.deps!.context();
    state.preferenceChanged!({ uid: "account", kodland_enabled: false });
    resolve({ kodland_enabled: true });
    expect((await pending).enabled).toBe(false);
    expect(state.deps!.owner()).toBe(false);
    expect(state.payroll).toHaveBeenCalledWith("account", false);
    expect(state.groups).not.toHaveBeenCalled();
  });
  it("recognizes canonical Turmas as the followup area", async () => {
    useKodlandAutoSync("account", false);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(state.tick).toHaveBeenCalledWith({ active: true, online: true, following: true });
  });
  it("uses the dated call scope under automatic priority instead of the empty classroom mode", async () => {
    useKodlandAutoSync("account", false);
    await state.deps!.context();
    const occurrence: KodlandScopedOccurrence = { kind: "lesson", id: "lesson", group_id: "group", source_lesson_id: "source", lesson_date: "2026-11-04", start_time: "18:00", end_time: "19:00" };
    await state.deps!.runTask!({ id: "call", kind: "classroom", groupId: "group", occurrence, lesson: { ...occurrence, external_class_id: "group", source_lesson_id: "source" } as unknown as KodlandLesson }, { username: "test", password: "test" });
    expect(state.syncScope).toHaveBeenCalledWith("test", "test", expect.objectContaining({ scope: "call_link", occurrence: expect.objectContaining({ id: "lesson", source_lesson_id: "source", kind: "lesson" }) }), undefined, expect.objectContaining({ automatic: true, assertActive: expect.any(Function) }));
    expect(state.saveTask).toHaveBeenLastCalledWith("call", expect.objectContaining({ complete: true }));
    expect(state.sync).not.toHaveBeenCalled();
  });

  it("checks extras and recordings through scoped requests and refreshes the Agenda cache", async () => {
    useKodlandAutoSync("account", false, "/dashboard");
    await state.deps!.context();
    const extraOccurrence: KodlandScopedOccurrence = { kind: "extra", id: "extra", group_id: "group", source_lesson_id: "extra", lesson_date: "2026-11-03", start_time: "18:00", end_time: "19:00" };
    state.syncScope.mockResolvedValueOnce({ scope: "extras_discovery", complete: true, updated: 1 })
      .mockResolvedValueOnce({ scope: "recordings", complete: true, updated: 1, recording_url: "https://example.test/recording" });
    await state.deps!.runTask!({ id: "extras_discovery:2026-11-02", kind: "extras_discovery", weekDate: "2026-11-04", knownExtraIds: [] }, { username: "test", password: "test" });
    await state.deps!.runTask!({ id: "recordings:key", kind: "recordings", groupId: "group", occurrence: extraOccurrence, extra: { id: "extra", external_class_id: "group" } as never }, { username: "test", password: "test" });
    expect(state.syncScope).toHaveBeenNthCalledWith(1, "test", "test", expect.objectContaining({ scope: "extras_discovery", known_extra_ids: [] }), undefined, expect.objectContaining({ automatic: true }));
    expect(state.syncScope).toHaveBeenNthCalledWith(2, "test", "test", expect.objectContaining({ scope: "recordings", occurrence: extraOccurrence }), undefined, expect.objectContaining({ automatic: true }));
    expect(state.saveTask).toHaveBeenLastCalledWith("recordings:key", expect.objectContaining({ complete: true }));
  });
});
