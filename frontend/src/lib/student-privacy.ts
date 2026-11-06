/**
 * Privacy boundary for student records.
 *
 * Student documents intentionally keep only the fields needed by the
 * classroom view and the synchronization workflow.  Provider payloads may
 * still contain richer profile data, but it must not cross this boundary.
 */

const PRIVATE_STUDENT_FIELDS = [
  "email",
  "profile_url",
  "local_note",
  "notes",
  "guardian_name",
  "guardian_relationship",
  "guardian_phone",
  "guardian_email",
  "guardian_note",
  "email_address",
  "guardianName",
  "guardianRelationship",
  "guardianPhone",
  "guardianEmail",
  "guardianNote",
] as const;

const KODLAND_STUDENT_FIELDS = [
  "id",
  "external_id",
  "name",
  "phone",
  "student_phone",
  "status",
  "progress_summary",
  "external_class_id",
  "external_class_name",
  "lesson_credits_remaining",
  "lesson_credits_updated_at",
  "hidden",
  "created_at",
  "updated_at",
] as const;

const MANUAL_STUDENT_FIELDS = [
  "id",
  "name",
  "phone",
  "student_phone",
  "active",
  "created_at",
  "updated_at",
] as const;

const text = (value: unknown) => {
  if (typeof value === "string" || typeof value === "number") return String(value).trim();
  return "";
};

/** Keep the first and last token so the UI never needs a full legal name. */
export function normalizeStudentName(value: unknown): string {
  const parts = text(value).replace(/\s+/g, " ").split(" ").filter(Boolean);
  if (parts.length <= 2) return parts.join(" ");
  return `${parts[0]} ${parts.at(-1)}`;
}

function selectFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const field of fields) {
    if (value[field] !== undefined) safe[field] = value[field];
  }
  safe.name = normalizeStudentName(value.name);
  safe.phone = text(value.phone);
  return safe;
}

/** Firestore/browser representation for a Kodland student. */
export function sanitizeKodlandStudentRecord<T extends Record<string, unknown>>(value: T): T {
  return selectFields(value, KODLAND_STUDENT_FIELDS) as T;
}

/** Firestore/browser representation for a manually created student. */
export function sanitizeManualStudentRecord<T extends Record<string, unknown>>(value: T): T {
  return selectFields(value, MANUAL_STUDENT_FIELDS) as T;
}

/** Used by import/export tests and migration diagnostics. */
export function studentPrivateFieldsPresent(value: Record<string, unknown>): boolean {
  return PRIVATE_STUDENT_FIELDS.some((field) => Object.prototype.hasOwnProperty.call(value, field));
}

export { PRIVATE_STUDENT_FIELDS, KODLAND_STUDENT_FIELDS, MANUAL_STUDENT_FIELDS };
