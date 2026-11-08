import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("./api", () => ({ kodlandPayrollApi: { syncForPaymentDate: vi.fn() }, tutorPreferencesApi: { get: vi.fn() } }));
vi.mock("./browser-credentials", () => ({ restoreKodlandCredentials: vi.fn() }));
vi.mock("./firebase", () => ({ getFirebaseAuth: vi.fn(), getFirebaseDb: vi.fn() }));
import { getFirebaseAuth } from "./firebase";
import { tutorPreferencesApi, kodlandPayrollApi } from "./api";
import { restoreKodlandCredentials } from "./browser-credentials";
import * as coordination from "./sync-coordinator";
import { eligiblePayrollPayments, payrollPeriodKey, PayrollEntrySync, syncPaymentsOnEntry, setAutomaticPayrollEnabled } from "./auto-sync-payroll";
import { SyncCoordinator } from "./sync-coordinator";
import { createMemorySyncStateStore } from "./sync-state";
import type { SyncDataEvent } from "./sync-events";

afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
const date = (value: string) => Date.parse(`${value}T15:00:00Z`);
const candidate = (payment_date = "2026-11-15", status: "EXPECTED" | "RECEIVED" = "EXPECTED") => ({ payment_date, status });
function setup(initial = date("2026-11-10")) {
  let now = initial;
  const store = createMemorySyncStateStore(), events: SyncDataEvent[] = [];
  const coordinator = () => new SyncCoordinator({ uid: "owner", store, currentOwner: () => "owner", now: () => now, available: () => true, publish: event => events.push(event) });
  const credentials = vi.fn(async () => ({ username: "teacher", password: "fixture-only" }));
  const sync = vi.fn(async () => undefined);
  const runner = () => new PayrollEntrySync({ coordinator: coordinator(), credentials, sync, now: () => now });
  return { runner, credentials, sync, store, events, now: () => now, move: (value: number) => { now = value; } };
}
const options = { enabled: true, timeZone: "America/Sao_Paulo" };

describe("automatic payroll entry", () => {
  it("does not consult credentials or metadata before D-5, after D or when disabled", async () => {
    const test = setup(date("2026-11-09")), runner = test.runner();
    expect((await runner.run([candidate()], options)).status).toBe("idle");
    test.move(date("2026-11-16"));
    expect((await runner.run([candidate()], options)).status).toBe("idle");
    test.move(date("2026-11-10"));
    expect((await runner.run([candidate()], { ...options, enabled: false })).status).toBe("disabled");
    expect(test.credentials).not.toHaveBeenCalled(); expect(test.sync).not.toHaveBeenCalled();
  });
  it("checks inclusively on D-5 and D, once per calendar day across reloads", async () => {
    const test = setup();
    expect((await test.runner().run([candidate()], options)).updated).toBe(1);
    expect((await test.runner().run([candidate()], options)).updated).toBe(0);
    expect(test.sync).toHaveBeenCalledTimes(1);
    test.move(date("2026-11-11"));
    expect((await test.runner().run([candidate()], options)).updated).toBe(1);
    test.move(date("2026-11-15"));
    expect((await test.runner().run([candidate()], options)).updated).toBe(1);
    expect(test.events).toHaveLength(3);
    expect(test.events.every(event => event.domains.length === 1 && event.domains[0] === "payments")).toBe(true);
  });
  it("deduplicates different payment dates for the same monthly period", async () => {
    const test = setup(date("2026-11-13")), runner = test.runner();
    expect(eligiblePayrollPayments([candidate("2026-11-15"), candidate("2026-11-16")], test.now(), options.timeZone)).toHaveLength(1);
    expect((await runner.run([candidate("2026-11-15"), candidate("2026-11-16")], options)).updated).toBe(1);
    expect(test.sync).toHaveBeenCalledTimes(1);
    expect(payrollPeriodKey("2026-01-15")).toBe("2025-12");
  });
  it("leaves failure pending and allows retry without consuming daily success", async () => {
    const test = setup(), runner = test.runner();
    test.sync.mockRejectedValueOnce(new Error("transient"));
    expect(await runner.run([candidate()], options)).toMatchObject({ status: "pending", updated: 0, failed: 1 });
    expect(test.events).toHaveLength(0);
    expect((await test.store.read({ key: "payroll:2026-10", scope: "payroll", resourceId: "2026-10" })).last_success_at).toBeNull();
    test.move(test.now() + 16_000);
    expect((await runner.run([candidate()], options)).updated).toBe(1);
  });
  it("does not repeatedly log in after permission or authentication failure", async () => {
    const test = setup(), runner = test.runner();
    test.sync.mockRejectedValueOnce(Object.assign(new Error("auth"), { status: 401 }));
    expect((await runner.run([candidate()], options)).status).toBe("auth_required");
    test.move(test.now() + 60_000);
    expect((await runner.run([candidate()], options)).status).toBe("auth_required");
    expect(test.sync).toHaveBeenCalledTimes(1);
    runner.resetAuthentication();
    expect((await runner.run([candidate()], options)).updated).toBe(1);
  });
  it("preserves received periods and reports absent credentials without syncing", async () => {
    const test = setup(), runner = test.runner();
    expect((await runner.run([candidate("2026-11-15", "RECEIVED")], options)).updated).toBe(0);
    expect(test.credentials).not.toHaveBeenCalled();
    test.credentials.mockResolvedValueOnce(null as never);
    expect((await runner.run([candidate()], options)).status).toBe("credentials_required");
    expect(test.sync).not.toHaveBeenCalled();
  });
  it("uses business timezone to define the daily boundary", async () => {
    const test = setup(Date.parse("2026-11-11T01:00:00Z")), runner = test.runner();
    await runner.run([candidate()], options);
    test.move(Date.parse("2026-11-11T02:00:00Z"));
    expect((await runner.run([candidate()], options)).updated).toBe(0);
    test.move(Date.parse("2026-11-11T03:00:00Z"));
    expect((await runner.run([candidate()], options)).updated).toBe(1);
  });
  it("does not access Firebase, preferences or credentials for demo or outside the window", async () => {
    vi.spyOn(Date, "now").mockReturnValue(date("2026-11-09"));
    await syncPaymentsOnEntry([candidate()], { timeZone: options.timeZone });
    await syncPaymentsOnEntry([candidate("2026-11-10")], { timeZone: options.timeZone, demo: true });
    expect(getFirebaseAuth).not.toHaveBeenCalled(); expect(tutorPreferencesApi.get).not.toHaveBeenCalled();
  });
  it("resolves a fresh coordinator when returning to an earlier account", async () => {
    vi.spyOn(Date, "now").mockReturnValue(date("2026-11-10"));
    let uid = "account-a";
    vi.mocked(getFirebaseAuth).mockImplementation(() => ({ currentUser: { uid } }) as never);
    vi.mocked(tutorPreferencesApi.get).mockResolvedValue({ kodland_enabled: true } as never);
    vi.mocked(restoreKodlandCredentials).mockResolvedValue({ username: "teacher", password: "fixture" });
    const owners: string[] = [];
    vi.spyOn(coordination, "getSyncCoordinator").mockImplementation(owner => {
      owners.push(owner);
      return { enqueue: async () => ({ status: "pending", value: "period" }) } as never;
    });
    await syncPaymentsOnEntry([candidate()], options);
    uid = "account-b"; await syncPaymentsOnEntry([candidate()], options);
    uid = "account-a"; await syncPaymentsOnEntry([candidate()], options);
    expect(owners).toEqual(["account-a", "account-b", "account-a"]);
  });
});

it("blocks an enqueued payroll after the switch is off and resumes when enabled", async () => {
  const test = setup(), coordinator = new SyncCoordinator({ uid: "owner", store: test.store, currentOwner: () => "owner", now: test.now, available: () => true, publish: vi.fn() });
  let release!: () => void; const gate = new Promise<void>(done => { release = done; });
  const blocking = coordinator.enqueue({ key: "manual:held", scope: "manual", resourceId: "held", isDue: () => true, run: async () => { await gate; return { value: undefined }; } });
  for (let i = 0; i < 50; i++) await Promise.resolve();
  const runner = new PayrollEntrySync({ coordinator, credentials: test.credentials, sync: test.sync, now: test.now });
  const pending = runner.run([candidate()], options);
  for (let i = 0; i < 50; i++) await Promise.resolve();
  runner.setIntegrationEnabled(false); release(); await blocking;
  expect((await pending).status).toBe("disabled"); expect(test.sync).not.toHaveBeenCalled();
  runner.resetAuthentication(); expect((await runner.run([candidate()], options)).status).toBe("disabled");
  runner.setIntegrationEnabled(true); expect((await runner.run([candidate()], options)).updated).toBe(1); expect(test.sync).toHaveBeenCalledOnce();
});

it("rejects a stale payroll preference read but allows a later authoritative reactivation", async () => {
  const uid = "payroll-preference-epoch", now = date("2026-11-10");
  vi.spyOn(Date, "now").mockReturnValue(now);
  vi.mocked(getFirebaseAuth).mockReturnValue({ currentUser: { uid } } as never);
  let release!: (value: { kodland_enabled: boolean }) => void;
  vi.mocked(tutorPreferencesApi.get).mockImplementationOnce(() => new Promise(done => { release = done as typeof release; }));
  const coordinator = new SyncCoordinator({ uid, store: createMemorySyncStateStore(), currentOwner: () => uid, now: () => now, available: () => true, publish: vi.fn() });
  vi.spyOn(coordination, "getSyncCoordinator").mockReturnValue(coordinator);
  vi.mocked(restoreKodlandCredentials).mockResolvedValue({ username: "fixture", password: "fixture" });
  vi.mocked(kodlandPayrollApi.syncForPaymentDate).mockResolvedValue({} as never);
  const pending = syncPaymentsOnEntry([candidate()], { timeZone: options.timeZone });
  await vi.waitFor(() => expect(release).toBeTypeOf("function"));
  setAutomaticPayrollEnabled(uid, false); release({ kodland_enabled: true });
  expect((await pending).status).toBe("disabled"); expect(kodlandPayrollApi.syncForPaymentDate).not.toHaveBeenCalled();
  vi.mocked(tutorPreferencesApi.get).mockResolvedValue({ kodland_enabled: true } as never);
  expect((await syncPaymentsOnEntry([candidate()], { timeZone: options.timeZone })).status).toBe("updated");
  expect(kodlandPayrollApi.syncForPaymentDate).toHaveBeenCalledOnce();
});

it("refreshes on entry outside the payment window, deduplicating across page runners", async () => {
  const test = setup(date("2026-11-03"));
  const entry = { ...options, refreshOnEntry: true };
  expect((await test.runner().run([candidate()], entry)).updated).toBe(1);
  expect((await test.runner().run([candidate()], entry)).updated).toBe(0);
  test.move(test.now() + 61000);
  expect((await test.runner().run([candidate()], entry)).updated).toBe(1);
  expect(test.sync).toHaveBeenCalledTimes(2);
});
it("never refreshes received snapshots on page entry", async () => {
  const test = setup(date("2026-11-03"));
  await test.runner().run([{ ...candidate(), status: "RECEIVED" }], { ...options, refreshOnEntry: true });
  expect(test.sync).not.toHaveBeenCalled();
});
