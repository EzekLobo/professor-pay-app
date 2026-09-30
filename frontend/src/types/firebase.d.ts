declare module "firebase/app" {
  export type FirebaseApp = unknown;
  export function getApp(): FirebaseApp;
  export function getApps(): FirebaseApp[];
  export function initializeApp(config: Record<string, string | undefined>): FirebaseApp;
  export class FirebaseError extends Error { readonly code: string; }
}
declare module "firebase/auth" {
  export type Auth = unknown;
  export type User = { uid: string; displayName: string | null; email: string | null };
  export function getAuth(app: unknown): Auth;
  export function createUserWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<{ user: User }>;
  export function signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<{ user: User }>;
  export function updateProfile(user: User, profile: { displayName: string }): Promise<void>;
  export function onAuthStateChanged(auth: Auth, callback: (user: User | null) => void): () => void;
  export function signOut(auth: Auth): Promise<void>;
}
declare module "firebase/firestore" { export type Firestore = unknown; export function getFirestore(app: unknown): Firestore; }
