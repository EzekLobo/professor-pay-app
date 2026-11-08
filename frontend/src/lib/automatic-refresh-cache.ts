import type { KodlandLesson } from "./kodland-lessons";
import type { KodlandTaskProgress } from "./kodland-task-progress";
const memory = new Map<string, number>();
export function refreshStamp(uid: string, key: string): number {
  const id = `nexusclass.refresh.${uid}.${key}`;
  try { const raw = localStorage.getItem(id); if (raw) { const at = Number(raw); if (Number.isFinite(at) && at > 0) return at; } } catch {}
  return memory.get(id) ?? 0;
}
export function refreshDue(uid: string, key: string, ttl: number, now = Date.now()): boolean {
  const at = refreshStamp(uid, key);
  return !at || at > now || now - at >= ttl;
}
export function markRefreshed(uid: string, key: string, at = Date.now()): void {
  const id = `nexusclass.refresh.${uid}.${key}`; memory.set(id, at);
  try { localStorage.setItem(id, String(at)); } catch {}
}
export type ActivityWindow = { known: string[]; refresh: string[] };
export function activityWindow(groupId: string, lessons: readonly KodlandLesson[], progress: readonly KodlandTaskProgress[], today: string): ActivityWindow | undefined {
  const group = progress.filter(item => item.external_class_id === groupId);
  const known = [...new Set(group.map(item => item.lesson_id).filter(id => /^[\w-]+$/.test(id)))];
  if (!known.length) return undefined; // No trustworthy baseline: hydrate once in full.
  const recent = lessons.filter(item => item.external_class_id === groupId && item.lesson_date.slice(0, 10) <= today && item.source_lesson_id).sort((a, b) => b.lesson_date.localeCompare(a.lesson_date) || b.lesson_number - a.lesson_number).slice(0, 4).map(item => item.source_lesson_id!);
  if (!recent.length) return undefined;
  return { known, refresh: [...new Set([...recent, ...group.filter(item => item.state === "submitted" && /^[\w-]+$/.test(item.lesson_id)).map(item => item.lesson_id)])] };
}
/** A partial response is authoritative only for the lessons it actually checked. */
export function activityRowInScope(row: Record<string, unknown>, groups: ReadonlySet<string>, windows?: Record<string, string[]>): boolean {
  const id = String(row.external_class_id);
  return groups.has(id) && (!windows || !Object.hasOwn(windows, id) || windows[id].includes(String(row.lesson_id)));
}

export function resetAutomaticRefreshCache(): void { memory.clear(); }
