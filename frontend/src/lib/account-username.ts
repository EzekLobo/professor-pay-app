import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { validLoginUsername } from "@/lib/login-username";
import { RequestAuthError } from "@/lib/server-auth";

export async function getAccountUsername(userId: string) {
  const [account, user] = await Promise.all([
    getAdminDb().collection("login_accounts").doc(userId).get(),
    getAdminAuth().getUser(userId),
  ]);
  const value = account.exists ? account.data()?.username : user.customClaims?.username;
  return typeof value === "string" ? validLoginUsername(value) : "";
}

export async function setAccountUsername(userId: string, value: unknown) {
  const username = validLoginUsername(typeof value === "string" ? value : "");
  if (!username) throw new RequestAuthError(400, "Use de 3 a 30 caracteres: letras, números, ponto, hífen ou sublinhado.");
  const user = await getAdminAuth().getUser(userId);
  if (!user.email) throw new RequestAuthError(400, "Sua conta precisa ter um e-mail para usar um nick.");
  const db = getAdminDb();
  const accountRef = db.collection("login_accounts").doc(userId);
  const usernameRef = db.collection("login_usernames").doc(username);
  await db.runTransaction(async (transaction) => {
    const account = await transaction.get(accountRef);
    const previous = account.exists ? account.data()?.username : user.customClaims?.username;
    const oldUsername = typeof previous === "string" ? validLoginUsername(previous) : "";
    const reserved = await transaction.get(usernameRef);
    if (reserved.exists && reserved.data()?.uid !== userId) throw new RequestAuthError(409, "Este nick já está em uso. Escolha outro.");
    const oldRef = oldUsername && oldUsername !== username ? db.collection("login_usernames").doc(oldUsername) : null;
    const old = oldRef ? await transaction.get(oldRef) : null;
    transaction.set(usernameRef, { uid: userId, email: user.email, username, updated_at: FieldValue.serverTimestamp() });
    transaction.set(accountRef, { username, updated_at: FieldValue.serverTimestamp() });
    if (oldRef && old?.data()?.uid === userId) transaction.delete(oldRef);
  });
  return username;
}

/** Remove only entries owned by this account, including legacy custom claims. */
export async function removeAccountUsernames(userId: string, legacyUsername: string) {
  const db = getAdminDb();
  const accountRef = db.collection("login_accounts").doc(userId);
  await db.runTransaction(async (transaction) => {
    const account = await transaction.get(accountRef);
    const names = [...new Set([account.data()?.username, legacyUsername].filter((name): name is string => typeof name === "string" && Boolean(validLoginUsername(name))).map(validLoginUsername))];
    const entries = await Promise.all(names.map(async (name) => {
      const ref = db.collection("login_usernames").doc(name);
      return { ref, snapshot: await transaction.get(ref) };
    }));
    for (const { ref, snapshot } of entries) if (snapshot.data()?.uid === userId) transaction.delete(ref);
    if (account.exists) transaction.delete(accountRef);
  });
}
