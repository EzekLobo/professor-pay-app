import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ auth: vi.fn(), admin: vi.fn(), save: vi.fn(), recent: vi.fn() }));
vi.mock("@/lib/server-auth", () => ({ authenticatedUser: mock.auth, assertAdministrator: mock.admin, RequestAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
vi.mock("@/lib/operation-log-server", () => ({ saveOperationLogs: mock.save, recentOperationLogs: mock.recent, OperationLogRateLimitError: class extends Error {} }));
import { POST } from "./route";
import { GET } from "../admin/operation-logs/route";
import { RequestAuthError } from "@/lib/server-auth";
import { OperationLogRateLimitError } from "@/lib/operation-log-server";
const event = { id: "12345678-1234-1234-1234-123456789abc", operation: "kodland_sync", status: "error", errorCode: "network" };
const request = (value: unknown) => new Request("http://localhost/api/operation-logs", { method: "POST", body: JSON.stringify(value) });
beforeEach(() => { vi.resetAllMocks(); mock.auth.mockResolvedValue({ uid: "owner" }); mock.recent.mockResolvedValue({ logs: [], truncated: false }); });
describe("API de diagnóstico", () => {
  it("grava somente para o UID verificado pelo servidor", async () => {
    expect((await POST(request({ events: [event] }))).status).toBe(200); expect(mock.save).toHaveBeenCalledWith("owner", [event]);
    expect((await POST(request({ events: [{ ...event, userId: "another" }] }))).status).toBe(400);
  });
  it("exige autenticação para gravar e administração para consultar", async () => {
    mock.auth.mockRejectedValueOnce(new RequestAuthError(401, "Entre novamente")); expect((await POST(request({ events: [event] }))).status).toBe(401); expect(mock.save).not.toHaveBeenCalled();
  });
  it("recusa leitura para um usuário comum", async () => {
    mock.admin.mockImplementationOnce(() => { throw new RequestAuthError(403, "Restrito"); });
    expect((await GET(new Request("http://localhost"))).status).toBe(403); expect(mock.recent).not.toHaveBeenCalled();
  });
  it("consulta sem cache e limita os períodos permitidos", async () => {
    const response = await GET(new Request("http://localhost?days=999")); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("no-store"); expect(mock.recent).toHaveBeenCalledWith(7);
  });
  it("rejeita dados livres, IDs duplicados e lotes grandes", async () => {
    expect((await POST(request({ events: [{ ...event, message: "private" }] }))).status).toBe(400);
    expect((await POST(request({ events: [event, event] }))).status).toBe(400);
    expect((await POST(request({ events: Array(21).fill(event) }))).status).toBe(400);
    expect((await POST(request({ events: [], padding: "x".repeat(25000) }))).status).toBe(413); expect(mock.save).not.toHaveBeenCalled();
  });
  it("sinaliza limite temporário e não expõe detalhes de falha de infraestrutura", async () => {
    mock.save.mockRejectedValueOnce(new OperationLogRateLimitError()); const limited = await POST(request({ events: [event] })); expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
    mock.save.mockRejectedValueOnce(new Error("private_key=secret")); const failed = await POST(request({ events: [event] })); expect(failed.status).toBe(503); expect(JSON.stringify(await failed.json())).not.toContain("secret");
  });
});
