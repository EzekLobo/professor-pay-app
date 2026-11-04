import { collection, doc, getDoc, getDocs, runTransaction } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "./firebase";
import { SYNC_POLICY_VERSION, type SyncHistory, type SyncScope } from "./sync-policy";

export type SyncState = SyncHistory & {
  key: string;
  scope: SyncScope;
  resource_id: string;
  policy_version: number;
  status: "pending" | "running" | "complete" | "error";
  last_attempt_at: number | null;
  last_success_at: number | null;
  next_due_at: number | null;
  completed: boolean;
  failures: number;
  revision: string | null;
  error_code: "request_failed" | "auth_required" | "incomplete" | null;
};
export type SyncLease = { token: string; key: string; expires_at: number };
export type SyncIdentity = { key: string; scope: SyncScope; resourceId: string };
export type SyncCompletion = { completed: boolean; nextDueAt?: number | null; revision?: string | null };
export interface SyncStateStore {
  read(identity: SyncIdentity, force?: boolean): Promise<SyncState>;
  trackedStates(): Promise<SyncState[]>;
  initialisedAt(now: number): Promise<number>;
  claim(identity: SyncIdentity, token: string, now: number, leaseMs: number, isDue: (state: SyncState) => boolean): Promise<SyncState | null>;
  renew(key: string, token: string, now: number, leaseMs: number): Promise<boolean>;
  finish(identity: SyncIdentity, token: string, now: number, result: SyncCompletion): Promise<boolean>;
  fail(identity: SyncIdentity, token: string, now: number, code: NonNullable<SyncState["error_code"]>): Promise<boolean>;
}

export function emptySyncState(identity: SyncIdentity): SyncState {
  return { key: identity.key, scope: identity.scope, resource_id: identity.resourceId, policy_version: SYNC_POLICY_VERSION, status: "pending", last_attempt_at: null, last_success_at: null, next_due_at: null, completed: false, failures: 0, revision: null, error_code: null };
}
export function syncStateDocumentId(key: string): string {
  const id = `auto_entry_${encodeURIComponent(key)}`;
  if (!key || id.length > 1400) throw new Error("Identificador de sincronização inválido.");
  return id;
}
function decodeState(identity: SyncIdentity, data?: Record<string, unknown>): SyncState {
  const empty = emptySyncState(identity);
  if (!data || data.key !== identity.key || data.policy_version !== SYNC_POLICY_VERSION) return empty;
  const numberOrNull = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  return { ...empty, status: data.status === "running" || data.status === "complete" || data.status === "error" ? data.status : "pending", last_attempt_at: numberOrNull(data.last_attempt_at), last_success_at: numberOrNull(data.last_success_at), next_due_at: numberOrNull(data.next_due_at), completed: data.completed === true, failures: typeof data.failures === "number" && data.failures >= 0 ? data.failures : 0, revision: typeof data.revision === "string" ? data.revision : null, error_code: data.error_code === "auth_required" || data.error_code === "incomplete" || data.error_code === "request_failed" ? data.error_code : null };
}
function hasLease(value: Record<string, unknown> | undefined, key: string, token: string, now: number): boolean {
  return value?.token === token && value.key === key && typeof value.expires_at === "number" && value.expires_at > now;
}

/** All automatic scopes share one per-account lease, including across devices. */
export function createFirestoreSyncStateStore(uid: string): SyncStateStore {
  const cache = new Map<string, { state: SyncState; readAt: number }>();
  const assertOwner = () => {
    if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error("A conta conectada mudou durante a atualização.");
  };
  const reference = (id: string) => doc(getFirebaseDb(), "users", uid, "sync_status", id);
  const lock = () => reference("auto_lock");
  const entry = (identity: SyncIdentity) => reference(syncStateDocumentId(identity.key));
  return {
    async read(identity, force = false) {
      assertOwner();
      const cached = cache.get(identity.key);
      if (!force && cached && Date.now() - cached.readAt < 60_000) return { ...cached.state };
      const snapshot = await getDoc(entry(identity));
      assertOwner();
      const state = decodeState(identity, snapshot.data());
      cache.set(identity.key, { state, readAt: Date.now() });
      return { ...state };
    },
    async trackedStates() {
      assertOwner();
      // One read when activation is loaded; no per-card scan or new composite index.
      const snapshot = await getDocs(collection(getFirebaseDb(), "users", uid, "sync_status"));
      assertOwner();
      return snapshot.docs.flatMap(document => {
        const data = document.data();
        if (!document.id.startsWith("auto_entry_") || !["attendance", "recordings"].includes(String(data.scope)) || typeof data.key !== "string" || typeof data.resource_id !== "string") return [];
        const identity: SyncIdentity = { key: data.key, scope: data.scope as SyncScope, resourceId: data.resource_id };
        const state = decodeState(identity, data);
        if (state.last_attempt_at === null) return [];
        cache.set(identity.key, { state, readAt: Date.now() });
        return [state];
      });
    },
    async initialisedAt(now) {
      assertOwner();
      return runTransaction(getFirebaseDb(), async transaction => {
        const config = reference("auto_config");
        const snapshot = await transaction.get(config);
        assertOwner();
        const current = snapshot.data() ?? {};
        const value = current.activation_at;
        if (typeof value === "number" && Number.isFinite(value)) return value;
        // Legacy initialised_at could have been created while the integration was off.
        // Keep it for audit; explicit activation never discards existing occurrence states.
        transaction.set(config, { ...current, activation_at: now, activation_version: 1, policy_version: SYNC_POLICY_VERSION });
        return now;
      });
    },
    async claim(identity, token, now, leaseMs, isDue) {
      assertOwner();
      return runTransaction(getFirebaseDb(), async transaction => {
        const leaseRef = lock(), stateRef = entry(identity);
        const [leaseSnapshot, stateSnapshot] = await Promise.all([transaction.get(leaseRef), transaction.get(stateRef)]);
        assertOwner();
        const lease = leaseSnapshot.data();
        if (typeof lease?.expires_at === "number" && lease.expires_at > now) return null;
        const previous = decodeState(identity, stateSnapshot.data());
        if (!isDue(previous)) return null;
        transaction.set(leaseRef, { token, key: identity.key, expires_at: now + leaseMs });
        transaction.set(stateRef, { ...previous, last_attempt_at: now, status: "running", error_code: null });
        return previous;
      });
    },
    async renew(key, token, now, leaseMs) {
      assertOwner();
      return runTransaction(getFirebaseDb(), async transaction => {
        const leaseRef = lock();
        const lease = (await transaction.get(leaseRef)).data();
        assertOwner();
        if (!hasLease(lease, key, token, now)) return false;
        transaction.set(leaseRef, { token, key, expires_at: now + leaseMs });
        return true;
      });
    },
    async finish(identity, token, now, result) {
      assertOwner();
      const finished = await runTransaction(getFirebaseDb(), async transaction => {
        const leaseRef = lock(), stateRef = entry(identity);
        const [leaseSnapshot, stateSnapshot] = await Promise.all([transaction.get(leaseRef), transaction.get(stateRef)]);
        assertOwner();
        if (!hasLease(leaseSnapshot.data(), identity.key, token, now)) return false;
        const previous = decodeState(identity, stateSnapshot.data());
        transaction.set(stateRef, { ...previous, status: result.completed ? "complete" : "pending", last_success_at: now, next_due_at: result.nextDueAt ?? null, completed: result.completed, failures: 0, error_code: null, revision: result.revision ?? previous.revision });
        transaction.set(leaseRef, { token: "", key: "", expires_at: 0 });
        return true;
      });
      if (finished) cache.delete(identity.key);
      return finished;
    },
    async fail(identity, token, now, code) {
      assertOwner();
      const failed = await runTransaction(getFirebaseDb(), async transaction => {
        const leaseRef = lock(), stateRef = entry(identity);
        const [leaseSnapshot, stateSnapshot] = await Promise.all([transaction.get(leaseRef), transaction.get(stateRef)]);
        assertOwner();
        if (!hasLease(leaseSnapshot.data(), identity.key, token, now)) return false;
        const previous = decodeState(identity, stateSnapshot.data());
        const failures = previous.failures + 1;
        transaction.set(stateRef, { ...previous, status: "error", completed: false, failures, error_code: code, next_due_at: now + Math.min(5 * 60_000, 15_000 * 2 ** Math.min(failures - 1, 5)) });
        transaction.set(leaseRef, { token: "", key: "", expires_at: 0 });
        return true;
      });
      if (failed) cache.delete(identity.key);
      return failed;
    },
  };
}

/** Deterministic adapter for tests and local/demo execution. It never calls Firebase. */
export function createMemorySyncStateStore(config: { initialised_at?: number; activation_at?: number } = {}): SyncStateStore {
  const states = new Map<string, SyncState>();
  let lease: SyncLease | null = null;
  let initialised: number | null = config.activation_at ?? null;
  return {
    async read(identity) { return { ...(states.get(identity.key) ?? emptySyncState(identity)) }; },
    async trackedStates() { return [...states.values()].filter(state => ["attendance", "recordings"].includes(state.scope) && state.last_attempt_at !== null).map(state => ({ ...state })); },
    async initialisedAt(now) { initialised ??= now; return initialised; },
    async claim(identity, token, now, leaseMs, isDue) {
      if (lease && lease.expires_at > now) return null;
      const previous = { ...(states.get(identity.key) ?? emptySyncState(identity)) };
      if (!isDue(previous)) return null;
      lease = { key: identity.key, token, expires_at: now + leaseMs };
      states.set(identity.key, { ...previous, last_attempt_at: now, status: "running", error_code: null });
      return previous;
    },
    async renew(key, token, now, leaseMs) {
      if (!lease || !hasLease(lease, key, token, now)) return false;
      lease.expires_at = now + leaseMs; return true;
    },
    async finish(identity, token, now, result) {
      if (!lease || !hasLease(lease, identity.key, token, now)) return false;
      const previous = states.get(identity.key) ?? emptySyncState(identity);
      states.set(identity.key, { ...previous, completed: result.completed, status: result.completed ? "complete" : "pending", last_success_at: now, next_due_at: result.nextDueAt ?? null, failures: 0, error_code: null, revision: result.revision ?? previous.revision });
      lease = null; return true;
    },
    async fail(identity, token, now, code) {
      if (!lease || !hasLease(lease, identity.key, token, now)) return false;
      const previous = states.get(identity.key) ?? emptySyncState(identity), failures = previous.failures + 1;
      states.set(identity.key, { ...previous, status: "error", completed: false, failures, error_code: code, next_due_at: now + Math.min(5 * 60_000, 15_000 * 2 ** Math.min(failures - 1, 5)) });
      lease = null; return true;
    },
  };
}
