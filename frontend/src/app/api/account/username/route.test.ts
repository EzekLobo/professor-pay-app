import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock("@/lib/account-username", () => ({ getAccountUsername: mocks.get, setAccountUsername: mocks.save }));
vi.mock("@/lib/server-auth", () => ({ authenticatedUser: mocks.auth, RequestAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
import { GET, PATCH } from "./route";
import { RequestAuthError } from "@/lib/server-auth";
beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ uid: "self" }); mocks.get.mockResolvedValue("my.nick"); mocks.save.mockResolvedValue("new.nick"); });
describe("API do nick da conta", () => {
  it("retorna apenas o nick do usuário autenticado, sem cache", async () => {
    const response = await GET(new Request("http://localhost/api/account/username?userId=another"));
    expect(await response.json()).toEqual({ username: "my.nick" });
    expect(mocks.get).toHaveBeenCalledWith("self");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("ignora uid informado no corpo e só altera a própria conta", async () => {
    const response = await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ userId: "another", username: "new.nick" }) }));
    expect(response.status).toBe(200);
    expect(mocks.save).toHaveBeenCalledWith("self", "new.nick");
  });
  it("recusa acesso sem autenticação", async () => {
    mocks.auth.mockRejectedValue(new RequestAuthError(401, "Faça login"));
    expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: "{}" }))).status).toBe(401);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("retorna conflito de nome para o formulário", async () => {
    mocks.save.mockRejectedValue(new RequestAuthError(409, "Nick ocupado"));
    expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: JSON.stringify({ username: "taken" }) }))).status).toBe(409);
  });
  it("recusa JSON inválido", async () => {
    expect((await PATCH(new Request("http://localhost", { method: "PATCH", body: "{" }))).status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
});
