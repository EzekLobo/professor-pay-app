export type TutorPreferencesChange = { uid: string; kodland_enabled: boolean };
const EVENT = "nexusclass:tutor-preferences-changed";
const STORAGE_KEY = "nexusclass:tutor-preferences-event";
function valid(value: unknown): value is TutorPreferencesChange {
  if (!value || typeof value !== "object") return false;
  const item = value as TutorPreferencesChange;
  return typeof item.uid === "string" && !!item.uid && typeof item.kodland_enabled === "boolean";
}
/** Preference invalidation carries only identity and the integration switch, never credentials. */
export function publishTutorPreferencesChanged(change: TutorPreferencesChange): void {
  if (typeof window === "undefined" || !valid(change)) return;
  const detail = { uid: change.uid, kodland_enabled: change.kodland_enabled };
  window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ change: detail, revision: crypto.randomUUID() })); }
  catch { /* Local invalidation still works when browser storage is unavailable. */ }
}
export function subscribeTutorPreferencesChanged(uid: string, listener: (change: TutorPreferencesChange) => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const receive = (value: unknown) => { if (valid(value) && value.uid === uid) listener(value); };
  const local = (event: Event) => receive((event as CustomEvent).detail);
  const storage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try { receive(JSON.parse(event.newValue).change); } catch { /* Ignore malformed external events. */ }
  };
  window.addEventListener(EVENT, local); window.addEventListener("storage", storage);
  return () => { window.removeEventListener(EVENT, local); window.removeEventListener("storage", storage); };
}
