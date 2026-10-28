import { collection, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "./firebase";
import { defaultNotificationSettings, validateNotificationSettings, type NotificationCase, type NotificationSettings, type StudentNotification } from "./student-notification-rules";

export type StudentNotificationStore = {
  settings(): Promise<NotificationSettings>;
  saveSettings(input: NotificationSettings): Promise<NotificationSettings>;
  cases(): Promise<NotificationCase[]>;
  reconcile(items: StudentNotification[], timestamp: string): Promise<NotificationCase[]>;
  markRead(id: string, revision: string): Promise<void>;
  confirmContact(id: string, revision: string): Promise<void>;
};
export function validateNotificationCase(input: unknown): NotificationCase {
  if (!input || typeof input !== "object") throw new Error("Alerta inválido.");
  const value = input as NotificationCase;
  const item = value.notification;
  if (!item || !["manual", "kodland"].includes(item.source) || !["absence", "classroom", "homework"].includes(item.category)
    || typeof value.id !== "string" || !value.id || value.id.includes("/") || value.id.length > 1400 || item.id !== value.id
    || (value.reconciled_at !== undefined && (typeof value.reconciled_at !== "string" || !Number.isFinite(Date.parse(value.reconciled_at))))
    || typeof value.active !== "boolean" || !Array.isArray(value.confirmed_revisions) || value.confirmed_revisions.some(revision => typeof revision !== "string")
    || ![item.class_id, item.class_name, item.student_id, item.student_name, item.occurrence_id, item.lesson_label, item.lesson_date, item.guardian_name, item.guardian_phone, item.revision, item.reason, value.first_seen_at, value.updated_at].every(field => typeof field === "string")
    || typeof item.active !== "boolean" || typeof item.cancelled !== "boolean"
    || !(item.ended_at === null || typeof item.ended_at === "string")
    || !(value.read_revision === null || typeof value.read_revision === "string")
    || !(value.contact_confirmed_at === null || typeof value.contact_confirmed_at === "string")
    || !Array.isArray(item.activities) || item.activities.some(activity => !activity || typeof activity.id !== "string" || typeof activity.title !== "string" || !(activity.due_at === null || typeof activity.due_at === "string"))) throw new Error("O histórico de notificações é inválido.");
  return value;
}
export function reconcileNotificationCases(previous: NotificationCase[], items: StudentNotification[], timestamp: string): NotificationCase[] {
  const incoming = new Map(items.map(item => [item.id, item]));
  const merged = previous.map(item => item.reconciled_at && Date.parse(item.reconciled_at) > Date.parse(timestamp) ? item : ({ ...item, notification: incoming.get(item.id) ?? item.notification, active: incoming.has(item.id), updated_at: timestamp, reconciled_at: timestamp }));
  const existing = new Set(previous.map(item => item.id));
  return [...merged, ...items.filter(item => !existing.has(item.id)).map(notification => ({ id: notification.id, notification, active: true, read_revision: null, confirmed_revisions: [], first_seen_at: timestamp, updated_at: timestamp, reconciled_at: timestamp, contact_confirmed_at: null }))];
}
const EVENT = "nexusclass:notifications-changed";
export function notifyStudentNotificationsChanged() { if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") window.dispatchEvent(new Event(EVENT)); }
export function subscribeStudentNotifications(listener: () => void) {
  if (typeof window === "undefined") return () => undefined;
  window.addEventListener(EVENT, listener);
  return () => window.removeEventListener(EVENT, listener);
}
const owner = (expected: string) => { if (getFirebaseAuth().currentUser?.uid !== expected) throw new Error("Sua conta foi alterada. Entre novamente."); };
/** No optimistic acknowledgement: the UI removes a contact only after the server commits. */
export function createStudentNotificationStore(uid: string): StudentNotificationStore {
  const reference = (name: string, id: string) => { owner(uid); return doc(getFirebaseDb(), "users", uid, name, id); };
  const settings = async () => {
    const snapshot = await getDoc(reference("notification_settings", "default")); owner(uid);
    return snapshot.exists() ? validateNotificationSettings(snapshot.data()) : defaultNotificationSettings();
  };
  const cases = async () => {
    owner(uid); const snapshot = await getDocs(collection(getFirebaseDb(), "users", uid, "notification_cases")); owner(uid);
    return snapshot.docs.map(row => validateNotificationCase({ ...row.data(), id: row.id }));
  };
  const action = async (id: string, revision: string, confirm: boolean) => {
    const target = reference("notification_cases", id);
    await runTransaction(getFirebaseDb(), async transaction => {
      owner(uid); const snapshot = await transaction.get(target); owner(uid);
      if (!snapshot.exists()) throw new Error("Este alerta não está mais disponível. Atualize a central.");
      const current = validateNotificationCase({ ...snapshot.data(), id });
      if (current.notification.revision !== revision) throw new Error("A pendência foi atualizada. Revise os detalhes antes de confirmar.");
      transaction.set(target, { ...current, read_revision: revision, ...(confirm ? { confirmed_revisions: [...new Set([...current.confirmed_revisions, revision])], contact_confirmed_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() });
    }); owner(uid); notifyStudentNotificationsChanged();
  };
  return {
    settings, cases,
    saveSettings: async input => { const value = validateNotificationSettings(input); await setDoc(reference("notification_settings", "default"), { ...value, _last_reconciled_at: new Date().toISOString() }); owner(uid); notifyStudentNotificationsChanged(); return value; },
    reconcile: async (items, timestamp) => {
      const watermark = reference("notification_settings", "default");
      const accepted = await runTransaction(getFirebaseDb(), async transaction => {
        owner(uid); const snapshot = await transaction.get(watermark); owner(uid);
        const current: Record<string, unknown> = snapshot.data() ?? { ...defaultNotificationSettings() };
        const previousTime = Date.parse(String(current._last_reconciled_at ?? ""));
        if (Number.isFinite(previousTime) && previousTime > Date.parse(timestamp)) return false;
        transaction.set(watermark, { ...current, _last_reconciled_at: timestamp });
        return true;
      });
      if (!accepted) return cases();
      const previous = await cases();
      const desired = reconcileNotificationCases(previous, items, timestamp);
      // Small batches avoid flooding the transport, while transactions preserve contact actions from other devices.
      for (let offset = 0; offset < desired.length; offset += 6) {
        await Promise.all(desired.slice(offset, offset + 6).map(async item => {
          const old = previous.find(candidate => candidate.id === item.id);
          if (old && old.active === item.active && JSON.stringify(old.notification) === JSON.stringify(item.notification)) return;
          const target = reference("notification_cases", item.id);
          await runTransaction(getFirebaseDb(), async transaction => {
            owner(uid);
            const marker = await transaction.get(watermark);
            const snapshot = await transaction.get(target); owner(uid);
            if (Date.parse(String(marker.data()?._last_reconciled_at ?? "")) > Date.parse(timestamp)) return;
            const current = snapshot.exists() ? validateNotificationCase({ ...snapshot.data(), id: item.id }) : null;
            // An older tab/read must not reactivate a case regularized by a newer snapshot.
            if (current?.reconciled_at && Date.parse(current.reconciled_at) > Date.parse(timestamp)) return;
            transaction.set(target, current ? { ...current, notification: item.notification, active: item.active, updated_at: timestamp, reconciled_at: timestamp } : item);
          });
        }));
      }
      owner(uid); return cases();
    },
    markRead: (id, revision) => action(id, revision, false),
    confirmContact: (id, revision) => action(id, revision, true),
  };
}
/** Demo storage is deliberately separate from every authenticated UID. */
export function createDemoStudentNotificationStore(storageKey = "nexusclass.demo.notifications.v1"): StudentNotificationStore {
  const read = (): { settings: NotificationSettings; cases: NotificationCase[] } => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
    if (!raw) return { settings: defaultNotificationSettings(), cases: [] };
    const value = JSON.parse(raw);
    return { settings: validateNotificationSettings(value.settings), cases: (value.cases as unknown[]).map(validateNotificationCase) };
  };
  const write = (state: ReturnType<typeof read>) => { window.localStorage.setItem(storageKey, JSON.stringify(state)); notifyStudentNotificationsChanged(); };
  const action = async (id: string, revision: string, confirm: boolean) => {
    const state = read(); const item = state.cases.find(candidate => candidate.id === id);
    if (!item || item.notification.revision !== revision) throw new Error("A pendência mudou. Atualize a central.");
    item.read_revision = revision; item.updated_at = new Date().toISOString();
    if (confirm) { item.confirmed_revisions = [...new Set([...item.confirmed_revisions, revision])]; item.contact_confirmed_at = item.updated_at; }
    write(state);
  };
  return {
    settings: async () => read().settings,
    saveSettings: async input => { const state = read(); state.settings = validateNotificationSettings(input); write(state); return state.settings; },
    cases: async () => read().cases,
    reconcile: async (items, timestamp) => { const state = read(); state.cases = reconcileNotificationCases(state.cases, items, timestamp); window.localStorage.setItem(storageKey, JSON.stringify(state)); return state.cases; },
    markRead: (id, revision) => action(id, revision, false), confirmContact: (id, revision) => action(id, revision, true),
  };
}
