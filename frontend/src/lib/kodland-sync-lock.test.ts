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
