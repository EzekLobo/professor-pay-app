import { kodlandDocumentChanged } from "./kodland-write-diff";
/** Keep row/array identities when an automatic check changed only sync timestamps. */
export function reuseSyncedRows<T extends { id: string }>(previous: T[], incoming: T[]): T[] {
  const known = new Map(previous.map(item => [item.id, item]));
  const next = incoming.map(item => {
    const old = known.get(item.id);
    return old && !kodlandDocumentChanged(old, item) ? old : item;
  });
  return previous.length === next.length && next.every((item, index) => item === previous[index]) ? previous : next;
}
