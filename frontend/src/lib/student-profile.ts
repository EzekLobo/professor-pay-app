import { normalizeStudentName } from "./student-privacy";

export function parseStudentContact(payload: unknown) {
  const detail = objectValue(payload);
  const main = objectValue(detail.main_info ?? detail.mainInfo);
  const student = objectValue(main.student ?? detail.student);
  const sources = [student, main, detail];
  return {
    name: normalizeStudentName(firstValue(sources, ["full_name", "fullName", "name"])),
    phone: firstValue(sources, ["phone", "phone_number", "mobile"]),
  };
}

const objectValue = (value: unknown): Record<string, unknown> => (
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}
);

const stringValue = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
};

const firstValue = (sources: Record<string, unknown>[], keys: string[]) => {
  for (const source of sources) {
    for (const key of keys) {
      const value = stringValue(source[key]);
      if (value) return value;
    }
  }
  return "";
};

/** Balance endpoint returns lesson-type rows; money and other wallet types are unrelated. */
export function parseStudentLessonCredits(payload: unknown): number | null {
  if (!Array.isArray(payload)) return null;
  const wallet = payload.find(value => objectValue(value).lesson_type === "DEFAULT_LESSON");
  const balance = objectValue(wallet).balance;
  if (typeof balance === "number") return Number.isFinite(balance) ? balance : null;
  if (typeof balance !== "string" || !/^-?\d+(?:\.\d+)?$/.test(balance.trim())) return null;
  const parsed = Number(balance.trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/** Omitted fields in essential syncs must not erase a previously read profile balance. */
export function studentLessonCreditsPatch(incoming: unknown, previous: unknown = {}) {
  const item = objectValue(incoming);
  const value = item.lesson_credits_remaining;
  const source = typeof value === "number" && Number.isFinite(value) ? item : objectValue(previous);
  if (typeof source.lesson_credits_remaining !== "number" || !Number.isFinite(source.lesson_credits_remaining)) return {};
  return { lesson_credits_remaining: source.lesson_credits_remaining, ...(typeof source.lesson_credits_updated_at === "string" ? { lesson_credits_updated_at: source.lesson_credits_updated_at } : {}) };
}
