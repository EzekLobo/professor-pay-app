import { doc, getDoc, setDoc } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase";

export type TutorialProgress = {
  version: number;
  completed_at: string;
};

export function isTutorialVersionCompleted(progress: Pick<TutorialProgress, "version"> | null, version: number): boolean {
  return (progress?.version ?? 0) >= version;
}

function tutorialProgressRef(userId: string, tutorialId: string) {
  return doc(getFirebaseDb(), "users", userId, "tutorials", tutorialId);
}

export async function getTutorialProgress(userId: string, tutorialId: string): Promise<TutorialProgress | null> {
  const snapshot = await getDoc(tutorialProgressRef(userId, tutorialId));
  if (!snapshot.exists()) return null;
  const data = snapshot.data();
  if (typeof data?.version !== "number" || typeof data.completed_at !== "string") return null;
  return { version: data.version, completed_at: data.completed_at };
}

export async function completeTutorial(userId: string, tutorialId: string, version: number): Promise<void> {
  await setDoc(tutorialProgressRef(userId, tutorialId), {
    version,
    completed_at: new Date().toISOString(),
  });
}
