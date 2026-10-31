type Document = Record<string, unknown>;
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([key,item]) => [key,canonical(item)]));
  return value;
};
/** Sync timestamps alone must not rewrite unchanged provider data. Fill a missing creation timestamp once. */
export function kodlandDocumentChanged(previous: Document | undefined, incoming: Document): boolean {
  if (!previous) return true;
  if (incoming.created_at !== undefined && incoming.created_at !== null && (previous.created_at === undefined || previous.created_at === null)) return true;
  const data = (item: Document) => Object.fromEntries(Object.entries(item).filter(([key]) => key !== "created_at" && key !== "updated_at"));
  return JSON.stringify(canonical(data(previous))) !== JSON.stringify(canonical(data(incoming)));
}
