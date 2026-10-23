import { onAuthStateChanged, sendPasswordResetEmail, signInWithEmailAndPassword, signOut, type User as FirebaseUser } from "firebase/auth";
import type { User } from "@/lib/api";
import { getFirebaseAuth } from "@/lib/firebase";
import { isEmailLogin } from "@/lib/login-username";

export function mapFirebaseUser(user: FirebaseUser): User {
  return {
    id: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Professor",
    email: user.email || "",
  };
}

export async function loginWithFirebase(login: string, password: string): Promise<User> {
  const normalized = login.trim().toLowerCase();
  let email = normalized;
  if (!isEmailLogin(normalized)) {
    const response = await fetch("/api/auth/username", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: normalized }),
    });
    const payload = await response.json() as { email?: string };
    if (!response.ok || !payload.email) throw new Error("invalid-login");
    email = payload.email;
  }
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email, password);
  return mapFirebaseUser(credential.user);
}

export function resetFirebasePassword(email: string): Promise<void> {
  return sendPasswordResetEmail(getFirebaseAuth(), email.trim());
}

export async function reauthenticateWithFirebase(password: string): Promise<void> {
  const user = getFirebaseAuth().currentUser;
  if (!user?.email) throw new Error("Sua sessão expirou. Entre novamente para continuar.");
  await signInWithEmailAndPassword(getFirebaseAuth(), user.email, password);
}

export function subscribeToAuth(callback: (user: User | null) => void): () => void {
  return onAuthStateChanged(getFirebaseAuth(), (user) => callback(user ? mapFirebaseUser(user) : null));
}

export function logoutFromFirebase(): Promise<void> {
  return signOut(getFirebaseAuth());
}
