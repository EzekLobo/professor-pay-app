import { afterEach, expect, it, vi } from "vitest";
import { withKodlandSyncLock } from "./kodland-sync-lock";
afterEach(() => vi.unstubAllGlobals());
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
  const request = vi.fn(async (_name, fn) => fn()); vi.stubGlobal("navigator", { locks: { request } });
  await withKodlandSyncLock("u", async () => 42); expect(request.mock.calls[0][0]).toBe("nexusclass:kodland-write:u");
});
