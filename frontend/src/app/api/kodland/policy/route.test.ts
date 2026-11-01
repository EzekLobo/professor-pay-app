import { beforeEach, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ authenticatedUser: vi.fn(), assertAdministrator: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("@/lib/firebase-admin", () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => mock }) }) }));
vi.mock("@/lib/server-auth", () => ({ authenticatedUser: mock.authenticatedUser, assertAdministrator: mock.assertAdministrator, RequestAuthError: class extends Error { constructor(public status: number, message: string) { super(message); } } }));
const request = (storage?: unknown) => new Request("https://example.test/api/kodland/policy", { method: storage === undefined ? "GET" : "PUT", ...(storage === undefined ? {} : { body: JSON.stringify({ storage }) }) });
beforeEach(() => { vi.resetModules(); vi.resetAllMocks(); mock.authenticatedUser.mockResolvedValue({ uid: "admin" }); mock.get.mockResolvedValue({ data: () => undefined }); });
it("usa navegador como padrão sem gravar nem criar configurações por usuário", async () => {
 const { GET } = await import("./route");const response = await GET(request());
 expect(response.status).toBe(200);expect(await response.json()).toEqual({storage:"browser"});expect(mock.set).not.toHaveBeenCalled();
 await GET(request());expect(mock.get).toHaveBeenCalledOnce();
});
it("somente administrador pode alterar a política global", async () => {
 const { RequestAuthError }=await import("@/lib/server-auth");mock.assertAdministrator.mockImplementation(()=>{throw new RequestAuthError(403,"Restrito");});
 const { PUT }=await import("./route");expect((await PUT(request("firebase"))).status).toBe(403);expect(mock.set).not.toHaveBeenCalled();
});
it("exige autenticação mesmo quando a configuração estiver em cache", async () => {
 const { GET }=await import("./route");await GET(request());
 const { RequestAuthError }=await import("@/lib/server-auth");mock.authenticatedUser.mockRejectedValue(new RequestAuthError(401,"Login"));
 expect((await GET(request())).status).toBe(401);
});
it("persiste escolha válida e atualiza leitura sem aguardar expiração", async () => {
 const { GET, PUT }=await import("./route");await GET(request());
 expect((await PUT(request("firebase"))).status).toBe(200);
 expect(mock.set).toHaveBeenCalledWith({storage:"firebase",updated_by:"admin",updated_at:expect.any(String)});
 expect(await (await GET(request())).json()).toEqual({storage:"firebase"});expect(mock.assertAdministrator).toHaveBeenCalledOnce();
});
it("recusa valores inválidos e não anuncia sucesso quando o Firebase recusa a gravação",async()=>{
 const { PUT, GET }=await import("./route");expect((await PUT(request("other"))).status).toBe(400);expect(mock.set).not.toHaveBeenCalled();
 mock.set.mockRejectedValue(new Error("quota"));expect((await PUT(request("firebase"))).status).toBe(503);
 expect(await (await GET(request())).json()).toEqual({storage:"browser"});
});
