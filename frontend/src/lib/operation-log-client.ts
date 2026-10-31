"use client";
import { latestReleaseVersion } from "./release-notes";
import { getFirebaseAuth } from "./firebase";
import { classifyOperationError, operationErrorReference, operationErrorType, safeOperationPath, validateOperationLog, type OperationLogInput, type OperationName, type OperationStatus } from "./operation-log";
let owner: string | null = null;
let generation = 0;
let mounts = 0;
let shutdown: ReturnType<typeof setTimeout> | undefined;
let queue = new Map<string, OperationLogInput>();
let timer: ReturnType<typeof setTimeout> | undefined;
let inFlight = false;
let retries = 0;
let controller: AbortController | null = null;
const sampled = new Map<string, number>();
function schedule(delay = 300) {
  if (timer || !owner || !queue.size) return;
  timer = setTimeout(() => { timer = undefined; void flush(); }, delay);
}
async function flush() {
  if (inFlight || !owner || !queue.size || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  const expected = owner;
  const run = generation;
  const entries = [...queue.values()].slice(0, 20);
  const abort = new AbortController(); controller = abort; inFlight = true;
  const timeout = setTimeout(() => abort.abort(), 10000);
  try {
    const user = getFirebaseAuth().currentUser;
    if (user?.uid !== expected) return;
    const token = await Promise.race([user.getIdToken(), new Promise<string>((_, reject) => {
      abort.signal.addEventListener("abort", () => reject(new Error("log-request-timeout")), { once: true });
    })]);
    if (owner !== expected || generation !== run || getFirebaseAuth().currentUser?.uid !== expected) return;
    const response = await fetch("/api/operation-logs", { method: "POST", keepalive: true, signal: abort.signal, headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ events: entries }) });
    if (!response.ok) throw new Error("log-delivery-failed");
    if (owner !== expected || generation !== run) return;
    for (const entry of entries) if (queue.get(entry.id) === entry) queue.delete(entry.id);
    retries = 0;
  } catch { if (owner === expected && generation === run) retries++; }
  finally { clearTimeout(timeout); if (generation === run) inFlight = false; if (controller === abort) controller = null; if (owner === expected && generation === run) schedule(retries ? Math.min(120000, 5000 * 2 ** Math.min(retries - 1, 5)) : 300); }
}
/** No persistent queue and no transport before an authenticated Shell enables it. */
export function enableOperationLogging(uid: string) {
  clearTimeout(shutdown); shutdown = undefined;
  if (owner !== uid) {
    generation++; mounts = 0; inFlight = false; controller?.abort(); clearTimeout(timer); timer = undefined; queue = new Map(); sampled.clear(); owner = uid; retries = 0;
  }
  mounts++; const cohort = generation;
  const online = () => { clearTimeout(timer); timer = undefined; schedule(0); };
  const leave = () => { void flush(); };
  window.addEventListener("online", online); window.addEventListener("pagehide", leave);
  let stopped = false;
  return () => {
    if (stopped) return; stopped = true;
    window.removeEventListener("online", online); window.removeEventListener("pagehide", leave);
    if (owner !== uid || generation !== cohort) return;
    mounts--;
    // Preserve a pending completion across navigation between authenticated pages.
    if (!mounts) shutdown = setTimeout(() => {
      if (mounts || owner !== uid || generation !== cohort) return;
      generation++; inFlight = false; owner = null; queue.clear(); sampled.clear(); clearTimeout(timer); timer = undefined; controller?.abort();
    }, 500);
  };
}

type Options = Omit<Partial<OperationLogInput>, "id" | "operation" | "status">;
function enqueue(operation: OperationName, status: OperationStatus, options: Options, id: string, expected: string) {
  try {
    if (owner !== expected || getFirebaseAuth().currentUser?.uid !== expected) return;
    const pathname = safeOperationPath(typeof window !== "undefined" ? window.location?.pathname : undefined);
    const event = validateOperationLog({ id, operation, status, version: latestReleaseVersion(), ...(pathname ? { pathname } : {}), ...options });
    if (!queue.has(id) && queue.size >= 60) queue.delete(queue.keys().next().value!);
    queue.set(id, event); schedule();
  } catch { /* Diagnostics must never interrupt the operation being observed. */ }
}
export function reportOperation(operation: OperationName, status: OperationStatus, options: Options = {}, sampleMs = 60000) {
  try {
    if (!owner) return;
    const key = `${operation}:${status}:${options.errorCode ?? ""}:${options.errorType ?? ""}:${options.scope ?? ""}:${safeOperationPath(window.location?.pathname) ?? ""}`;
    if (sampleMs && Date.now() - (sampled.get(key) ?? 0) < sampleMs) return;
    sampled.set(key, Date.now());
    enqueue(operation, status, options, crypto.randomUUID(), owner);
  } catch { /* Logging is always best effort. */ }
}
export async function observeOperation<T>(operation: OperationName, action: () => Promise<T>, options: Options = {}, counts?: (result: T) => OperationLogInput["counts"], completion?: (result: T) => "success" | "warning") {
  const expected = owner;
  if (!expected) return action();
  let id: string; let start: number;
  try { id = crypto.randomUUID(); start = performance.now(); } catch { return action(); }
  const origin = safeOperationPath(typeof window !== "undefined" ? window.location?.pathname : undefined);
  const context = { ...options, ...(origin ? { pathname: origin } : {}) };
  enqueue(operation, "running", context, id, expected);
  try {
    const result = await action();
    let summary: OperationLogInput["counts"]; let status: "success" | "warning" = "success";
    try { summary = counts?.(result); status = completion?.(result) ?? "success"; } catch { /* Preserve result even when optional instrumentation fails. */ }
    enqueue(operation, status, { ...context, durationMs: Math.min(3600000, Math.max(0, Math.round(performance.now() - start))), ...(summary ? { counts: summary } : {}) }, id, expected);
    return result;
  } catch (reason) {
    enqueue(operation, "error", { ...context, durationMs: Math.min(3600000, Math.max(0, Math.round(performance.now() - start))), errorCode: classifyOperationError(reason), ...(operationErrorType(reason) ? { errorType: operationErrorType(reason) } : {}), ...(operationErrorReference(reason) ? { reference: operationErrorReference(reason) } : {}) }, id, expected);
    throw reason;
  }
}

export function operationLogDeliveryState() { return { enabled: Boolean(owner), pending: queue.size, retrying: retries > 0 }; }
