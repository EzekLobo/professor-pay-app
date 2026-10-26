import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getDoc: vi.fn(), transaction: vi.fn(), userId: "" }));
vi.mock("@/lib/firebase", () => ({ getFirebaseDb: () => ({}), getFirebaseAuth: () => ({ currentUser: { uid: mocks.userId } }) }));
vi.mock("firebase/firestore", () => ({
  doc: (_db: unknown, ...parts: string[]) => parts.join("/"),
  getDoc: mocks.getDoc,
  runTransaction: mocks.transaction,
}));
import { localReleaseNotesStore, releaseNotesStore } from "./release-notes-store";
const snapshot = (version: unknown) => ({ data: () => ({ seen_version: version }) });
const local = new Map<string, string>();
let count = 0;
let id = "";
beforeEach(() => {
  vi.resetAllMocks(); local.clear();
  id = `account-${++count}`; mocks.userId = id;
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => local.set(key, value) } });
  mocks.getDoc.mockResolvedValue(snapshot(0));
  mocks.transaction.mockImplementation(async (_db, work) => work({ get: async () => snapshot(0), set: vi.fn() }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("persistência das novidades por conta", () => {
  it("usa o progresso remoto para não repetir em outro dispositivo", async () => {
    mocks.getDoc.mockResolvedValue(snapshot(12));
    expect(await releaseNotesStore.load(id)).toBe(12);
    expect(await localReleaseNotesStore.load(id)).toBe(12);
    expect(mocks.getDoc).toHaveBeenCalledWith(`users/${id}/ui_state/release_notes`);
  });
  it("mantém leitura local e tenta sincronizá-la quando a rede volta", async () => {
    await localReleaseNotesStore.markSeen(id, 8);
    mocks.getDoc.mockResolvedValue(snapshot(3));
    expect(await releaseNotesStore.load(id)).toBe(8);
    expect(mocks.transaction).toHaveBeenCalled();
  });
  it("não deixa uma aba antiga reduzir a versão já lida", async () => {
    const set = vi.fn();
    mocks.transaction.mockImplementation(async (_db, work) => work({ get: async () => snapshot(15), set }));
    await releaseNotesStore.markSeen(id, 10);
    expect(set).not.toHaveBeenCalled();
    await localReleaseNotesStore.markSeen(id, 20);
    await localReleaseNotesStore.markSeen(id, 5);
    expect(await localReleaseNotesStore.load(id)).toBe(20);
  });
  it("confirma por transação somente uma versão mais recente", async () => {
    const set = vi.fn();
    mocks.transaction.mockImplementation(async (_db, work) => work({ get: async () => snapshot(2), set }));
    await releaseNotesStore.markSeen(id, 9);
    expect(set).toHaveBeenCalledWith(`users/${id}/ui_state/release_notes`, expect.objectContaining({ seen_version: 9 }), { merge: true });
  });
  it("continua funcionando offline e isola contas", async () => {
    mocks.transaction.mockRejectedValue(new Error("offline"));
    await releaseNotesStore.markSeen(id, 10);
    mocks.getDoc.mockRejectedValue(new Error("offline"));
    expect(await releaseNotesStore.load(id)).toBe(10);
    expect(await localReleaseNotesStore.load(`${id}-other`)).toBe(0);
  });
  it("não envia dados para outra conta após troca de usuário", async () => {
    mocks.userId = "another";
    await releaseNotesStore.markSeen(id, 5);
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.getDoc).not.toHaveBeenCalled();
  });
  it("não fica aguardando uma conexão travada", async () => {
    vi.useFakeTimers();
    await localReleaseNotesStore.markSeen(id, 7);
    mocks.getDoc.mockReturnValue(new Promise(() => undefined));
    const result = releaseNotesStore.load(id);
    await vi.advanceTimersByTimeAsync(2000);
    expect(await result).toBe(7);
  });
  it("tolera localStorage indisponível sem repetir na mesma sessão", async () => {
    vi.stubGlobal("window", { get localStorage() { throw new Error("blocked"); } });
    await localReleaseNotesStore.markSeen(id, 4);
    expect(await localReleaseNotesStore.load(id)).toBe(4);
  });
});
