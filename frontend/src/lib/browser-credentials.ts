type KodlandCredentials = {
  username: string;
  password: string;
};

type EncryptedCredential = {
  iv: ArrayBuffer;
  ciphertext: ArrayBuffer;
};

const databaseName = "aulapay-kodland-credentials";
const storeName = "vault";
const encryptionKeyId = "encryption-key";
const credentialId = "kodland";

function canUseBrowserVault() {
  return (
    typeof window !== "undefined" &&
    "indexedDB" in window &&
    Boolean(globalThis.crypto?.subtle)
  );
}

function openVault() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = window.indexedDB.open(databaseName, 1);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName);
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
    transaction.oncomplete = () => resolve();
  });
}

async function readVaultValue<T>(key: string) {
  const database = await openVault();
  try {
    const transaction = database.transaction(storeName, "readonly");
    return await requestValue<T | undefined>(
      transaction.objectStore(storeName).get(key),
    );
  } finally {
    database.close();
  }
}

async function writeVaultValue(key: string, value: unknown) {
  const database = await openVault();
  try {
    const transaction = database.transaction(storeName, "readwrite");
    transaction.objectStore(storeName).put(value, key);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

async function browserEncryptionKey() {
  const existing = await readVaultValue<CryptoKey>(encryptionKeyId);
  if (existing) return existing;
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  await writeVaultValue(encryptionKeyId, key);
  return key;
}

async function saveInBrowserVault(credentials: KodlandCredentials) {
  if (!canUseBrowserVault()) return false;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await browserEncryptionKey();
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(credentials)),
    );
    await writeVaultValue(credentialId, {
      iv: iv.buffer,
      ciphertext,
    } satisfies EncryptedCredential);
    return true;
  } catch {
    return false;
  }
}

async function loadFromBrowserVault(): Promise<KodlandCredentials | null> {
  if (!canUseBrowserVault()) return null;
  try {
    const encrypted = await readVaultValue<EncryptedCredential>(credentialId);
    if (!encrypted?.iv || !encrypted.ciphertext) return null;
    const key = await browserEncryptionKey();
    const value = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: new Uint8Array(encrypted.iv) },
      key,
      encrypted.ciphertext,
    );
    const parsed = JSON.parse(new TextDecoder().decode(value)) as Partial<KodlandCredentials>;
    if (
      typeof parsed.username !== "string" ||
      !parsed.username ||
      typeof parsed.password !== "string" ||
      !parsed.password
    ) {
      return null;
    }
    return { username: parsed.username, password: parsed.password };
  } catch {
    return null;
  }
}

async function offerPasswordCredential(form: HTMLFormElement) {
  if (typeof window === "undefined" || !navigator.credentials?.store) return;
  const PasswordCredential = (
    window as typeof window & {
      PasswordCredential?: new (form: HTMLFormElement) => Credential;
    }
  ).PasswordCredential;
  if (!PasswordCredential) return;
  try {
    await navigator.credentials.store(new PasswordCredential(form));
  } catch {
    // The local encrypted vault remains available when the browser denies this.
  }
}

async function passwordManagerCredential(): Promise<KodlandCredentials | null> {
  if (typeof window === "undefined" || !navigator.credentials?.get) return null;
  try {
    const credential = await navigator.credentials.get({
      password: true,
      mediation: "optional",
    } as CredentialRequestOptions) as (Credential & {
      id?: string;
      password?: string;
    }) | null;
    if (!credential?.id || !credential.password) return null;
    return { username: credential.id, password: credential.password };
  } catch {
    return null;
  }
}

/**
 * Saves the credential in a local AES-GCM vault backed by IndexedDB. The
 * encryption key is non-extractable and also remains only in this browser.
 * The native password manager is offered as an additional convenience.
 */
export async function rememberKodlandCredentials(form: HTMLFormElement) {
  const values = new FormData(form);
  const username = String(values.get("username") ?? "").trim();
  const password = String(values.get("password") ?? "");
  if (!username || !password) return false;
  const saved = await saveInBrowserVault({ username, password });
  await offerPasswordCredential(form);
  return saved;
}

/**
 * Restores from the app's browser-only encrypted vault first, then falls back
 * to a credential approved in the browser password manager.
 */
export async function restoreKodlandCredentials() {
  return (await loadFromBrowserVault()) ?? (await passwordManagerCredential());
}
