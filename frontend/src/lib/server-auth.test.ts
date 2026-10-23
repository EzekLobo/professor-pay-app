import { beforeEach, describe, expect, it, vi } from "vitest";
const verifyIdToken = vi.hoisted(() => vi.fn());
vi.mock("server-only", () => ({}));
vi.mock("@/lib/firebase-admin", () => ({ getAdminAuth: () => ({ verifyIdToken }) }));
import { authenticatedUser } from "./server-auth";
beforeEach(() => vi.resetAllMocks());
describe("autenticação do servidor", () => {
  it("verifica a revogação de tokens e o bloqueio da conta", async () => {
    verifyIdToken.mockResolvedValue({ uid: "teacher" });
    await authenticatedUser(new Request("http://localhost", { headers: { authorization: "Bearer token" } }));
    expect(verifyIdToken).toHaveBeenCalledWith("token", true);
  });
  it("recusa tokens revogados", async () => {
    verifyIdToken.mockRejectedValue(new Error("auth/id-token-revoked"));
    await expect(authenticatedUser(new Request("http://localhost", { headers: { authorization: "Bearer token" } }))).rejects.toMatchObject({ status: 401 });
  });
});
