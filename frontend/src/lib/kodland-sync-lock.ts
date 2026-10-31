/** Serialize manual and automatic writes, including across tabs with Web Locks. */
const queues = new Map<string, Promise<unknown>>();
export function withKodlandSyncLock<T>(uid: string, action: () => Promise<T>): Promise<T> {
  const run = () => typeof navigator !== "undefined" && navigator.locks
    ? navigator.locks.request(`nexusclass:kodland-write:${uid}`, action)
    : action();
  const previous = queues.get(uid) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(run);
  queues.set(uid, result);
  void result.finally(() => { if (queues.get(uid) === result) queues.delete(uid); }).catch(() => undefined);
  return result;
}
