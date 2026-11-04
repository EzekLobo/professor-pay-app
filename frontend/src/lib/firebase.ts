import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, initializeFirestore, type Firestore } from "firebase/firestore";
const config = { apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY, authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN, projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID, appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID, measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID };
function getFirebaseApp(): FirebaseApp { const missing = Object.entries(config).filter(([key, value]) => key !== "measurementId" && !value).map(([key]) => key); if (missing.length > 0) throw new Error(`Firebase não configurado. Variáveis ausentes: ${missing.join(", ")}`); return getApps().length > 0 ? getApp() : initializeApp(config); }
export function getFirebaseAuth(): Auth { return getAuth(getFirebaseApp()); }
let browserDb: Firestore | undefined;
export function getFirebaseDb(): Firestore {
  const app = getFirebaseApp();
  if (typeof window === "undefined") return getFirestore(app);
  // Some mobile proxies buffer WebChannel streams indefinitely. Use bounded
  // long-poll responses instead of relying on streaming auto-detection.
  browserDb ??= initializeFirestore(app, {
    experimentalForceLongPolling: true,
    experimentalAutoDetectLongPolling: false,
    experimentalLongPollingOptions: { timeoutSeconds: 15 },
  });
  return browserDb;
}
