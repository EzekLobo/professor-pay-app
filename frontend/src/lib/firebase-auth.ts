import { onAuthStateChanged, signInWithEmailAndPassword, signOut, type User as FirebaseUser } from "firebase/auth";
import type { User } from "@/lib/api";
import { getFirebaseAuth } from "@/lib/firebase";

export function mapFirebaseUser(user: FirebaseUser): User {
  return {
    id: user.uid,
    name: user.displayName || user.email?.split("@")[0] || "Professor",
    email: user.email || "",
  };
}

export async function loginWithFirebase(email: string, password: string): Promise<User> {
  const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
  return mapFirebaseUser(credential.user);
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
