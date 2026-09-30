import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
const config = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID, measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID };
function getFirebaseApp(): FirebaseApp { const missing = Object.entries(config).filter(([key, value]) => key !== "measurementId" && !value).map(([key]) => key); if (missing.length > 0) throw new Error(`Firebase não configurado. Variáveis ausentes: ${missing.join(", ")}`); return getApps().length > 0 ? getApp() : initializeApp(config); }
export function getFirebaseAuth(): Auth { return getAuth(getFirebaseApp()); }
export function getFirebaseDb(): Firestore { return getFirestore(getFirebaseApp()); }
