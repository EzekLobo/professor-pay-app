import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticatedUser: vi.fn(), assertAdministrator: vi.fn(), getUser: vi.fn(),
  updateUser: vi.fn(), revokeRefreshTokens: vi.fn(), deleteUser: vi.fn(),
}));
vi.mock("@/lib/server-auth", () => ({
  authenticatedUser: mocks.authenticatedUser,
  assertAdministrator: mocks.assertAdministrator,
  isOwnerAdministrator: (email: string) => email === "owner@example.test",
  RequestAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } },
}));
vi.mock("@/lib/firebase-admin", () => ({
  getAdminAuth: () => mocks,
  getAdminDb: vi.fn(),
}));
import { PATCH } from "./route";
import { RequestAuthError } from "@/lib/server-auth";
const request = (body: unknown) => new Request("http://localhost/api/admin/users", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticatedUser.mockResolvedValue({ uid: "admin" });
  mocks.getUser.mockResolvedValue({ uid: "teacher", email: "teacher@example.test", disabled: false });
});

describe("bloqueio temporário de acesso", () => {
  it("bloqueia e revoga sessões sem apagar a conta", async () => {
    expect((await PATCH(request({ userId: "teacher", disabled: true }))).status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith("teacher", { disabled: true });
    expect(mocks.revokeRefreshTokens).toHaveBeenCalledWith("teacher");
    expect(mocks.deleteUser).not.toHaveBeenCalled();
  });
  it("desbloqueia preservando credenciais", async () => {
    expect((await PATCH(request({ userId: "teacher", disabled: false }))).status).toBe(200);
    expect(mocks.updateUser).toHaveBeenCalledWith("teacher", { disabled: false });
    expect(mocks.revokeRefreshTokens).not.toHaveBeenCalled();
  });
  it.each([{ userId: "admin", disabled: true }, { userId: "teacher", disabled: "true" }, { userId: "", disabled: true }])("rejeita a própria conta e entradas inválidas: %j", async (body) => {
    expect((await PATCH(request(body))).status).toBe(400);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("protege o proprietário", async () => {
    mocks.getUser.mockResolvedValue({ uid: "owner", email: "owner@example.test" });
    expect((await PATCH(request({ userId: "owner", disabled: true }))).status).toBe(403);
    expect(mocks.updateUser).not.toHaveBeenCalled();
  });
  it("recusa usuários sem permissão administrativa", async () => {
    mocks.assertAdministrator.mockImplementation(() => { throw new RequestAuthError(403, "Acesso restrito"); });
    expect((await PATCH(request({ userId: "teacher", disabled: true }))).status).toBe(403);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });
  it("retorna erro quando a conta não existe", async () => {
    mocks.getUser.mockRejectedValue({ code: "auth/user-not-found" });
    expect((await PATCH(request({ userId: "teacher", disabled: true }))).status).toBe(404);
  });
  it("informa falha de revogação para permitir nova tentativa", async () => {
    mocks.revokeRefreshTokens.mockRejectedValue(new Error("offline"));
    expect((await PATCH(request({ userId: "teacher", disabled: true }))).status).toBe(500);
  });
});
