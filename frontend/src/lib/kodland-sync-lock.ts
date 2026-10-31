import { KodlandSyncWaitError } from "./kodland-sync-client";
/** Raw executions remain queued until all writes settle, even if a waiting caller times out. */
const queues = new Map<string, Promise<unknown>>();
export function withKodlandSyncLock<T>(uid: string, action: () => Promise<T>, waitMs = 45_000): Promise<T> {
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const failure = () => new KodlandSyncWaitError("Outra sincronização ainda está em andamento ou aguardando gravação. Aguarde a conclusão e tente novamente.");
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; controller.abort(); reject(failure()); }, waitMs); });
  const execute = async () => { if (expired) throw failure(); clearTimeout(timer); return action(); };
  const previous = queues.get(uid) ?? Promise.resolve();
  const raw = previous.catch(() => undefined).then(() => {
    if (expired) throw failure();
    return typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request(`nexusclass:kodland-write:${uid}`, { signal: controller.signal }, execute)
      : execute();
  });
  queues.set(uid, raw);
  void raw.finally(() => { clearTimeout(timer); if (queues.get(uid) === raw) queues.delete(uid); }).catch(() => undefined);
  return Promise.race([raw, deadline]);
}

export class KodlandAutoSyncBusyError extends Error {}
const manualPauses = new Map<string, number>();
const priorityName = (uid: string) => `nexusclass:kodland-manual:${uid}`;
export function pauseKodlandAutoSync(uid: string) {
  manualPauses.set(uid, (manualPauses.get(uid) ?? 0) + 1);
  let released = false;
  return () => { if (released) return; released = true; const count = (manualPauses.get(uid) ?? 1) - 1; if (count > 0) manualPauses.set(uid, count); else manualPauses.delete(uid); };
}
export const kodlandAutoSyncAvailable = (uid: string) => !manualPauses.has(uid) && !queues.has(uid);
/** Automatic work must acquire immediately; it never joins the manual write queue. */
export function withKodlandAutoSyncLock<T>(uid: string, action: () => Promise<T>): Promise<T> {
  const busy = () => new KodlandAutoSyncBusyError("Atualização automática pausada para priorizar a sincronização em andamento.");
  if (!kodlandAutoSyncAvailable(uid)) return Promise.reject(busy());
  const execute = () => { if (manualPauses.has(uid) || queues.get(uid) !== raw) throw busy(); return action(); };
  const raw: Promise<T> = Promise.resolve().then(() => {
    if (manualPauses.has(uid)) throw busy();
    if (typeof navigator === "undefined" || !navigator.locks) return execute();
    return navigator.locks.request(priorityName(uid), { mode: "shared", ifAvailable: true }, async priority => {
      if (!priority || manualPauses.has(uid)) throw busy();
      return navigator.locks.request(`nexusclass:kodland-write:${uid}`, { ifAvailable: true }, async lock => { if (!lock) throw busy(); return execute(); });
    });
  });
  queues.set(uid, raw);
  void raw.finally(() => { if (queues.get(uid) === raw) queues.delete(uid); }).catch(() => undefined);
  return raw;
}
/** Reserve manual intent for the whole multi-stage import, using a distinct gate to avoid reentrant write locks. */
export async function withKodlandManualPriority<T>(uid: string, action: () => Promise<T>): Promise<T> {
  const release = pauseKodlandAutoSync(uid);
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const execute = async () => { clearTimeout(timer); if (expired) throw new KodlandSyncWaitError("Outra sincronização ainda aguarda gravação. A automática está pausada; aguarde essa operação terminar."); return action(); };
  try {
    if (typeof navigator === "undefined" || !navigator.locks) return await execute();
    timer = setTimeout(() => { expired = true; controller.abort(); }, 45_000);
    return await navigator.locks.request(priorityName(uid), { signal: controller.signal }, execute);
  } catch (error) {
    if (expired) throw new KodlandSyncWaitError("Outra sincronização ainda aguarda gravação. A automática está pausada; aguarde essa operação terminar.");
    throw error;
  } finally { clearTimeout(timer); release(); }
}
