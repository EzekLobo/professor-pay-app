import { getFirebaseAuth } from "@/lib/firebase";

export type KodlandCredentials = {
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
const credentialId = (userId: string) => `kodland:${userId}`;

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

async function saveInBrowserVault(credentials: KodlandCredentials, userId: string) {
  if (!canUseBrowserVault()) return false;
  try {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await browserEncryptionKey();
    const ciphertext = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      new TextEncoder().encode(JSON.stringify(credentials)),
    );
    await writeVaultValue(credentialId(userId), {
      iv: iv.buffer,
      ciphertext,
    } satisfies EncryptedCredential);
    return true;
  } catch {
    return false;
  }
}

async function loadFromBrowserVault(userId: string): Promise<KodlandCredentials | null> {
  if (!canUseBrowserVault()) return null;
  try {
    const encrypted = await readVaultValue<EncryptedCredential>(credentialId(userId));
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

/** Credentials belong exclusively to the signed-in NexusClass user.
 * Legacy unscoped records and browser password-manager entries are never restored.
 */
export async function rememberKodlandCredentials(
  credentials: KodlandCredentials,
  _form?: HTMLFormElement,
) {
  void _form;
  const userId = getFirebaseAuth().currentUser?.uid;
  const username = credentials.username.trim();
  if (!userId || !username || !credentials.password) return false;
  return saveInBrowserVault({ username, password: credentials.password }, userId);
}

export async function restoreKodlandCredentials() {
  const userId = getFirebaseAuth().currentUser?.uid;
  if (!userId) return null;
  const credentials = await loadFromBrowserVault(userId);
  return getFirebaseAuth().currentUser?.uid === userId ? credentials : null;
}
