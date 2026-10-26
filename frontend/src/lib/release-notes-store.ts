import { doc, getDoc, runTransaction } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { releaseCursor, type ReleaseNotesStore } from "@/lib/release-notes";

const sessionCursors = new Map<string, number>();
const storageKey = (userId: string) => `nexusclass.release-notes.v1.${userId}`;

function readLocal(userId: string) {
  let stored = 0;
  try { stored = releaseCursor(JSON.parse(window.localStorage.getItem(storageKey(userId)) ?? "0")); } catch { /* Browser storage is optional. */ }
  return Math.max(stored, sessionCursors.get(userId) ?? 0);
}

function remember(userId: string, version: number) {
  const seen = Math.max(readLocal(userId), releaseCursor(version));
  sessionCursors.set(userId, seen);
  try { window.localStorage.setItem(storageKey(userId), String(seen)); } catch { /* Keep this session usable without storage. */ }
  return seen;
}

export const localReleaseNotesStore: ReleaseNotesStore = {
  load: async (userId) => readLocal(userId),
  markSeen: async (userId, version) => { remember(userId, version); },
};

function progressRef(userId: string) {
  if (getFirebaseAuth().currentUser?.uid !== userId) throw new Error("A conta foi alterada.");
  return doc(getFirebaseDb(), "users", userId, "ui_state", "release_notes");
}

async function persist(userId: string, version: number) {
  const reference = progressRef(userId);
  await runTransaction(getFirebaseDb(), async (transaction) => {
    const snapshot = await transaction.get(reference);
    const remote = releaseCursor(snapshot.data()?.seen_version);
    if (version > remote) transaction.set(reference, { seen_version: version, seen_at: new Date().toISOString() }, { merge: true });
  });
}

export const releaseNotesStore: ReleaseNotesStore = {
  load: async (userId) => {
    const local = readLocal(userId);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      // A slow/offline Firestore connection must not hold back the application.
      const snapshot = await Promise.race([
        getDoc(progressRef(userId)),
        new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 2000); }),
      ]);
      const remote = releaseCursor(snapshot?.data()?.seen_version);
      const seen = remember(userId, Math.max(local, remote));
      if (local > remote) void persist(userId, local).catch(() => undefined);
      return seen;
    } catch { return local; }
    finally { clearTimeout(timer); }
  },
  markSeen: async (userId, version) => {
    const seen = remember(userId, version);
    // The browser copy preserves acknowledgement if the network is unavailable.
    await persist(userId, seen).catch(() => undefined);
  },
};
