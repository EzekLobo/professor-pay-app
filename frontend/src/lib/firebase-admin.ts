import "server-only";

import { applicationDefault, cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function adminApp() {
  if (getApps().length) return getApps()[0]!;

  const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccount) {
    try {
      return initializeApp({ credential: cert(JSON.parse(serviceAccount)) });
    } catch {
      throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON não contém uma credencial Firebase válida.");
    }
  }

  try {
    return initializeApp({ credential: applicationDefault() });
  } catch {
    throw new Error("Configure uma credencial de servidor do Firebase para habilitar a auditoria.");
  }
}

export const getAdminAuth = () => getAuth(adminApp());
export const getAdminDb = () => getFirestore(adminApp());
