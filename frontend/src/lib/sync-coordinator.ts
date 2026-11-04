import { getFirebaseAuth } from "./firebase";
import { publishSyncDataChanged, type SyncDataDomain, type SyncDataEvent } from "./sync-events";
import { createFirestoreSyncStateStore, type SyncIdentity, type SyncState, type SyncStateStore } from "./sync-state";
import type { SyncScope } from "./sync-policy";

export class SyncCancelledError extends Error {
  constructor(public readonly reason: "account_changed" | "lease_lost" | "timeout" | "disposed") {
    super(reason === "account_changed" ? "A conta conectada mudou durante a atualização." : "A atualização foi interrompida. Tente novamente.");
    this.name = "SyncCancelledError";
  }
}
export type SyncExecutionContext = {
  uid: string;
  signal: AbortSignal;
  previous: SyncState;
  /** Check after asynchronous reads and immediately before every persistence step. */
  assertCurrent(): void;
  /** Check/renew ownership before persisting source data; throw if another executor owns it. */
  assertLease(): Promise<void>;
};
export type SyncExecutionResult<T> = {
  value: T;
  /** false means a valid lookup with data still pending (e.g. no recording yet). */
  completed?: boolean;
  nextDueAt?: number | null;
  revision?: string;
  domains?: SyncDataDomain[];
};
export type SyncJob<T> = SyncIdentity & {
  priority?: number;
  /** Historical manual imports keep the same lease with a larger total budget. */
  timeoutMs?: number;
  isDue(state: SyncState, now: number): boolean;
  run(context: SyncExecutionContext): Promise<SyncExecutionResult<T>>;
};
export type SyncOutcome<T> = { status: "complete" | "pending"; value: T } | { status: "skipped"; reason: "unavailable" | "busy_or_not_due" };
type QueueEntry = { priority: number; perform(): Promise<void> };
type AccountLock = <T>(uid: string, work: () => Promise<SyncOutcome<T>>) => Promise<SyncOutcome<T>>;
export type SyncCoordinatorOptions = {
  uid: string;
  store: SyncStateStore;
  currentOwner: () => string | null;
  now?: () => number;
  available?: () => boolean;
  publish?: (event: SyncDataEvent) => void;
  withAccountLock?: AccountLock;
  leaseMs?: number;
  timeoutMs?: number;
};
const priorities: Record<SyncScope, number> = { call_link: 0, manual: 10, activities: 20, ranking: 21, attendance: 30, payroll: 35, extras_discovery: 40, extra_final_check: 45, recordings: 50 };
const browserAvailable = () => (typeof document === "undefined" || document.visibilityState !== "hidden") && (typeof navigator === "undefined" || navigator.onLine !== false);
const browserLock: AccountLock = async (uid, work) => {
  if (typeof navigator !== "undefined" && navigator.locks) {
    return navigator.locks.request(`nexusclass-kodland-sync:${uid}`, { ifAvailable: true }, lock => lock ? work() : { status: "skipped", reason: "busy_or_not_due" });
  }
  return work(); // Firestore's account lease is still authoritative without Web Locks.
};

/** A shared serial queue for all external automatic sync scopes of one account. */
export class SyncCoordinator {
  private readonly queue: QueueEntry[] = [];
  private readonly pending = new Map<string, Promise<unknown>>();
  private active: AbortController | null = null;
  private draining = false;
  private disposed = false;
  private readonly now: () => number;
  private readonly leaseMs: number;
  private readonly timeoutMs: number;

  constructor(private readonly options: SyncCoordinatorOptions) {
    this.now = options.now ?? Date.now;
    this.leaseMs = options.leaseMs ?? 120_000;
    this.timeoutMs = options.timeoutMs ?? 90_000;
    if (this.leaseMs <= 0 || this.timeoutMs <= 0) throw new Error("Orçamento de sincronização inválido.");
  }
  read(identity: SyncIdentity, force = false): Promise<SyncState> { this.assertOwner(); return this.options.store.read(identity, force); }
  trackedStates(): Promise<SyncState[]> { this.assertOwner(); return this.options.store.trackedStates(); }
  initialisedAt(): Promise<number> { this.assertOwner(); return this.options.store.initialisedAt(this.now()); }
  private assertOwner(): void {
    if (this.disposed) throw new SyncCancelledError("disposed");
    if (this.options.currentOwner() !== this.options.uid) throw new SyncCancelledError("account_changed");
  }
  enqueue<T>(job: SyncJob<T>): Promise<SyncOutcome<T>> {
    try { this.assertOwner(); } catch (error) { return Promise.reject(error); }
    const previous = this.pending.get(job.key);
    if (previous) return previous as Promise<SyncOutcome<T>>;
    let resolve!: (result: SyncOutcome<T>) => void;
    let reject!: (reason: unknown) => void;
    const promise = new Promise<SyncOutcome<T>>((done, fail) => { resolve = done; reject = fail; });
    this.pending.set(job.key, promise);
    this.queue.push({ priority: job.priority ?? priorities[job.scope], perform: async () => {
      try { resolve(await this.perform(job)); } catch (error) { reject(error); }
      finally { if (this.pending.get(job.key) === promise) this.pending.delete(job.key); }
    } });
    this.queue.sort((left, right) => left.priority - right.priority);
    void this.drain();
    return promise;
  }
  dispose(): void {
    this.disposed = true;
    this.active?.abort(new SyncCancelledError("disposed"));
    // Queued jobs are rejected by assertOwner when drained, rather than left unresolved.
  }
  private async drain(): Promise<void> {
    if (this.draining) return;
    this.draining = true;
    try { while (this.queue.length) await this.queue.shift()!.perform(); }
    finally { this.draining = false; }
  }
  private async perform<T>(job: SyncJob<T>): Promise<SyncOutcome<T>> {
    this.assertOwner();
    if (!(this.options.available ?? browserAvailable)()) return { status: "skipped", reason: "unavailable" };
    return (this.options.withAccountLock ?? browserLock)<T>(this.options.uid, async (): Promise<SyncOutcome<T>> => {
      this.assertOwner();
      if (!(this.options.available ?? browserAvailable)()) return { status: "skipped", reason: "unavailable" };
      const token = crypto.randomUUID();
      const previous = await this.options.store.claim(job, token, this.now(), this.leaseMs, state => job.isDue(state, this.now()));
      this.assertOwner();
      if (!previous) return { status: "skipped", reason: "busy_or_not_due" };
      const controller = new AbortController();
      this.active = controller;
      const assertCurrent = () => {
        this.assertOwner();
        if (controller.signal.aborted) throw controller.signal.reason ?? new SyncCancelledError("lease_lost");
      };
      const assertLease = async () => {
        assertCurrent();
        const owned = await this.options.store.renew(job.key, token, this.now(), this.leaseMs);
        assertCurrent();
        if (!owned) {
          const error = new SyncCancelledError("lease_lost");
          controller.abort(error); throw error;
        }
      };
      let renewalRunning = false;
      const renewal = setInterval(() => {
        if (renewalRunning || controller.signal.aborted) return;
        renewalRunning = true;
        void assertLease().catch(() => controller.abort(new SyncCancelledError("lease_lost"))).finally(() => { renewalRunning = false; });
      }, Math.max(100, Math.floor(this.leaseMs / 3)));
      const timeout = setTimeout(() => controller.abort(new SyncCancelledError("timeout")), (job.timeoutMs ?? this.timeoutMs));
      let abortListener: (() => void) | undefined;
      const aborted = new Promise<never>((_, reject) => {
        abortListener = () => reject(controller.signal.reason ?? new SyncCancelledError("lease_lost"));
        controller.signal.addEventListener("abort", abortListener, { once: true });
      });
      try {
        const result = await Promise.race([job.run({ uid: this.options.uid, signal: controller.signal, previous, assertCurrent, assertLease }), aborted]);
        assertCurrent();
        const completedAt = this.now();
        const finished = await this.options.store.finish(job, token, completedAt, { completed: result.completed !== false, nextDueAt: result.nextDueAt, revision: result.revision });
        assertCurrent();
        if (!finished) throw new SyncCancelledError("lease_lost");
        if (result.domains?.length) (this.options.publish ?? publishSyncDataChanged)({ uid: this.options.uid, scope: job.scope, domains: result.domains, resourceId: job.resourceId, revision: result.revision ?? `${completedAt}:${token}`, completedAt });
        return { status: result.completed === false ? "pending" : "complete", value: result.value };
      } catch (error) {
        // Do not write through a changed session or complete an expired/reassigned lease.
        if (!this.disposed && this.options.currentOwner() === this.options.uid) {
          const status = error && typeof error === "object" && "status" in error ? error.status : undefined;
          await this.options.store.fail(job, token, this.now(), status === 401 || status === 403 ? "auth_required" : "request_failed").catch(() => undefined);
        }
        throw error;
      } finally {
        clearInterval(renewal); clearTimeout(timeout);
        if (abortListener) controller.signal.removeEventListener("abort", abortListener);
        // Invalidate guards retained by an executor whose fetch ignored abort/timeout.
        controller.abort(new SyncCancelledError("disposed"));
        if (this.active === controller) this.active = null;
      }
    });
  }
}

const coordinators = new Map<string, SyncCoordinator>();
export function getSyncCoordinator(uid: string): SyncCoordinator {
  // A new account cannot share promises, state or timers from the previous session.
  for (const [owner, coordinator] of coordinators) if (owner !== uid) { coordinator.dispose(); coordinators.delete(owner); }
  let coordinator = coordinators.get(uid);
  if (!coordinator) {
    coordinator = new SyncCoordinator({ uid, store: createFirestoreSyncStateStore(uid), currentOwner: () => getFirebaseAuth().currentUser?.uid ?? null });
    coordinators.set(uid, coordinator);
  }
  return coordinator;
}
export function clearSyncCoordinators(): void { coordinators.forEach(value => value.dispose()); coordinators.clear(); }
