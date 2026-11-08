import type { KodlandStudent } from "./api";
import { isActiveKodlandStudent } from "./student-ranking";

export type ProfileAttempt = { at: number; failed?: boolean };
export function incompleteProfileIds(students: readonly KodlandStudent[], attempts: Record<string, ProfileAttempt>, now: number): string[] {
  return [...new Set(students.filter(student => {
    if (student.hidden || !isActiveKodlandStudent(student.status) || !student.external_id) return false;
    const creditsAt = Date.parse(student.lesson_credits_updated_at ?? "");
    const incomplete = !student.name?.trim() || !/^\d{10,15}$/.test(String(student.phone ?? "").replace(/\D/g, "")) || typeof student.lesson_credits_remaining !== "number";
    const staleCredits = !Number.isFinite(creditsAt) || now - creditsAt >= 24 * 3600000;
    const previous = attempts[student.external_id];
    return (incomplete || staleCredits) && (!previous || now - previous.at >= (previous.failed ? 30 * 60000 : 6 * 3600000));
  }).map(student => student.external_id))];
}

/** Per-account attempt budget survives reloads. No contact details are stored here. */
export async function refreshIncompleteProfiles(uid: string, students: readonly KodlandStudent[], sync: (ids: string[]) => Promise<unknown>, owner: () => boolean) {
  const key = `nexusclass.profile-attempts.${uid}`;
  let attempts: Record<string, ProfileAttempt> = {};
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(key) ?? "{}");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      attempts = Object.fromEntries(Object.entries(parsed).filter(([, value]) => value && typeof value.at === "number" && Number.isFinite(value.at)));
    }
  } catch { /* Optional attempt cache. */ }
  const save = () => { if (owner()) try { localStorage.setItem(key, JSON.stringify(attempts)); } catch {} };
  const ids = incompleteProfileIds(students, attempts, Date.now());
  for (let index = 0; index < ids.length; index += 20) {
    if (!owner()) return;
    const batch = ids.slice(index, index + 20);
    batch.forEach(id => { attempts[id] = { at: Date.now() }; }); save();
    try { await sync(batch); }
    catch (error) { batch.forEach(id => { attempts[id] = { at: Date.now(), failed: true }; }); save(); throw error; }
  }
}
