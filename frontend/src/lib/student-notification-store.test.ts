import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ uid: "a", documents: new Map<string, unknown>(), fail: false, writes: [] as string[] }));
vi.mock("./firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: mock.uid } }), getFirebaseDb: () => ({}) }));
vi.mock("firebase/firestore", () => ({
  collection: (_db: unknown, ...path: string[]) => path.join("/"), doc: (_db: unknown, ...path: string[]) => path.join("/"),
  getDoc: async (path: string) => ({ exists: () => mock.documents.has(path), data: () => mock.documents.get(path) }),
  getDocs: async (path: string) => ({ docs: [...mock.documents.entries()].filter(([key]) => key.startsWith(path + "/")).map(([key, value]) => ({ id: key.split("/").at(-1), data: () => value })) }),
  setDoc: async (path: string, value: unknown) => { if (mock.fail) throw new Error("offline"); mock.documents.set(path, value); mock.writes.push(path); },
  runTransaction: async (_db: unknown, action: (transaction: unknown) => Promise<unknown>) => {
    if (mock.fail) throw new Error("offline");
    return await action({ get: async (path: string) => ({ exists: () => mock.documents.has(path), data: () => mock.documents.get(path) }), set: (path: string, value: unknown) => { mock.documents.set(path, value); mock.writes.push(path); } });
  },
}));
import { createDemoStudentNotificationStore, createStudentNotificationStore, reconcileNotificationCases } from "./student-notification-store";
import { defaultNotificationSettings, evaluateStudentNotifications, needsNotificationContact, type NotificationLesson } from "./student-notification-rules";
const lesson: NotificationLesson = { source: "manual", class_id: "c", class_name: "Python", student_id: "s", student_name: "Ana", occurrence_id: "l", lesson_label: "M1L1", lesson_date: "2026-10-26", ended_at: "2026-10-26T21:00:00Z", active: true, cancelled: false, attendance: "absent", guardian_name: "Maria", guardian_phone: "" };
const settings = { ...defaultNotificationSettings("2026-10-01"), enabled: true };
const timestamp = "2026-10-28T15:00:00Z";
const item = evaluateStudentNotifications([lesson], [], settings, new Date(timestamp))[0];
beforeEach(() => { mock.uid = "a"; mock.fail = false; mock.documents.clear(); mock.writes = []; });
describe("casos e confirmação de contato", () => {
  it("sincronização repetida não duplica e regularização mantém histórico", () => {
    const cases = reconcileNotificationCases([], [item], timestamp);
    expect(reconcileNotificationCases(cases, [item], timestamp)).toHaveLength(1);
    const cleared = reconcileNotificationCases(cases, [], timestamp);
    expect(cleared).toHaveLength(1); expect(cleared[0].active).toBe(false);
  });
  it("ler não resolve, confirmar persiste e nova revisão reabre", async () => {
    const store = createStudentNotificationStore("a");
    let cases = await store.reconcile([item], timestamp);
    await store.markRead(item.id, item.revision);
    cases = await store.cases(); expect(needsNotificationContact(cases[0])).toBe(true);
    await store.confirmContact(item.id, item.revision);
    expect(needsNotificationContact((await createStudentNotificationStore("a").cases())[0])).toBe(false);
    cases = await store.reconcile([{ ...item, revision: "new" }], timestamp);
    expect(needsNotificationContact(cases[0])).toBe(true);
    await expect(store.confirmContact(item.id, "absence")).rejects.toThrow("atualizada");
  });
  it("falha de gravação não confirma contato e contas ficam isoladas", async () => {
    const store = createStudentNotificationStore("a"); await store.reconcile([item], timestamp);
    mock.fail = true; await expect(store.confirmContact(item.id, item.revision)).rejects.toThrow("offline");
    expect(needsNotificationContact((await store.cases())[0])).toBe(true);
    mock.uid = "b"; expect(await createStudentNotificationStore("b").cases()).toEqual([]);
    await expect(store.cases()).rejects.toThrow("alterada");
  });
  it("leitura sem mudanças grava só um watermark e impede resultado antigo", async () => {
    const store = createStudentNotificationStore("a");
    await store.reconcile([item], timestamp);
    mock.writes = [];
    await store.reconcile([item], "2026-10-28T15:02:00Z");
    expect(mock.writes).toEqual(["users/a/notification_settings/default"]);
    expect((await store.reconcile([], "2026-10-28T15:01:00Z"))[0].active).toBe(true);
    expect(mock.writes).toHaveLength(1);
  });
  it("resultado antigo não reativa um caso regularizado por leitura mais recente", async () => {
    const store = createStudentNotificationStore("a");
    await store.reconcile([item], timestamp);
    await store.reconcile([], "2026-10-28T15:02:00Z");
    expect((await store.reconcile([item], "2026-10-28T15:01:00Z"))[0].active).toBe(false);
  });
  it("reativação mantém contato confirmado para a mesma revisão", async () => {
    const store = createStudentNotificationStore("a"); await store.reconcile([item], timestamp); await store.confirmContact(item.id, item.revision);
    await store.reconcile([], timestamp);
    expect(needsNotificationContact((await store.reconcile([item], timestamp))[0])).toBe(false);
  });
  it("demonstração persiste localmente sem dados de conta", async () => {
    const data = new Map<string, string>();
    vi.stubGlobal("window", { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) }, dispatchEvent: () => true });
    const store = createDemoStudentNotificationStore(); await store.saveSettings(settings); await store.reconcile([item], timestamp); await store.confirmContact(item.id, item.revision);
    expect(needsNotificationContact((await createDemoStudentNotificationStore().cases())[0])).toBe(false);
    expect(mock.documents.size).toBe(0); vi.unstubAllGlobals();
  });
});
