import { afterEach, describe, expect, it, vi } from "vitest";
import { authApi } from "./api";

describe("authApi", () => {
  afterEach(() => vi.restoreAllMocks());

  it("envia credenciais de cookie ao consultar a sessão", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ id: "1", name: "Ana", email: "ana@example.com" }), { status: 200 }));
    await expect(authApi.me()).resolves.toMatchObject({ email: "ana@example.com" });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:8000/api/v1/users/me", expect.objectContaining({ credentials: "include" }));
  });

  it("expõe o status HTTP de uma sessão negada", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({ detail: "Unauthorized" }), { status: 401 }));
    await expect(authApi.me()).rejects.toMatchObject({ status: 401, message: "Unauthorized" });
  });
});
