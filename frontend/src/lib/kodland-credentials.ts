import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const credentialsCollection = "private_kodland_credentials";
const algorithm = "aes-256-gcm";

export class KodlandCredentialVaultError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KodlandCredentialVaultError";
  }
}

type KodlandCredentials = {
  username: string;
  password: string;
};

async function credentialsDb() {
  // Keep the Firebase Admin dependency server-only and lazy: this lets the
  // pure Kodland parser tests import the sync route without initializing Admin.
  const { getAdminDb } = await import("@/lib/firebase-admin");
  return getAdminDb();
}

function encryptionKey() {
  const value = process.env.KODLAND_CREDENTIALS_ENCRYPTION_KEY?.trim();
  if (!value) {
    throw new KodlandCredentialVaultError(
      "O salvamento de credenciais ainda não está configurado no servidor.",
    );
  }

  const key = /^[a-f0-9]{64}$/i.test(value)
    ? Buffer.from(value, "hex")
    : Buffer.from(value, "base64");
  if (key.length !== 32) {
    throw new KodlandCredentialVaultError(
      "A chave privada de credenciais do servidor é inválida.",
    );
  }
  return key;
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

function encrypt(credentials: KodlandCredentials) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(credentials), "utf8"),
    cipher.final(),
  ]);
  return `v1.${encode(iv)}.${encode(cipher.getAuthTag())}.${encode(encrypted)}`;
}

function decrypt(ciphertext: string): KodlandCredentials {
  const [version, encodedIv, encodedTag, encodedValue, ...rest] = ciphertext.split(".");
  if (
    version !== "v1" ||
    !encodedIv ||
    !encodedTag ||
    !encodedValue ||
    rest.length
  ) {
    throw new KodlandCredentialVaultError(
      "As credenciais salvas não puderam ser lidas. Informe-as novamente.",
    );
  }
  try {
    const decipher = createDecipheriv(algorithm, encryptionKey(), decode(encodedIv));
    decipher.setAuthTag(decode(encodedTag));
    const value = Buffer.concat([
      decipher.update(decode(encodedValue)),
      decipher.final(),
    ]).toString("utf8");
    const parsed = JSON.parse(value) as Partial<KodlandCredentials>;
    if (
      typeof parsed.username !== "string" ||
      !parsed.username.trim() ||
      typeof parsed.password !== "string" ||
      !parsed.password
    ) {
      throw new Error("Invalid credential shape");
    }
    return { username: parsed.username, password: parsed.password };
  } catch (error) {
    if (error instanceof KodlandCredentialVaultError) throw error;
    throw new KodlandCredentialVaultError(
      "As credenciais salvas não puderam ser lidas. Informe-as novamente.",
    );
  }
}

export async function saveKodlandCredentials(
  userId: string,
  credentials: KodlandCredentials,
) {
  await (await credentialsDb()).collection(credentialsCollection).doc(userId).set({
    ciphertext: encrypt(credentials),
    updated_at: new Date().toISOString(),
  });
}

export async function loadKodlandCredentials(userId: string) {
  const snapshot = await (await credentialsDb())
    .collection(credentialsCollection)
    .doc(userId)
    .get();
  if (!snapshot.exists) return null;
  const ciphertext = snapshot.get("ciphertext");
  if (typeof ciphertext !== "string") {
    throw new KodlandCredentialVaultError(
      "As credenciais salvas não puderam ser lidas. Informe-as novamente.",
    );
  }
  return decrypt(ciphertext);
}
