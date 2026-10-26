import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ uid: "a", getDocs: vi.fn(), setDoc: vi.fn(), deleteDoc: vi.fn(), updateDoc: vi.fn() }));
vi.mock("@/lib/firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: mock.uid } }), getFirebaseDb: () => ({}) }));
vi.mock("firebase/firestore", () => ({ collection: (_db: unknown, ...path: string[]) => path.join("/"), doc: (_db: unknown, ...path: string[]) => path.join("/"), getDocs: mock.getDocs, setDoc: mock.setDoc, deleteDoc: mock.deleteDoc, updateDoc: mock.updateDoc }));
import { taskBoardStore as store, assertTaskBoardReadyForDataChange, clearTaskBoardLocalState, withTaskBoardDataChange } from "./task-board-store";
import { createTaskCard } from "./task-board";
const data = new Map<string, string>();
beforeEach(() => {
  vi.resetAllMocks(); data.clear(); mock.uid = "a";
  vi.stubGlobal("window", { localStorage: { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value), removeItem: (key: string) => data.delete(key) } });
  mock.getDocs.mockResolvedValue({ docs: [] }); mock.setDoc.mockResolvedValue(undefined); mock.deleteDoc.mockResolvedValue(undefined); mock.updateDoc.mockResolvedValue(undefined);
});
describe("persistência e fila offline", () => {
  it("preserva a tarefa offline e sincroniza depois sem duplicar", async () => {
    mock.setDoc.mockRejectedValue(new Error("offline"));
    const card = await store.save(createTaskCard({ title: "Revisar aula" }));
    await expect(store.sync!()).rejects.toThrow();
    expect(store.status!().pending).toBe(1);
    mock.getDocs.mockRejectedValue(new Error("offline"));
    expect((await store.list())[0].id).toBe(card.id);
    await expect(store.sync!()).rejects.toThrow();
    mock.setDoc.mockResolvedValue(undefined);
    await store.sync!();
    expect(store.status!().pending).toBe(0);
    expect(JSON.parse([...data.values()][0]).cards).toHaveLength(1);
  });
  it("impede limpar/importar/exportar com alterações pendentes", async () => {
    mock.setDoc.mockRejectedValue(new Error("offline"));
    await store.save(createTaskCard({ title: "Importante" }));
    await expect(store.sync!()).rejects.toThrow();
    await expect(assertTaskBoardReadyForDataChange("a")).rejects.toThrow();
    expect(() => clearTaskBoardLocalState("a")).toThrow();
    const action = vi.fn();
    await expect(withTaskBoardDataChange("a", action)).rejects.toThrow();
    expect(action).not.toHaveBeenCalled();
  });
  it("não expõe o cache da conta anterior", async () => {
    await store.save(createTaskCard({ title: "Privada" })); await store.sync!();
    mock.uid = "b";
    expect(await store.list()).toEqual([]); await store.sync!();
    await expect(assertTaskBoardReadyForDataChange("a")).rejects.toThrow();
  });
  it("edita com patch e não recria tarefa removida remotamente", async () => {
    const card = await store.save(createTaskCard({ title: "Original" })); await store.sync!();
    mock.updateDoc.mockRejectedValue(new Error("not-found"));
    await store.save({ ...card, title: "Atualizada" });
    await expect(store.sync!()).rejects.toThrow("not-found");
    expect(mock.setDoc).toHaveBeenCalledTimes(1);
    expect(mock.updateDoc).toHaveBeenCalledWith(`users/a/task_cards/${card.id}`, { title: "Atualizada" });
    expect(store.status!().pending).toBe(1);
  });
  it("recusa exclusão de tarefa que não foi arquivada", async () => {
    const card = await store.save(createTaskCard({ title: "Preservar" })); await store.sync!();
    await expect(store.remove(card.id)).rejects.toThrow(/Arquive/);
    expect(mock.deleteDoc).not.toHaveBeenCalled();
  });
  it("não diz que salvou se o armazenamento local estiver indisponível", async () => {
    vi.stubGlobal("window", { localStorage: { getItem: () => null, setItem: () => { throw new Error("Sem espaço"); } } });
    await expect(store.save(createTaskCard({ title: "Não perder" }))).rejects.toThrow("Sem espaço");
    expect(mock.setDoc).not.toHaveBeenCalled();
  });
});
