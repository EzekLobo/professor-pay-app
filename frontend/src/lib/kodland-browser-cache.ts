import type { NotificationCase, NotificationSettings } from "./student-notification-rules";
/** Kodland snapshots and a notification shadow cache. Never stores credentials or tokens. */
export type BrowserRow = { id: string } & Record<string, unknown>;
export type KodlandBrowserState = {
  version: 1; active: boolean; updatedAt: string; coreAt: string;
  collections: Record<string, BrowserRow[]>;
  groupCompletedAt: Record<string, string>;
  attendanceCompletedAt?: Record<string, string>;
  notificationCache?: { settings?: NotificationSettings; settingsAt?: number; cases: NotificationCase[]; remoteCasesAt?: number };
  automatic: Record<string, { attempts: number; at: string; complete: boolean }>;
};
const database = "nexusclass-kodland-v1";
const store = "accounts";
const empty = (): KodlandBrowserState => ({ version: 1, active: false, updatedAt: "", coreAt: "", collections: {}, groupCompletedAt: {}, automatic: {} });
export class KodlandBrowserStorageError extends Error {}
const failure = () => new KodlandBrowserStorageError("Não foi possível salvar a cópia no navegador. Verifique o espaço disponível e se o armazenamento deste site está permitido. Os dados anteriores foram preservados.");
async function open(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") throw failure();
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(database, 1);
    let expired = false;
    const timer = setTimeout(() => { expired = true; reject(failure()); }, 10000);
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(store)) request.result.createObjectStore(store); };
    request.onerror = () => { clearTimeout(timer); reject(failure()); };
    request.onblocked = () => { clearTimeout(timer); expired = true; reject(failure()); };
    request.onsuccess = () => { clearTimeout(timer); if (expired) request.result.close(); else resolve(request.result); };
  });
}
/** One read/write transaction per account: no await between get and put. Resolve only after durable commit. */
export async function updateKodlandBrowser(uid: string, mutate: (state: KodlandBrowserState) => void, owner: () => boolean): Promise<KodlandBrowserState> {
  if (!uid || !owner()) throw new Error("A conta conectada mudou. Atualize a página.");
  const db = await open();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    const timer = setTimeout(() => { try { transaction.abort(); } catch {} }, 10000);
    let value: KodlandBrowserState;
    let reason: unknown;
    const request = transaction.objectStore(store).get(uid);
    request.onsuccess = () => {
      try {
        if (!owner()) throw new Error("A conta conectada mudou. Atualize a página.");
        value = request.result ?? empty();
        if (value.version !== 1) throw failure();
        mutate(value);
        transaction.objectStore(store).put(value, uid);
      } catch (error) { reason = error; transaction.abort(); }
    };
    transaction.oncomplete = () => { clearTimeout(timer); db.close(); if (owner()) resolve(value); else reject(new Error("A conta conectada mudou. Atualize a página.")); };
    transaction.onabort = transaction.onerror = () => { clearTimeout(timer); db.close(); reject(reason ?? failure()); };
  });
}
export async function readKodlandBrowser(uid: string): Promise<KodlandBrowserState | null> {
  if (typeof indexedDB === "undefined" || !uid) return null;
  try {
    const db = await open();
    return await new Promise((resolve, reject) => {
      const transaction = db.transaction(store, "readonly");
      const timer = setTimeout(() => { try { transaction.abort(); } catch {} }, 10000);
      const request = transaction.objectStore(store).get(uid);
      transaction.oncomplete = () => { clearTimeout(timer); db.close(); const value = request.result as KodlandBrowserState | undefined; resolve(value?.version === 1 ? value : null); };
      transaction.onabort = transaction.onerror = () => { clearTimeout(timer); db.close(); reject(failure()); };
    });
  } catch { return null; } // Optional cache must not block normal Firebase use when browser storage is disabled.
}
export function browserCollection(name: string) {
  return ["kodland_groups", "kodland_students", "kodland_reviews", "kodland_attendance", "kodland_lessons", "kodland_task_progress", "kodland_extra_lessons", "kodland_availability"].includes(name);
}
export async function readKodlandBrowserRows(uid: string, name: string): Promise<BrowserRow[] | null> {
  if (!browserCollection(name)) return null;
  const state = await readKodlandBrowser(uid);
  return state?.active ? state.collections[name] ?? [] : null;
}
