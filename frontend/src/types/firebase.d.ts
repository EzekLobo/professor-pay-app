declare module "firebase/app" {
  export type FirebaseApp = unknown;
  export function getApp(): FirebaseApp;
  export function getApps(): FirebaseApp[];
  export function initializeApp(config: Record<string, string | undefined>): FirebaseApp;
  export class FirebaseError extends Error { readonly code: string; }
}
declare module "firebase/auth" {
  export type Auth = { currentUser: User | null };
  export type User = { uid: string; displayName: string | null; email: string | null };
  export function getAuth(app: unknown): Auth;
  export function createUserWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<{ user: User }>;
  export function signInWithEmailAndPassword(auth: Auth, email: string, password: string): Promise<{ user: User }>;
  export function updateProfile(user: User, profile: { displayName: string }): Promise<void>;
  export function onAuthStateChanged(auth: Auth, callback: (user: User | null) => void): () => void;
  export function signOut(auth: Auth): Promise<void>;
}
declare module "firebase/firestore" {
  export type Firestore = unknown;
  export type DocumentData = Record<string, unknown>;
  export type DocumentReference = { id: string };
  export type Query = unknown;
  export type QuerySnapshot = { docs: Array<{ id: string; data(): DocumentData }> };
  export function getFirestore(app: unknown): Firestore;
  export function collection(...args: unknown[]): unknown;
  export function doc(...args: unknown[]): DocumentReference;
  export function getDocs(query: unknown): Promise<QuerySnapshot>;
  export function getDoc(ref: unknown): Promise<{ exists(): boolean; id: string; data(): DocumentData | undefined }>;
  export function setDoc(ref: unknown, data: DocumentData): Promise<void>;
  export function updateDoc(ref: unknown, data: DocumentData): Promise<void>;
  export function deleteDoc(ref: unknown): Promise<void>;
  export function writeBatch(db: unknown): { set(ref: unknown, data: DocumentData): unknown; update(ref: unknown, data: DocumentData): unknown; delete(ref: unknown): unknown; commit(): Promise<void> };
  export function query(...args: unknown[]): Query;
  export function where(...args: unknown[]): unknown;
  export function orderBy(...args: unknown[]): unknown;
  export function limit(...args: unknown[]): unknown;
}
