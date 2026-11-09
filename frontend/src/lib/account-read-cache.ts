import { readWithDeadline } from "./read-deadline";
/** In-flight deduplication and bounded freshness; invalidation never resurrects an old read. */
export class AccountReadCache {
  private readonly values = new Map<string, { expires: number; pending: boolean; promise: Promise<unknown> }>();
  private readonly now: () => number;
  constructor(now = () => Date.now()) { this.now = now; }
  invalidate(uid: string): void { this.values.delete(uid); }
  async read<T>(uid: string, ttl: number, read: () => Promise<T>, owner: () => boolean): Promise<T> {
    if (!owner()) { this.values.delete(uid); throw new Error("A conta conectada mudou."); }
    let entry = this.values.get(uid);
    if (!entry || !entry.pending && entry.expires <= this.now()) {
      const promise = Promise.resolve().then(() => { if (!owner()) throw new Error("A conta conectada mudou."); return readWithDeadline(read, "Carregamento", 20_000); }).then(value => { if (!owner()) throw new Error("A conta conectada mudou."); return value; });
      entry = { expires: Infinity, pending: true, promise }; this.values.set(uid, entry);
      const current = entry;
      promise.then(() => { if (this.values.get(uid) === current) { current.pending = false; current.expires = this.now() + ttl; } }, () => undefined);
      promise.catch(() => { if (this.values.get(uid) === entry) this.values.delete(uid); });
    }
    const result = await entry.promise as T;
    if (!owner()) { if (this.values.get(uid) === entry) this.values.delete(uid); throw new Error("A conta conectada mudou."); }
    return result;
  }
}
