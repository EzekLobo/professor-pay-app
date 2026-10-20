import { afterEach, describe, expect, it, vi } from "vitest";
import { rememberKodlandCredentials, restoreKodlandCredentials } from "./browser-credentials";

function memoryIndexedDb() {
  const values = new Map<IDBValidKey, unknown>();
  type MemoryRequest = {
    result?: unknown;
    onsuccess?: ((event: Event) => void) | null;
  };
  type MemoryTransaction = {
    oncomplete?: ((event: Event) => void) | null;
    objectStore?: () => IDBObjectStore;
  };
  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => undefined,
    close: () => undefined,
    transaction: () => {
      const transaction: MemoryTransaction = {};
      const store = {
        get: (key: IDBValidKey) => {
          const request: MemoryRequest = {};
          queueMicrotask(() => {
            request.result = values.get(key);
            request.onsuccess?.(new Event("success"));
          });
          return request as unknown as IDBRequest;
        },
        put: (value: unknown, key: IDBValidKey) => {
          values.set(key, value);
          queueMicrotask(() => transaction.oncomplete?.(new Event("complete")));
        },
      };
      transaction.objectStore = () => store as IDBObjectStore;
      return transaction as unknown as IDBTransaction;
    },
  };
  return {
    open: () => {
      const request: MemoryRequest = { result: database };
      queueMicrotask(() => request.onsuccess?.(new Event("success")));
      return request as unknown as IDBOpenDBRequest;
    },
  } as unknown as IDBFactory;
}

describe("browser credentials", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("persists explicit values even when no enabled form controls are available", async () => {
    vi.stubGlobal("window", { indexedDB: memoryIndexedDb() });

    await expect(rememberKodlandCredentials({
      username: " professor@example.com ",
      password: "senha-segura",
    })).resolves.toBe(true);
    await expect(restoreKodlandCredentials()).resolves.toEqual({
      username: "professor@example.com",
      password: "senha-segura",
    });
  });
});
