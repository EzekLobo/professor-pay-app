import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const auth = vi.hoisted(() => ({ uid: "a", token: vi.fn(async () => "token") }));
vi.mock("./firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: auth.uid, getIdToken: auth.token } }) }));
import { enableOperationLogging, observeOperation, reportOperation } from "./operation-log-client";
let stop: (() => void) | undefined;
let fetcher: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); auth.uid = "a"; auth.token.mockReset().mockResolvedValue("token");
  vi.stubGlobal("window", Object.assign(new EventTarget(), { location: { pathname: "/corrections", search: "?private=secret" } }));
  vi.stubGlobal("navigator", { onLine: true });
  fetcher = vi.fn(async () => Response.json({ ok: true })); vi.stubGlobal("fetch", fetcher);
});
afterEach(async () => { stop?.(); stop = undefined; await vi.advanceTimersByTimeAsync(600); vi.useRealTimers(); vi.unstubAllGlobals(); });
const send = async () => { await vi.advanceTimersByTimeAsync(400); };
describe("coleta de operações", () => {
  it("não envia dados antes de uma conta habilitar a coleta", async () => {
    await expect(observeOperation("task_save", async () => "ok")).resolves.toBe("ok"); await send(); expect(fetcher).not.toHaveBeenCalled();
  });
  it("coalesce início e conclusão, preserva contagens e remove parâmetros da tela", async () => {
    stop = enableOperationLogging("a"); await observeOperation("kodland_sync", async () => ({ total: 4 }), { scope: "corrections" }, result => ({ activities: result.total }));
    await send(); const body = JSON.parse(fetcher.mock.calls[0][1].body);
    expect(body.events).toHaveLength(1); expect(body.events[0]).toMatchObject({ status: "success", pathname: "/corrections", counts: { activities: 4 } });
    expect(JSON.stringify(body)).not.toContain("private");
  });
  it("relança o mesmo erro da operação sem enviar mensagem, token ou e-mail", async () => {
    stop = enableOperationLogging("a"); const error = new Error("network password=secret token=private email@example.test");
    await expect(observeOperation("kodland_sync", async () => { throw error; })).rejects.toBe(error);
    await send(); const body = fetcher.mock.calls[0][1].body;
    expect(JSON.parse(body).events[0]).toMatchObject({ status: "error", errorCode: "network" });
    for (const value of ["password", "secret", "token", "email@example.test"]) expect(body).not.toContain(value);
  });
  it("falha na entrega do log não interrompe a operação e pode ser reenviada", async () => {
    stop = enableOperationLogging("a"); fetcher.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    await expect(observeOperation("task_save", async () => 42)).resolves.toBe(42); await send(); expect(fetcher).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(6000); expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("a obtenção lenta do token tem limite e a fila pode tentar novamente", async () => {
    stop = enableOperationLogging("a"); auth.token.mockImplementationOnce(() => new Promise(() => undefined));
    await expect(observeOperation("task_save", async () => 42)).resolves.toBe(42);
    await send(); expect(fetcher).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(17000); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("abandona o lote antigo se a conta mudar durante a obtenção do token", async () => {
    let finish!: (value: string) => void; auth.token.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    stop = enableOperationLogging("a"); reportOperation("browser_runtime", "error", { errorCode: "unexpected" }); await send();
    stop(); auth.uid = "b"; stop = enableOperationLogging("b");
    reportOperation("task_save", "success"); finish("old-token"); await send();
    expect(fetcher).toHaveBeenCalledTimes(1); expect(fetcher.mock.calls[0][1].headers.authorization).toBe("Bearer token");
    expect(JSON.parse(fetcher.mock.calls[0][1].body).events[0].operation).toBe("task_save");
  });
  it("preserva conclusão e tela de origem ao navegar dentro da mesma conta", async () => {
    stop = enableOperationLogging("a");
    let finish!: () => void;
    const job = observeOperation("kodland_sync", () => new Promise<void>(resolve => { finish = resolve; }));
    await send(); const first = JSON.parse(fetcher.mock.calls[0][1].body).events[0]; expect(first.status).toBe("running");
    stop(); stop = enableOperationLogging("a"); window.location.pathname = "/tasks";
    finish(); await job; await send();
    const last = JSON.parse(fetcher.mock.calls[1][1].body).events[0];
    expect(last).toMatchObject({ id: first.id, status: "success", pathname: "/corrections" });
  });
  it("uma falha no próprio objeto de erro não altera a exceção original", async () => {
    stop = enableOperationLogging("a");
    const reason = { get message() { throw new Error("broken getter"); } };
    await expect(observeOperation("task_save", async () => { throw reason; })).rejects.toBe(reason);
    await send(); expect(JSON.parse(fetcher.mock.calls[0][1].body).events[0].errorCode).toBe("unexpected");
  });
  it("limita erros repetidos e o tamanho da fila", async () => {
    stop = enableOperationLogging("a"); for (let index = 0; index < 20; index++) reportOperation("browser_runtime", "error", { errorCode: "unexpected" });
    await send(); expect(JSON.parse(fetcher.mock.calls[0][1].body).events).toHaveLength(1);
    for (let index = 0; index < 75; index++) reportOperation("task_save", "success", {}, 0);
    await vi.advanceTimersByTimeAsync(1500);
    expect(fetcher.mock.calls.slice(1).flatMap(call => JSON.parse(call[1].body).events)).toHaveLength(60);
  });
});
