import type { KodlandAttendance, KodlandGroup, KodlandStudent } from "./api";
import type { KodlandLesson } from "./kodland-lessons";
import { lessonForAttendance } from "./attendance-schedule";
import { notificationLocalInstant } from "./student-notification-rules";
import { isActiveKodlandStudent } from "./student-ranking";

export const ACTIVITY_SYNC_INTERVAL = 6 * 60 * 60000;
export type AutomaticTaskState = { attempts: number; at: string; complete: boolean };
export type AutomaticTask = { id: string; kind: "daily" | "classroom" | "attendance"; groupId?: string; lesson?: KodlandLesson; students?: string[] };
const zone = "America/Sao_Paulo";
const day = (time: number) => new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(time);

/** Decisions use the real dated calendar, never an assumed weekly recurrence. */
export function automaticTasks(now: number, groups: KodlandGroup[], lessons: KodlandLesson[], students: KodlandStudent[], states: Record<string, AutomaticTaskState>, scheduleUpdatedAt: string | null): AutomaticTask[] {
  const tasks: AutomaticTask[] = [];
  const today = day(now);
  const dailyId = `daily:${today}`;
  const dailyAt = Math.max(Date.parse(scheduleUpdatedAt ?? "") || 0, Date.parse(states[dailyId]?.complete ? states[dailyId].at : "") || 0);
  if (groups.length && (!dailyAt || day(dailyAt) !== today) && (states[dailyId]?.attempts ?? 0) < 2) tasks.push({ id: dailyId, kind: "daily" });
  const active = new Set(groups.filter(group => !group.archived).map(group => group.external_id));
  for (const lesson of lessons) {
    if (!active.has(lesson.external_class_id) || /cancel|reschedul/i.test(lesson.status)) continue;
    const start = Date.parse(notificationLocalInstant(lesson.lesson_date, lesson.start_time?.slice(0, 5) ?? "", zone) ?? "");
    let end = Date.parse(notificationLocalInstant(lesson.lesson_date, lesson.end_time?.slice(0, 5) ?? "", zone) ?? "");
    if (!Number.isFinite(start)) continue;
    const occurrence = `${lesson.external_class_id}:${lesson.id}:${lesson.lesson_date}`;
    const classroomId = `classroom:${occurrence}`;
    if (now >= start - 15 * 60000 && now < start && !states[classroomId]?.complete && (states[classroomId]?.attempts ?? 0) < 2) tasks.push({ id: classroomId, kind: "classroom", groupId: lesson.external_class_id });
    if (!Number.isFinite(end) || end === start) continue;
    if (end < start) end += 86400000;
    const attendanceId = `attendance:${occurrence}`;
    const state = states[attendanceId];
    // At most two attempts per occurrence, including transport failures. Late opening catches up for 24h.
    if (now < end + 30 * 60000 || now > end + 86400000 || state?.complete || (state?.attempts ?? 0) >= 2) continue;
    if (state?.attempts && (now < end + 60 * 60000 || now - Date.parse(state.at) < 30 * 60000)) continue;
    const ids = students.filter(student => student.external_class_id === lesson.external_class_id && !student.hidden && isActiveKodlandStudent(student.status)).map(student => student.external_id);
    if (ids.length) tasks.push({ id: attendanceId, kind: "attendance", groupId: lesson.external_class_id, lesson, students: [...new Set(ids)] });
  }
  return [...new Map(tasks.map(task => [task.id, task])).values()];
}

export function attendanceConfirmed(lesson: KodlandLesson, studentIds: string[], records: KodlandAttendance[]): boolean {
  if (!studentIds.length) return false;
  return studentIds.every(id => records.some(record => record.external_class_id === lesson.external_class_id && record.external_student_id === id && ["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(record.status) && lessonForAttendance({ ...record, lesson_title: record.lesson_title ?? "" }, [lesson])?.id === lesson.id));
}
