import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ getUser: vi.fn(), getDb: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase-admin", () => ({ getAdminAuth: () => ({ getUser: mocks.getUser }), getAdminDb: mocks.getDb }));
vi.mock("@/lib/server-auth", () => ({ RequestAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { getAccountUsername, removeAccountUsernames, setAccountUsername } from "./account-username";
import { POST as resolveLogin } from "@/app/api/auth/username/route";

type Row = Record<string, unknown>;
const store = new Map<string, Row>();
const snapshot = (path: string) => ({ exists: store.has(path), data: () => store.get(path) });
const ref = (path: string) => ({ path, get: async () => snapshot(path) });
let transactionCount = 0;
beforeEach(() => {
  vi.resetAllMocks(); store.clear(); transactionCount = 0;
  mocks.getUser.mockResolvedValue({ email: "teacher@example.test", customClaims: { username: "old.nick", otherClaim: true } });
  let queue = Promise.resolve();
  mocks.getDb.mockReturnValue({
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (work: (tx: { get(reference: { path: string }): Promise<ReturnType<typeof snapshot>>; set(reference: { path: string }, data: Row): void; delete(reference: { path: string }): void }) => Promise<void>) => {
      const task = queue.then(async () => {
        transactionCount++;
        const writes: Array<() => void> = [];
        await work({
          get: async (reference) => snapshot(reference.path),
          set: (reference, data) => { writes.push(() => store.set(reference.path, data)); },
          delete: (reference) => { writes.push(() => store.delete(reference.path)); },
        });
        writes.forEach((write) => write());
      });
      queue = task.catch(() => undefined);
      return task;
    },
  });
});

describe("nick único da própria conta", () => {
  it("carrega o nick legado sem exigir migração", async () => {
    expect(await getAccountUsername("teacher")).toBe("old.nick");
  });
  it("prioriza o índice atualizado em vez de claims antigas", async () => {
    store.set("login_accounts/teacher", { username: "current.nick" });
    expect(await getAccountUsername("teacher")).toBe("current.nick");
  });
  it("salva o nick normalizado e permite login por ele", async () => {
    expect(await setAccountUsername("teacher", "  Professor.Ana  ")).toBe("professor.ana");
    const response = await resolveLogin(new Request("http://localhost/api/auth/username", { method: "POST", body: JSON.stringify({ username: "PROFESSOR.ANA" }) }));
    expect(await response.json()).toEqual({ email: "teacher@example.test" });
    expect(store.get("login_usernames/professor.ana")?.uid).toBe("teacher");
    expect(transactionCount).toBe(1);
  });
  it("libera o nick antigo apenas se pertence à própria conta", async () => {
    store.set("login_usernames/old.nick", { uid: "teacher" });
    await setAccountUsername("teacher", "new.nick");
    expect(store.has("login_usernames/old.nick")).toBe(false);
    expect(await getAccountUsername("teacher")).toBe("new.nick");
    const response = await resolveLogin(new Request("http://localhost/api/auth/username", { method: "POST", body: JSON.stringify({ username: "old.nick" }) }));
    expect(response.status).toBe(401);
  });
  it("não apaga um nick antigo que já pertence a outra conta", async () => {
    store.set("login_usernames/old.nick", { uid: "another" });
    await setAccountUsername("teacher", "new.nick");
    expect(store.get("login_usernames/old.nick")?.uid).toBe("another");
  });
  it("recusa nick ocupado sem perder o nick atual", async () => {
    store.set("login_usernames/taken.nick", { uid: "another" });
    store.set("login_usernames/old.nick", { uid: "teacher" });
    await expect(setAccountUsername("teacher", "taken.nick")).rejects.toMatchObject({ status: 409 });
    expect(store.get("login_usernames/old.nick")?.uid).toBe("teacher");
    expect(store.has("login_accounts/teacher")).toBe(false);
  });
  it("só uma conta consegue reservar o mesmo nome", async () => {
    const results = await Promise.allSettled([setAccountUsername("one", "same.nick"), setAccountUsername("two", "SAME.NICK")]);
    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(1);
    expect(store.get("login_usernames/same.nick")?.uid).toBe("one");
  });
  it.each(["ab", "ana silva", "ana@example.test", "José", null])("rejeita nick inválido %j", async (value) => {
    await expect(setAccountUsername("teacher", value)).rejects.toMatchObject({ status: 400 });
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("remove os índices atual e legado ao excluir a conta, sem afetar terceiros", async () => {
    store.set("login_accounts/teacher", { username: "current.nick" });
    store.set("login_usernames/current.nick", { uid: "teacher" });
    store.set("login_usernames/old.nick", { uid: "another" });
    await removeAccountUsernames("teacher", "old.nick");
    expect(store.has("login_accounts/teacher")).toBe(false);
    expect(store.has("login_usernames/current.nick")).toBe(false);
    expect(store.get("login_usernames/old.nick")?.uid).toBe("another");
  });
});
