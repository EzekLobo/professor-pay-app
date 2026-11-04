import { afterEach, describe, expect, it, vi } from "vitest";
import { rememberKodlandCredentials, restoreKodlandCredentials, subscribeKodlandCredentialsChanged } from "./browser-credentials";

const auth = vi.hoisted(() => ({ currentUser: { uid: "teacher-a" } as { uid: string } | null }));
vi.mock("@/lib/firebase", () => ({ getFirebaseAuth: () => auth }));

function memoryIndexedDb(values = new Map<IDBValidKey, unknown>(), onPut?: (key: IDBValidKey) => void) {
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
          onPut?.(key);
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
    vi.stubGlobal("window", Object.assign(new EventTarget(), { indexedDB: memoryIndexedDb() }));
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
    vi.stubGlobal("window", Object.assign(new EventTarget(), { indexedDB: memoryIndexedDb(values) }));
    vi.stubGlobal("navigator", { credentials: { get } });
    await rememberKodlandCredentials({ username: "old-tutor", password: "old-password" });
    values.set("kodland", values.get("kodland:teacher-a"));
    values.delete("kodland:teacher-a");
    await expect(restoreKodlandCredentials()).resolves.toBeNull();
    expect(get).not.toHaveBeenCalled();
  });

  it("persists explicit values even when no enabled form controls are available", async () => {
    vi.stubGlobal("window", Object.assign(new EventTarget(), { indexedDB: memoryIndexedDb() }));

    await expect(rememberKodlandCredentials({
      username: " professor@example.com ",
      password: "senha-segura",
    })).resolves.toBe(true);
    await expect(restoreKodlandCredentials()).resolves.toEqual({
      username: "professor@example.com",
      password: "senha-segura",
    });
  });

  it("announces only the owning UID after encrypted persistence", async () => {
    const browser = Object.assign(new EventTarget(), { indexedDB: memoryIndexedDb() });
    vi.stubGlobal("window", browser);
    const owner = vi.fn(), another = vi.fn(), payloads: unknown[] = [];
    browser.addEventListener("nexusclass:kodland-credentials-changed", event => payloads.push((event as CustomEvent).detail));
    const stop = subscribeKodlandCredentialsChanged("teacher-a", owner);
    const stopAnother = subscribeKodlandCredentialsChanged("teacher-b", another);
    expect(await rememberKodlandCredentials({ username: "private-user", password: "private-password" })).toBe(true);
    expect(payloads).toEqual([{ uid: "teacher-a" }]);
    expect(owner).toHaveBeenCalledTimes(1); expect(another).not.toHaveBeenCalled();
    stop(); stopAnother();
  });

  it("does not reconnect a changed account when a vault save finishes late", async () => {
    const browser = Object.assign(new EventTarget(), { indexedDB: memoryIndexedDb(new Map(), key => {
      if (key === "kodland:teacher-a") auth.currentUser = { uid: "teacher-b" };
    }) });
    vi.stubGlobal("window", browser);
    const listener = vi.fn(); const stop = subscribeKodlandCredentialsChanged("teacher-a", listener);
    expect(await rememberKodlandCredentials({ username: "teacher", password: "secret" })).toBe(false);
    expect(listener).not.toHaveBeenCalled(); stop();
  });
});
