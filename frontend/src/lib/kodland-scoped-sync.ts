import type { SyncDataDomain } from "./sync-events";
import type { KodlandAttendance, KodlandExtraLesson, KodlandReview } from "./api";
import type { KodlandTaskProgress } from "./kodland-task-progress";
import { occurrenceKey, occurrenceTimes, type SyncOccurrence } from "./sync-policy";

export type KodlandScopedOccurrence = {
  kind: "lesson" | "extra"; id: string; group_id: string; source_lesson_id: string;
  lesson_date: string; start_time: string; end_time: string;
  booking_id?: string; external_student_id?: string;
};
export type KodlandScopedRequest = {
  scope: "activities" | "ranking" | "attendance" | "extras_discovery" | "extra_final_check" | "recordings" | "call_link";
  group_ids?: string[]; occurrence?: KodlandScopedOccurrence;
  week_date?: string; known_extra_ids?: string[]; time_zone?: string;
};
export type KodlandScopedResult = {
  scope: KodlandScopedRequest["scope"]; complete: boolean; updated: number;
  occurrence_key?: string; domains?: SyncDataDomain[]; ranking_complete?: boolean; recording_url?: string; call_url?: string; final_completed?: boolean;
};
export type KodlandScopedPayload = {
  scoped: KodlandScopedResult;
  reviews?: KodlandReview[]; task_progress?: KodlandTaskProgress[];
  attendance?: KodlandAttendance[]; extra_lessons?: KodlandExtraLesson[];
  ranking?: Array<{ id: string; external_class_id: string; progress_summary: string }>;
  review_group_ids?: string[];
};
export function scopedOccurrence(item: KodlandScopedOccurrence): SyncOccurrence {
  return { id: item.id, date: item.lesson_date, startTime: item.start_time, endTime: item.end_time };
}
export function scopedOccurrenceKey(item: KodlandScopedOccurrence, timeZone?: string): string { return occurrenceKey(scopedOccurrence(item), timeZone); }
export function classroomUrl(sessionId: unknown): string {
  if ((typeof sessionId !== "string" && typeof sessionId !== "number") || !/^[A-Za-z0-9_-]{1,160}$/.test(String(sessionId))) return "";
  return "https://learn.kodland.org/pt/class-room?" + new URLSearchParams({ sessionId: String(sessionId) });
}
export function validClassroomUrl(value: unknown): value is string {
  if (typeof value !== "string") return false;
  try { const url = new URL(value); return url.origin === "https://learn.kodland.org" && /^\/(?:[a-z]{2}\/)?class-room\/?$/.test(url.pathname) && !!classroomUrl(url.searchParams.get("sessionId")) && !url.username && !url.password; } catch { return false; }
}
/** Nearest can refer to the next lesson: require both lesson and exact scheduled instants. */
export function callFromNearest(payload: unknown, item: KodlandScopedOccurrence, now: number, timeZone?: string): string {
  if (!payload || typeof payload !== "object") return "";
  const row = payload as Record<string, unknown>, times = occurrenceTimes(scopedOccurrence(item), timeZone);
  const start = Date.parse(String(row.session_start_time ?? "")), end = Date.parse(String(row.session_end_time ?? ""));
  if (!times || String(row.lesson_id ?? "") !== item.source_lesson_id || start !== times.start || end < times.end || now < start - 15 * 60_000 || now >= end) return "";
  return classroomUrl(row.session_id);
}
/** Unknown or absent outcomes must never close a final extra check. */
export function extraReportOutcome(payload: unknown): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  const outcome = String((payload as Record<string, unknown>).outcome ?? "").toLowerCase();
  if (outcome === "completed") return true;
  if (["cancelled"].includes(outcome)) return false;
  return null;
}
