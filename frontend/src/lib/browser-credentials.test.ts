import { afterEach, describe, expect, it, vi } from "vitest";
import { rememberKodlandCredentials, restoreKodlandCredentials } from "./browser-credentials";

const auth = vi.hoisted(() => ({ currentUser: { uid: "teacher-a" } as { uid: string } | null }));
vi.mock("@/lib/firebase", () => ({ getFirebaseAuth: () => auth }));

function memoryIndexedDb(values = new Map<IDBValidKey, unknown>()) {
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
  afterEach(() => { vi.unstubAllGlobals(); auth.currentUser = { uid: "teacher-a" }; });

  it("isolates credentials when two tutors use the same browser", async () => {
    vi.stubGlobal("window", { indexedDB: memoryIndexedDb() });
    await rememberKodlandCredentials({ username: "tutor-a", password: "password-a" });
    auth.currentUser = { uid: "teacher-b" };
    await expect(restoreKodlandCredentials()).resolves.toBeNull();
    await rememberKodlandCredentials({ username: "tutor-b", password: "password-b" });
    await expect(restoreKodlandCredentials()).resolves.toEqual({ username: "tutor-b", password: "password-b" });
    auth.currentUser = { uid: "teacher-a" };
    await expect(restoreKodlandCredentials()).resolves.toEqual({ username: "tutor-a", password: "password-a" });
    auth.currentUser = null;
    await expect(restoreKodlandCredentials()).resolves.toBeNull();
    await expect(rememberKodlandCredentials({ username: "x", password: "x" })).resolves.toBe(false);
  });

  it("never restores legacy shared credentials or requests a password-manager fallback", async () => {
    const values = new Map<IDBValidKey, unknown>();
    const get = vi.fn();
    vi.stubGlobal("window", { indexedDB: memoryIndexedDb(values) });
    vi.stubGlobal("navigator", { credentials: { get } });
    await rememberKodlandCredentials({ username: "old-tutor", password: "old-password" });
    values.set("kodland", values.get("kodland:teacher-a"));
    values.delete("kodland:teacher-a");
    await expect(restoreKodlandCredentials()).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

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
