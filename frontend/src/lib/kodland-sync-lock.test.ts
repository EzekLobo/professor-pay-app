import { afterEach, expect, it, vi } from "vitest";
import { withKodlandSyncLock } from "./kodland-sync-lock";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("serializa gravações manuais e automáticas e libera a fila após falha", async () => {
  const calls: string[] = [];
  let finish!: () => void;
  const first = withKodlandSyncLock("same-user", async () => { calls.push("manual"); await new Promise<void>(resolve => { finish = resolve; }); throw new Error("failed"); });
  const rejected = expect(first).rejects.toThrow("failed");
  const second = withKodlandSyncLock("same-user", async () => { calls.push("auto"); return "ok"; });
  await vi.waitFor(() => expect(calls).toEqual(["manual"])); finish();
  await rejected; await expect(second).resolves.toBe("ok"); expect(calls).toEqual(["manual", "auto"]);
});
it("usa o mesmo lock do navegador para coordenação entre abas", async () => {
  const request = vi.fn(async (_name, _options, fn) => fn()); vi.stubGlobal("navigator", { locks: { request } });
  await withKodlandSyncLock("u", async () => 42); expect(request.mock.calls[0][0]).toBe("nexusclass:kodland-write:u");
});

it("expira só a espera, sem liberar escrita pendente nem executar chamada cancelada depois", async () => {
  vi.useFakeTimers();
  let finish!: () => void;
  const first = withKodlandSyncLock("waiting", () => new Promise<void>(resolve => { finish = resolve; }));
  await vi.advanceTimersByTimeAsync(0);
  const skipped = vi.fn(async () => 2);
  const second = withKodlandSyncLock("waiting", skipped, 20);
  const rejection = expect(second).rejects.toThrow("Outra sincronização");
  await vi.advanceTimersByTimeAsync(21); await rejection;
  const next = vi.fn(async () => 3);
  const third = withKodlandSyncLock("waiting", next, 100);
  await vi.advanceTimersByTimeAsync(0); expect(next).not.toHaveBeenCalled();
  finish(); await first; await expect(third).resolves.toBe(3);
  expect(skipped).not.toHaveBeenCalled();
});

it("automática não entra na fila de uma gravação manual", async () => {
  const { withKodlandAutoSyncLock, KodlandAutoSyncBusyError } = await import("./kodland-sync-lock");
  let finish!:()=>void;
  const manual=withKodlandSyncLock("priority",()=>new Promise<void>(resolve=>{finish=resolve;}));
  const auto=vi.fn(async()=>42);
  await expect(withKodlandAutoSyncLock("priority",auto)).rejects.toBeInstanceOf(KodlandAutoSyncBusyError);
  expect(auto).not.toHaveBeenCalled();
  await vi.waitFor(()=>expect(finish).toBeDefined()); finish();await manual;
  await expect(withKodlandAutoSyncLock("priority",auto)).resolves.toBe(42);
});
it("pausa é contada e não volta antes de todas as janelas/etapas liberarem", async () => {
  const { pauseKodlandAutoSync,kodlandAutoSyncAvailable,withKodlandManualPriority }=await import("./kodland-sync-lock");
  const close=pauseKodlandAutoSync("modal");expect(kodlandAutoSyncAvailable("modal")).toBe(false);
  await withKodlandManualPriority("modal",async()=>{expect(kodlandAutoSyncAvailable("modal")).toBe(false);});
  expect(kodlandAutoSyncAvailable("modal")).toBe(false);close();close();expect(kodlandAutoSyncAvailable("modal")).toBe(true);
});
it("gate manual cobre o intervalo entre etapas sem adquirir novamente o lock de escrita", async()=>{
  const {withKodlandManualPriority,withKodlandAutoSyncLock}=await import("./kodland-sync-lock");
  await withKodlandManualPriority("stages",async()=>{
    await withKodlandSyncLock("stages",async()=>1);
    await expect(withKodlandAutoSyncLock("stages",async()=>2)).rejects.toThrow("pausada");
    await withKodlandSyncLock("stages",async()=>3);
  });
  await expect(withKodlandAutoSyncLock("stages",async()=>4)).resolves.toBe(4);
});
it("outra aba ocupada faz automática desistir imediatamente via ifAvailable",async()=>{
  const {withKodlandAutoSyncLock}=await import("./kodland-sync-lock");
  const request=vi.fn(async(name:string,_options:object,fn:(lock:object|null)=>unknown)=>fn(name.includes("manual")?{}:null));
  vi.stubGlobal("navigator",{locks:{request}});
  const action=vi.fn(async()=>1);
  await expect(withKodlandAutoSyncLock("other-tab",action)).rejects.toThrow("pausada");
  expect(action).not.toHaveBeenCalled();
  expect(request.mock.calls.every(call=>"ifAvailable" in call[1] && call[1].ifAvailable===true)).toBe(true);
});

it("manual solicitada antes de a automática começar ganha a vez",async()=>{
 const {withKodlandAutoSyncLock}=await import("./kodland-sync-lock");
 const autoAction=vi.fn(async()=>1);
 const auto=withKodlandAutoSyncLock("simultaneous",autoAction);
 const rejected=expect(auto).rejects.toThrow("pausada");
 const manual=withKodlandSyncLock("simultaneous",async()=>2);
 await rejected;await expect(manual).resolves.toBe(2);expect(autoAction).not.toHaveBeenCalled();
});
