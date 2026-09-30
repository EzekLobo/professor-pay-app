import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword, signOut, updateProfile, type User as FirebaseUser } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase"; import type { User } from "@/lib/api";
export function mapFirebaseUser(user: FirebaseUser): User { return { id: user.uid, name: user.displayName || user.email?.split("@")[0] || "Professor", email: user.email || "" }; }
export async function registerWithFirebase(name: string, email: string, password: string): Promise<User> { const credential = await createUserWithEmailAndPassword(getFirebaseAuth(), email.trim(), password); await updateProfile(credential.user, { displayName: name.trim() }); return mapFirebaseUser(credential.user); }
export async function loginWithFirebase(email: string, password: string): Promise<User> { const credential = await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password); return mapFirebaseUser(credential.user); }
export function subscribeToAuth(callback: (user: User | null) => void): () => void { return onAuthStateChanged(getFirebaseAuth(), (user) => callback(user ? mapFirebaseUser(user) : null)); }
export function logoutFromFirebase(): Promise<void> { return signOut(getFirebaseAuth()); }
