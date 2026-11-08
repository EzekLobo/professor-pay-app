import { kodlandDocumentChanged } from "./kodland-write-diff";
type Row = { id: string } & Record<string, unknown>;
export function syncedCollectionsChanged(before: Record<string, Row[]>, after: Record<string, Row[]>): boolean {
  for (const name of new Set([...Object.keys(before), ...Object.keys(after)])) {
    const old = before[name] ?? [], current = after[name] ?? [];
    if (old.length !== current.length) return true;
    const known = new Map(old.map(item => [item.id, item]));
    if (current.some(item => kodlandDocumentChanged(known.get(item.id), item))) return true;
  }
  return false;
}
