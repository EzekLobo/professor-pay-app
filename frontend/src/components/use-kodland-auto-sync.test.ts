import { resetAutomaticRefreshCache, markRefreshed } from "@/lib/automatic-refresh-cache";
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
  watch: vi.fn(), read: vi.fn(), progress: vi.fn(),
  students: vi.fn(), preferences: vi.fn(), browserState: vi.fn(), groups: vi.fn(), saveTask: vi.fn(), syncScope: vi.fn(), sync: vi.fn(), payroll: vi.fn(),
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
    taskProgress: state.progress,
    students: state.students, followupState: async () => ({ updatedAt: {}, blockedGroups: [] }),
    automaticState: async () => ({}), scheduleLastUpdatedAt: async () => "2026-11-04T10:00:00Z",
    saveAutomaticTask: state.saveTask, syncScope: state.syncScope, sync: state.sync,
  },
}));
vi.mock("@/lib/tutor-preference-events", () => ({ subscribeTutorPreferencesChanged: (_uid: string, listener: (change: TutorPreferencesChange) => void) => { state.preferenceChanged = listener; return () => { state.preferenceChanged = null; }; } }));
vi.mock("@/lib/auto-sync-payroll", () => ({ setAutomaticPayrollEnabled: state.payroll }));
vi.mock("@/lib/browser-credentials", () => ({ restoreKodlandCredentials: async () => ({ username: "test", password: "test" }) }));
vi.mock("@/lib/student-notification-store", () => ({ subscribeStudentNotifications: () => () => undefined }));
vi.mock("@/lib/operation-log-client", () => ({ reportOperation: vi.fn() }));
vi.mock("@/lib/kodland-sync-client", () => ({ readKodlandLocal: state.read, watchKodlandSync: state.watch }));
vi.mock("@/lib/kodland-auto-sync", () => ({ createKodlandAutoSync: (deps: AutoSyncDependencies) => { state.deps = deps; return { tick: state.tick }; } }));

import { useKodlandAutoSync } from "./use-kodland-auto-sync";

beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers(); resetAutomaticRefreshCache();
  state.progress.mockResolvedValue({ items: [] });
  state.read.mockImplementation((read: () => Promise<unknown>) => read());
  const browser = new EventTarget();
  Object.assign(browser, { setTimeout, clearTimeout, setInterval, clearInterval, location: { pathname: "/classes" } });
  vi.stubGlobal("window", browser);
  const document = new EventTarget(); Object.assign(document, { visibilityState: "visible" }); vi.stubGlobal("document", document);
  vi.stubGlobal("navigator", { onLine: true });
  state.students.mockResolvedValue({ items: [] });
  state.preferences.mockResolvedValue({ kodland_enabled: true }); state.browserState.mockResolvedValue({ active: true });
  state.groups.mockResolvedValue({ items: [{ external_id: "group", archived: false }] });
  state.saveTask.mockResolvedValue(undefined); state.syncScope.mockResolvedValue({ complete: true, call_url: "https://learn.kodland.org/pt/class-room?sessionId=session" });
  state.watch.mockImplementation(async (work: (report: () => void, assertActive: () => void) => Promise<unknown>) => work(() => undefined, () => undefined));
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
    expect(state.tick).toHaveBeenCalledWith({ active: true, online: true, following: false, refreshActivities: false });
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
    await vi.advanceTimersByTimeAsync(0);
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

  it("refreshes the Resumo on entry without timed page polling", async () => {
    useKodlandAutoSync("account", false, "/dashboard");
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync).toHaveBeenCalledWith("test", "test", "schedule", expect.objectContaining({ automatic: true, refreshSchedule: true }));
    expect(state.sync).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.sync).toHaveBeenCalledTimes(1);
    Object.assign(document, { visibilityState: "hidden" });
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.sync).toHaveBeenCalledTimes(1);
  });

  it("refreshes activities and presence on entry without waiting for the occurrence deadline", async () => {
    useKodlandAutoSync("account", false);
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "activities" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync).toHaveBeenLastCalledWith("test", "test", "corrections", expect.objectContaining({ followupScope: "activities", refreshSchedule: false, correctionGroupIds: ["group"] }));
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "attendance" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync).toHaveBeenLastCalledWith("test", "test", "corrections", expect.objectContaining({ followupScope: "attendance", refreshSchedule: false }));
  });

  it("services navigation arriving during an unfinished request", async () => {
    let finish!: () => void;
    state.sync.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    useKodlandAutoSync("account", false);
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "activities" }));
    await vi.advanceTimersByTimeAsync(0);
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "attendance" }));
    expect(state.sync).toHaveBeenCalledTimes(1);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync.mock.calls.map(call => call[2])).toEqual(["classroom", "corrections"]);
    expect(state.sync).toHaveBeenLastCalledWith("test", "test", "corrections", expect.objectContaining({ followupScope: "attendance" }));
  });

  it("retries a failed page refresh only on a new entry or resume request", async () => {
    state.sync.mockRejectedValueOnce(new Error("temporarily offline"));
    useKodlandAutoSync("account", false, "/dashboard");
    await vi.advanceTimersByTimeAsync(0);
    expect(state.status).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "error" }));
    await vi.advanceTimersByTimeAsync(30000);
    expect(state.sync).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync).toHaveBeenCalledTimes(2);
  });

  it("loads profiles and lesson balances when entering the activities page", async () => {
    state.students.mockResolvedValue({ items: [{ external_id: "student", status: "active", name: "Aluno", phone: "" }] });
    useKodlandAutoSync("account", false);
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "activities" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync.mock.calls.map(call => call[2])).toEqual(["classroom", "profiles", "corrections"]);
    expect(state.sync).toHaveBeenLastCalledWith("test", "test", "corrections", expect.objectContaining({ followupScope: "activities" }));
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.sync.mock.calls.filter(call => call[2] === "profiles")).toHaveLength(1);
  });
  it("loads responsible contacts before attendance, without periodic refresh", async () => {
    state.students.mockResolvedValue({ items: [{ external_id: "student", status: "active", name: "Aluno", phone: "" }] });
    useKodlandAutoSync("account", false);
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "attendance" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync.mock.calls.map(call => call[2])).toEqual(["profiles", "corrections"]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.sync.mock.calls.filter(call => call[2] === "profiles")).toHaveLength(1);
  });

  it("updates attendance even when the contact and balance request fails", async () => {
    state.students.mockResolvedValue({ items: [{ external_id: "student", status: "active", name: "Aluno", phone: "" }] });
    state.sync.mockRejectedValueOnce(new Error("balance unavailable"));
    useKodlandAutoSync("account", false);
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "attendance" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync.mock.calls.map(call => call[2])).toEqual(["profiles", "corrections"]);
    expect(state.sync).toHaveBeenLastCalledWith("test", "test", "corrections", expect.objectContaining({ followupScope: "attendance" }));
    expect(state.status).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "error", message: expect.stringContaining("contatos ou saldos") }));
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.sync).toHaveBeenCalledTimes(2);
  });

  it("refreshes attendance once per session even on focus or re-entry", async () => {
    markRefreshed("account", "page:corrections:group:attendance");
    useKodlandAutoSync("account", false);
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "attendance" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("focus"));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync).toHaveBeenCalledTimes(1);
    expect(state.sync).toHaveBeenLastCalledWith("test", "test", "corrections", expect.objectContaining({ followupScope: "attendance" }));
    await vi.advanceTimersByTimeAsync(60000);
    expect(state.sync).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "attendance" }));
    await vi.advanceTimersByTimeAsync(0);
    expect(state.sync).toHaveBeenCalledTimes(1);
  });
});

it("ends page loading when the preference read never responds and recovers on focus", async () => {
  const client = await vi.importActual<typeof import("@/lib/kodland-sync-client")>("@/lib/kodland-sync-client");
  state.read.mockImplementation(client.readKodlandLocal);
  state.preferences.mockReturnValueOnce(new Promise(() => undefined));
  useKodlandAutoSync("account", false);
  window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "activities" }));
  await vi.advanceTimersByTimeAsync(15001);
  expect(state.status).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "error" }));
  expect(state.sync).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(30000);
  expect(state.sync).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("focus"));
  await vi.advanceTimersByTimeAsync(0);
  expect(state.status).toHaveBeenLastCalledWith(expect.objectContaining({ phase: "ready" }));
  expect(state.sync).toHaveBeenCalled();
});

it("uses warm page caches across focus without replaying schedule or activity history", async () => {
  useKodlandAutoSync("account", false);
  window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "activities" }));
  await vi.advanceTimersByTimeAsync(0);
  expect(state.sync).toHaveBeenCalledTimes(2);
  window.dispatchEvent(new Event("focus")); await vi.advanceTimersByTimeAsync(0);
  expect(state.sync).toHaveBeenCalledTimes(2);
});
it("requests only recent/uncorrected activities after the initial history snapshot", async () => {
  markRefreshed("account", "activity-history:group");
  state.progress.mockResolvedValue({ items: [{ external_class_id: "group", lesson_id: "source", state: "corrected" }] });
  useKodlandAutoSync("account", false);
  window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: "activities" }));
  await vi.advanceTimersByTimeAsync(0);
  expect(state.sync).toHaveBeenLastCalledWith("test", "test", "corrections", expect.objectContaining({ activityWindows: { group: { known: ["source"], refresh: ["source"] } } }));
});
