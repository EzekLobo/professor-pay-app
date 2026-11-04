import { readKodlandBrowser, updateKodlandBrowser } from "./kodland-browser-cache";
import { readKodlandLocal } from "./kodland-sync-client";
import { collection, doc, getDoc, getDocs, runTransaction, setDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "./firebase";
import { notificationCovered, type NotificationCoverage, defaultNotificationSettings, validateNotificationSettings, type NotificationCase, type NotificationSettings, type StudentNotification } from "./student-notification-rules";

export type StudentNotificationStore = {
  settings(force?: boolean): Promise<NotificationSettings>;
  saveSettings(input: NotificationSettings): Promise<NotificationSettings>;
  cases(force?: boolean): Promise<NotificationCase[]>;
  reconcile(items: StudentNotification[], timestamp: string, coverage?: NotificationCoverage): Promise<NotificationCase[]>;
  markRead(id: string, revision: string): Promise<void>;
  confirmContact(id: string, revision: string): Promise<void>;
};
// Notification DTOs contain strings/numbers/arrays only; omit optional undefined fields rejected by Firestore.
const notificationPayload = (value: NotificationCase): NotificationCase => JSON.parse(JSON.stringify(value));
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
export function reconcileNotificationCases(previous: NotificationCase[], items: StudentNotification[], timestamp: string, coverage?: NotificationCoverage): NotificationCase[] {
  items = items.filter(item => notificationCovered(item, coverage));
  const preserved = previous.filter(item => !notificationCovered(item.notification, coverage));
  previous = previous.filter(item => notificationCovered(item.notification, coverage));
  const incoming = new Map(items.map(item => [item.id, item]));
  const merged = previous.map(item => item.reconciled_at && Date.parse(item.reconciled_at) > Date.parse(timestamp) ? item : ({ ...item, notification: incoming.get(item.id) ?? item.notification, active: incoming.has(item.id), updated_at: timestamp, reconciled_at: timestamp }));
  const existing = new Set(previous.map(item => item.id));
  return [...preserved, ...merged, ...items.filter(item => !existing.has(item.id)).map(notification => {
    const aliases = previous.filter(item => item.notification.source === notification.source && item.notification.class_id === notification.class_id && item.notification.student_id === notification.student_id && item.notification.category === notification.category && item.notification.lesson_date === notification.lesson_date && Boolean(notification.ended_at) && item.notification.ended_at === notification.ended_at);
    const alias = aliases.length === 1 ? aliases[0] : undefined;
    return { id: notification.id, notification, active: true, read_revision: alias?.read_revision ?? null, confirmed_revisions: alias?.confirmed_revisions ?? [], first_seen_at: alias?.first_seen_at ?? timestamp, updated_at: timestamp, reconciled_at: timestamp, contact_confirmed_at: alias?.contact_confirmed_at ?? null };
  })];
}
const EVENT = "nexusclass:notifications-changed";
export function notifyStudentNotificationsChanged(change: "source" | "history" = "source") { if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") window.dispatchEvent(new CustomEvent(EVENT, { detail: change })); }
export function subscribeStudentNotifications(listener: (change: "source" | "history") => void) {
  if (typeof window === "undefined") return () => undefined;
  const handle = (event: Event) => listener((event as CustomEvent).detail === "history" ? "history" : "source");
  window.addEventListener(EVENT, handle);
  return () => window.removeEventListener(EVENT, handle);
}
const owner = (expected: string) => { if (getFirebaseAuth().currentUser?.uid !== expected) throw new Error("Sua conta foi alterada. Entre novamente."); };
/** No optimistic acknowledgement: the UI removes a contact only after the server commits. */
export function createRemoteStudentNotificationStore(uid: string): StudentNotificationStore {
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
      transaction.set(target, notificationPayload({ ...current, read_revision: revision, ...(confirm ? { confirmed_revisions: [...new Set([...current.confirmed_revisions, revision])], contact_confirmed_at: new Date().toISOString() } : {}), updated_at: new Date().toISOString() }));
    }); owner(uid); notifyStudentNotificationsChanged("history");
  };
  return {
    settings, cases,
    saveSettings: async input => { const value = validateNotificationSettings(input); await setDoc(reference("notification_settings", "default"), { ...value, _last_reconciled_at: new Date().toISOString() }); owner(uid); notifyStudentNotificationsChanged("history"); return value; },
    reconcile: async (items, timestamp, coverage) => {
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
      const desired = reconcileNotificationCases(previous, items, timestamp, coverage);
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
            transaction.set(target, notificationPayload(current ? { ...current, notification: item.notification, active: item.active, updated_at: timestamp, reconciled_at: timestamp } : item));
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

/** Derived browser alerts must not wait for a Firestore write; contact confirmation still requires a remote commit. */
export function createStudentNotificationStore(uid: string): StudentNotificationStore {
  const remote = createRemoteStudentNotificationStore(uid);
  if (typeof indexedDB === "undefined") return remote;
  const local = async () => { owner(uid); const value = await readKodlandBrowser(uid); owner(uid); return value; };
  const update = (mutate: (cache: NonNullable<import("./kodland-browser-cache").KodlandBrowserState["notificationCache"]>) => void) => updateKodlandBrowser(uid, state => { state.notificationCache ??= { cases: [] }; mutate(state.notificationCache); }, () => getFirebaseAuth().currentUser?.uid === uid);
  const bounded = <T,>(action: () => Promise<T>, label: string) => readKodlandLocal(action, crypto.randomUUID(), label, 3000);
  const settings = async (force = false) => {
    const state = await local(); const cached = state?.notificationCache;
    if (!force && state?.active && cached?.settings && Date.now() - (cached.settingsAt ?? 0) < 6 * 3600000) return cached.settings;
    try {
      const value = await bounded(remote.settings, "Configurações de notificações"); owner(uid);
      await update(cache => { cache.settings = value; cache.settingsAt = Date.now(); }); return value;
    } catch (error) { owner(uid); if (cached?.settings) return cached.settings; throw error; }
  };
  const cases = async (force = false) => {
    const state = await local();
    if (!state?.active) {
      try {
        const rows = await bounded(remote.cases, "Histórico de notificações"); owner(uid);
        await update(cache => { cache.cases = rows; cache.remoteCasesAt = Date.now(); }); return rows;
      } catch (error) { owner(uid); if (state?.notificationCache) return state.notificationCache.cases; throw error; }
    }
    const cached = state.notificationCache;
    if (!force && cached && Date.now() - (cached.remoteCasesAt ?? 0) < 6 * 3600000) return cached.cases;
    try {
      const rows = await bounded(remote.cases, "Histórico de notificações"); owner(uid);
      const saved = await update(cache => {
        const merged = new Map(cache.cases.map(item => [item.id, item]));
        for (const row of rows) {
          const previous = merged.get(row.id);
          const newer = previous && Date.parse(previous.reconciled_at ?? previous.updated_at) > Date.parse(row.reconciled_at ?? row.updated_at) ? previous : row;
          merged.set(row.id, { ...newer, confirmed_revisions: [...new Set([...(previous?.confirmed_revisions ?? []), ...row.confirmed_revisions])] });
        }
        cache.cases = [...merged.values()]; cache.remoteCasesAt = Date.now();
      }); return saved.notificationCache!.cases;
    } catch { owner(uid); return cached?.cases ?? []; }
  };
  return {
    settings, cases,
    saveSettings: async input => { const value = await remote.saveSettings(input); owner(uid); await update(cache => { cache.settings = value; cache.settingsAt = Date.now(); }); return value; },
    reconcile: async (items, timestamp, coverage) => {
      if (!(await local())?.active) return remote.reconcile(items, timestamp, coverage);
      const saved = await update(cache => { cache.cases = reconcileNotificationCases(cache.cases, items, timestamp, coverage); });
      return saved.notificationCache!.cases;
    },
    markRead: async (id, revision) => {
      if (!(await local())?.active) return remote.markRead(id, revision);
      await update(cache => { const item = cache.cases.find(row => row.id === id); if (!item || item.notification.revision !== revision) throw new Error("A pendência foi atualizada. Atualize a central."); item.read_revision = revision; });
      notifyStudentNotificationsChanged("history");
    },
    confirmContact: async (id, revision) => {
      const state = await local(); if (!state?.active) return remote.confirmContact(id, revision);
      const cached = state.notificationCache?.cases.find(item => item.id === id);
      if (!cached || cached.notification.revision !== revision) throw new Error("A pendência foi atualizada. Atualize a central.");
      const target = doc(getFirebaseDb(), "users", uid, "notification_cases", id);
      const timestamp = new Date().toISOString();
      let confirmations: string[] = [];
      await runTransaction(getFirebaseDb(), async transaction => {
        owner(uid); const snapshot = await transaction.get(target); owner(uid);
        const stored = snapshot.exists() ? validateNotificationCase({ ...snapshot.data(), id }) : null;
        if (stored && stored.notification.revision !== revision && Date.parse(stored.reconciled_at ?? stored.updated_at) > Date.parse(cached.reconciled_at ?? cached.updated_at)) throw new Error("A pendência foi atualizada. Atualize a central.");
        confirmations = [...new Set([...(stored?.confirmed_revisions ?? []), ...cached.confirmed_revisions, revision])];
        transaction.set(target, notificationPayload({ ...cached, confirmed_revisions: confirmations, read_revision: revision, contact_confirmed_at: timestamp, updated_at: timestamp }));
      });
      owner(uid);
      await update(cache => { const item = cache.cases.find(row => row.id === id); if (item) { item.confirmed_revisions = [...new Set([...item.confirmed_revisions, ...confirmations])]; item.contact_confirmed_at = timestamp; } });
      notifyStudentNotificationsChanged("history");
    },
  };
}
