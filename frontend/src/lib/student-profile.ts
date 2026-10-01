export type GuardianContact = {
  name: string;
  relationship: string;
  phone: string;
  email: string;
};

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

const nestedRecords = (value: unknown, depth = 0): Record<string, unknown>[] => {
  if (depth > 2) return [];
  if (Array.isArray(value)) return value.flatMap((item) => nestedRecords(item, depth + 1));
  const item = objectValue(value);
  if (!Object.keys(item).length) return [];
  const nestedKeys = new Set([
    ...guardianContainers,
    "mother", "father", "mom", "dad", "mae", "pai", "stepmother", "stepfather", "parent_1", "parent_2",
  ]);
  return [item, ...Object.entries(item).flatMap(([key, child]) => (
    nestedKeys.has(key) && child && typeof child === "object" ? nestedRecords(child, depth + 1) : []
  ))];
};

const guardianContainers = [
  "parent", "parents", "parent_info", "parentInfo", "parents_info", "parentsInfo", "guardian", "guardians", "guardian_info", "guardianInfo",
  "responsible", "responsibles", "responsible_info", "responsibleInfo", "family", "family_info", "familyInfo", "family_members", "familyMembers", "family_data", "familyData",
  "contact", "contacts", "emergency_contact", "emergencyContact",
];

/**
 * Extracts only safe contact fields from the student profile response.
 * The profile has used both flat parent_* fields and nested family/parent
 * objects, so this deliberately accepts both shapes without retaining payloads.
 */
export function parseGuardianContact(payload: unknown): GuardianContact {
  const detail = objectValue(payload);
  const mainInfo = objectValue(detail.main_info ?? detail.mainInfo);
  const directSources = [mainInfo, detail].filter((source) => Object.keys(source).length > 0);
  const nestedSources = directSources.flatMap((source) => guardianContainers.flatMap((key) => nestedRecords(source[key])));
  const sources = [...nestedSources, ...directSources];

  const name = firstValue(nestedSources, [
    "guardian_name", "guardianName", "parent_full_name", "parentFullName", "parents_full_name", "parentsFullName", "full_parent_name", "fullParentName",
    "parent_name", "parentName", "responsible_full_name", "responsibleFullName", "responsible_name", "responsibleName",
    "full_name", "fullName", "name",
  ]) || firstValue(directSources, [
    "guardian_name", "guardianName", "parent_full_name", "parentFullName", "parents_full_name", "parentsFullName", "full_parent_name", "fullParentName",
    "parent_name", "parentName", "responsible_full_name", "responsibleFullName", "responsible_name", "responsibleName",
  ]);
  const relationship = firstValue(sources, [
    "guardian_relationship", "guardianRelationship", "parent_relationship", "parentRelationship", "responsible_relationship",
    "responsibleRelationship", "relationship", "relation", "kinship", "parent_kinship", "parentKinship", "role",
  ]);
  const explicitPhone = firstValue(sources, [
    "guardian_phone", "guardianPhone", "parent_phone", "parentPhone", "parents_phone", "parentsPhone", "parent_phone_number", "parents_phone_number", "responsible_phone", "responsiblePhone",
    "contact_phone", "contactPhone", "whatsapp", "whatsApp",
  ]);
  const explicitEmail = firstValue(sources, [
    "guardian_email", "guardianEmail", "parent_email", "parentEmail", "parents_email", "parentsEmail", "responsible_email", "responsibleEmail",
    "contact_email", "contactEmail",
  ]);

  // Some profile responses expose parent_full_name alongside generic phone/email.
  // Only use those generic fields when a parent-specific name was found, so the
  // student's own contact is never mistaken for the responsible contact.
  const parentNamedDirectly = firstValue(directSources, [
    "guardian_name", "guardianName", "parent_full_name", "parentFullName", "parents_full_name", "parentsFullName", "full_parent_name", "fullParentName",
    "parent_name", "parentName", "responsible_full_name", "responsibleFullName", "responsible_name", "responsibleName",
  ]);
  const phone = explicitPhone || firstValue(nestedSources, ["phone", "phone_number", "mobile", "mobile_phone"]) || (parentNamedDirectly ? firstValue(directSources, ["phone", "phone_number", "mobile", "mobile_phone"]) : "");
  const email = explicitEmail || firstValue(nestedSources, ["email", "email_address"]) || (parentNamedDirectly ? firstValue(directSources, ["email", "email_address"]) : "");

  return { name, relationship, phone, email };
}
