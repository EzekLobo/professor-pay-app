import { KodlandSyncWaitError } from "./kodland-sync-client";
/** Raw executions remain queued until all writes settle, even if a waiting caller times out. */
const queues = new Map<string, Promise<unknown>>();
export function withKodlandSyncLock<T>(uid: string, action: () => Promise<T>, waitMs = 45_000): Promise<T> {
  const controller = new AbortController();
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const failure = () => new KodlandSyncWaitError("Outra sincronização ainda está em andamento ou aguardando gravação. Aguarde a conclusão e tente novamente.");
  const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { expired = true; controller.abort(); reject(failure()); }, waitMs); });
  const execute = () => { if (expired) throw failure(); clearTimeout(timer); return action(); };
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
