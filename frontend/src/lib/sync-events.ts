import type { SyncScope } from "./sync-policy";

export type SyncDataDomain = "activities" | "attendance" | "ranking" | "payments" | "agenda" | "recordings" | "call_link";
export type SyncDataEvent = { uid: string; scope: SyncScope; domains: SyncDataDomain[]; resourceId: string; revision: string; completedAt: number };
const EVENT = "nexusclass:sync-data-changed";
const STORAGE_EVENT = "nexusclass:sync-data-event";
const scopes: SyncScope[] = ["activities", "attendance", "ranking", "extras_discovery", "extra_final_check", "recordings", "call_link", "payroll", "manual"];
const domains: SyncDataDomain[] = ["activities", "attendance", "ranking", "payments", "agenda", "recordings", "call_link"];
function validEvent(value: unknown): value is SyncDataEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as SyncDataEvent;
  return typeof event.uid === "string" && event.uid.length > 0 && event.uid.length <= 128
    && scopes.includes(event.scope) && Array.isArray(event.domains) && event.domains.every(domain => domains.includes(domain))
    && typeof event.resourceId === "string" && event.resourceId.length <= 1400
    && typeof event.revision === "string" && event.revision.length <= 200 && Number.isFinite(event.completedAt);
}
/** Event payloads contain identifiers/revisions, never credentials or meeting URLs. */
export function publishSyncDataChanged(event: SyncDataEvent): void {
  if (typeof window === "undefined" || !validEvent(event)) return;
  const detail: SyncDataEvent = { uid: event.uid, scope: event.scope, domains: [...event.domains], resourceId: event.resourceId, revision: event.revision, completedAt: event.completedAt };
  window.dispatchEvent(new CustomEvent<SyncDataEvent>(EVENT, { detail }));
  try { window.localStorage.setItem(STORAGE_EVENT, JSON.stringify({ event: detail, id: crypto.randomUUID() })); }
  catch { /* Local listeners remain usable when storage is unavailable. */ }
}
export function subscribeSyncDataChanged(uid: string, listener: (event: SyncDataEvent) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const seen = new Set<string>();
  const callback = (event: Event) => {
    const detail = (event as CustomEvent<SyncDataEvent>).detail;
    if (validEvent(detail) && detail.uid === uid) listener(detail);
  };
  const storage = (event: StorageEvent) => {
    if (event.key !== STORAGE_EVENT || !event.newValue) return;
    try {
      const packet = JSON.parse(event.newValue);
      const value = packet.event;
      if (typeof packet.id !== "string" || seen.has(packet.id)) return;
      if (validEvent(value) && value.uid === uid) {
        seen.add(packet.id);
        if (seen.size > 128) seen.delete(seen.values().next().value!);
        listener(value);
      }
    } catch { /* Ignore incomplete/unrelated cross-tab messages; never echo them. */ }
  };
  window.addEventListener(EVENT, callback);
  window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, callback); window.removeEventListener("storage", storage); };
}
