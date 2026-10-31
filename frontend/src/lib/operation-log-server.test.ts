import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const fake = vi.hoisted(() => ({ documents: new Map<string, Record<string, unknown>>() }));
vi.mock("./firebase-admin", () => ({ getAdminDb: () => ({
  collection: (collection: string) => {
    let minimum = 0; let cap = 201;
    const query = {
      doc: (id: string) => `${collection}/${id}`,
      where: (_name: string, _operator: string, value: { toMillis: () => number }) => { minimum = value.toMillis(); return query; },
      orderBy: () => query, limit: (value: number) => { cap = value; return query; },
      get: async () => ({ docs: [...fake.documents.entries()].filter(([key, value]) => key.startsWith(collection + "/") && (value.updatedAt as { toMillis: () => number })?.toMillis() >= minimum).sort((a, b) => (b[1].updatedAt as { toMillis: () => number }).toMillis() - (a[1].updatedAt as { toMillis: () => number }).toMillis()).slice(0, cap).map(([, value]) => ({ data: () => value })) }),
    }; return query;
  },
  runTransaction: async (action: (tx: unknown) => Promise<unknown>) => action({ get: async (path: string) => { const value = fake.documents.get(path); return { data: () => value }; }, set: (path: string, data: Record<string, unknown>) => fake.documents.set(path, data) }),
}) }));
import { recentOperationLogs, saveOperationLogs, OperationLogRateLimitError } from "./operation-log-server";
import type { OperationLogInput } from "./operation-log";
const now = new Date("2026-10-31T12:00:00Z");
const event: OperationLogInput = { id: "12345678-1234-1234-1234-123456789abc", operation: "kodland_sync", status: "running" };
beforeEach(() => fake.documents.clear());
describe("armazenamento do diagnóstico", () => {
  it("isola por UID, usa relógio do servidor e prepara expiração", async () => {
    await saveOperationLogs("a", [event], now); await saveOperationLogs("b", [{ ...event, status: "error" }], now);
    const first = fake.documents.get(`operation_logs/a_${event.id}`)!;
    expect(first.userId).toBe("a"); expect(first.origin).toBe("client"); expect((first.receivedAt as { toDate: () => Date }).toDate()).toEqual(now);
    expect((first.expiresAt as { toMillis: () => number }).toMillis()).toBe(now.getTime() + 30 * 86400000);
    expect(fake.documents.get(`operation_logs/b_${event.id}`)?.status).toBe("error");
  });
  it("uma conclusão não é desfeita por início atrasado ou duplicado", async () => {
    await saveOperationLogs("a", [event], now);
    await saveOperationLogs("a", [{ ...event, status: "success", durationMs: 42 }], new Date(now.getTime() + 1000));
    await saveOperationLogs("a", [event], new Date(now.getTime() + 2000));
    expect(fake.documents.get(`operation_logs/a_${event.id}`)).toMatchObject({ status: "success", durationMs: 42 });
  });
  it("impõe limite por conta, sem bloquear outra conta", async () => {
    for (let index = 0; index < 6; index++) await saveOperationLogs("a", Array(20).fill(event), now);
    await expect(saveOperationLogs("a", [event], now)).rejects.toBeInstanceOf(OperationLogRateLimitError);
    await expect(saveOperationLogs("b", [event], now)).resolves.toBeUndefined();
    await expect(saveOperationLogs("a", [event], new Date(now.getTime() + 60000))).resolves.toBeUndefined();
  });
  it("consulta é limitada e não devolve campos arbitrários armazenados no servidor", async () => {
    await saveOperationLogs("a", [{ ...event, status: "error" }], now);
    fake.documents.get(`operation_logs/a_${event.id}`)!.accidentalSecret = "private";
    const result = await recentOperationLogs(7, now);
    expect(result.logs).toHaveLength(1); expect(result.logs[0].updatedAt).toBe(now.toISOString());
    expect(JSON.stringify(result)).not.toContain("private"); expect(JSON.stringify(result)).not.toContain("expiresAt");
  });
});

it("retorna no máximo200 registros e avisa que existem anteriores", async () => {
  await saveOperationLogs("a", [{ ...event, status: "success" }], now);
  const original = fake.documents.get(`operation_logs/a_${event.id}`)!;
  for (let index = 0; index < 201; index++) {
    const id = `12345678-1234-1234-1234-${index.toString(16).padStart(12, "0")}`;
    fake.documents.set(`operation_logs/a_${id}`, { ...original, id });
  }
  const result = await recentOperationLogs(7, now); expect(result.logs).toHaveLength(200); expect(result.truncated).toBe(true);
});
