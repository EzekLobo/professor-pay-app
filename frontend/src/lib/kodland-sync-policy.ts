import { kodlandNotificationCalendar } from "./kodland-notification-calendar";
import type { KodlandAttendance, KodlandExtraLesson, KodlandGroup, KodlandStudent } from "./api";
import type { KodlandLesson } from "./kodland-lessons";
import type { KodlandScopedOccurrence } from "./kodland-scoped-sync";
import { addCalendarDays, calendarDay, occurrenceKey, occurrenceTimes, weekBounds, type SyncOccurrence } from "./sync-policy";
import { lessonForAttendance } from "./attendance-schedule";
import { notificationLessonEnd } from "./student-notification-rules";
import { isActiveKodlandStudent } from "./student-ranking";
import { validClassroomUrl } from "./kodland-scoped-sync";

export const ACTIVITY_SYNC_INTERVAL = 6 * 60 * 60000;
export type AutomaticTaskState = { attempts: number; at: string; complete: boolean };
type OccurrenceTask = {
  id: string;
  kind: "classroom" | "attendance" | "extra_final_check" | "recordings";
  occurrence: KodlandScopedOccurrence;
  groupId: string;
  lesson?: KodlandLesson;
  extra?: KodlandExtraLesson;
  students?: string[];
};
export type AutomaticTask = OccurrenceTask | {
  id: string;
  kind: "extras_discovery";
  weekDate: string;
  knownExtraIds: string[];
};
const zone = "America/Sao_Paulo";
const MINUTE = 60000;
const DAY = 86400000;
const day = (time: number) => calendarDay(time, zone);
const safeTime = (value: string | undefined) => /^\d{2}:\d{2}/.test(value ?? "") ? value!.slice(0, 5) : "";
const cancelled = (status: string) => /cancel|reschedul|substitution|replacement/i.test(status);
const occurrence = (item: KodlandLesson | KodlandExtraLesson, kind: "lesson" | "extra"): KodlandScopedOccurrence => ({
  kind,
  id: item.id,
  group_id: item.external_class_id,
  source_lesson_id: kind === "lesson" ? (item as KodlandLesson).source_lesson_id || item.id : item.id,
  lesson_date: String(item.lesson_date ?? "").slice(0, 10),
  start_time: safeTime(item.start_time),
  end_time: safeTime(item.end_time),
  ...(kind === "extra" ? { booking_id: (item as KodlandExtraLesson).recording_booking_id, external_student_id: (item as KodlandExtraLesson).external_student_id } : {}),
});
const policyOccurrence = (item: KodlandLesson | KodlandExtraLesson, kind: "lesson" | "extra"): SyncOccurrence => {
  const key = occurrence(item, kind);
  return {
    id: key.id,
    date: key.lesson_date,
    startTime: key.start_time,
    endTime: key.end_time,
    cancelled: cancelled(item.status),
    taught: kind === "extra" && ((item as KodlandExtraLesson).completed || ["DONE", "ACCOUNTED"].includes((item as KodlandExtraLesson).manual_status ?? "")),
    recordingUrl: item.recording_url,
    callUrl: item.call_occurrence_key === occurrenceKey({ id: key.id, date: key.lesson_date, startTime: key.start_time, endTime: key.end_time }, zone) && validClassroomUrl(item.call_url) ? item.call_url : undefined,
  };
};

export function latestKodlandLessons(lessons: KodlandLesson[], now: number, classrooms: KodlandGroup[] = []) {
  const groups = new Map<string, KodlandLesson>();
  for (const lesson of lessons) {
    if (cancelled(lesson.status)) continue;
    const calendar = kodlandNotificationCalendar({ lesson_date: "" }, lesson, lessons, classrooms.find(group => group.external_id === lesson.external_class_id), zone);
    const end = Date.parse(calendar.endedAt ?? "");
    if (!Number.isFinite(end) || end > now) continue;
    const previous = groups.get(lesson.external_class_id);
    if (!previous || end > Date.parse(notificationLessonEnd(previous.lesson_date?.slice(0, 10), previous.start_time, previous.end_time, zone) ?? "")) groups.set(lesson.external_class_id, { ...lesson, lesson_date: calendar.date, start_time: calendar.start, end_time: calendar.end });
  }
  return [...groups.values()];
}

/** Decisions use dated occurrences and run only the scopes that have an automatic cadence. */
export function automaticTasks(
  now: number,
  groups: KodlandGroup[],
  lessons: KodlandLesson[],
  students: KodlandStudent[],
  states: Record<string, AutomaticTaskState>,
  _scheduleUpdatedAt: string | null,
  extras: KodlandExtraLesson[] = [],
  agendaEntry = false,
  agendaActive = agendaEntry,
  recordingAttemptsThisVisit: ReadonlySet<string> = new Set(),
): AutomaticTask[] {
  const tasks: AutomaticTask[] = [];
  const today = day(now);
  const week = weekBounds(now, zone);
  const active = new Set(groups.filter(group => !group.archived).map(group => group.external_id));
  const recordings = [
    ...lessons.map(item => ({ item, kind: "lesson" as const })),
    ...extras.map(item => ({ item, kind: "extra" as const })),
  ];

  // Discover additions only when the teacher enters the Agenda, and only for this week.
  if (agendaEntry) {
    const id = `extras_discovery:${week.start}`;
    const lastAttempt = Date.parse(states[id]?.at ?? "");
    if (!Number.isFinite(lastAttempt) || now - lastAttempt >= 5 * MINUTE) {
      tasks.push({ id, kind: "extras_discovery", weekDate: today, knownExtraIds: extras.map(item => item.id) });
    }
  }

  for (const lesson of lessons) {
    if (!active.has(lesson.external_class_id) || cancelled(lesson.status)) continue;
    const item = policyOccurrence(lesson, "lesson");
    const key = occurrence(lesson, "lesson");
    const times = occurrenceTimes(item, zone);
    if (!times) continue;
    const occurrenceId = `${lesson.external_class_id}:${lesson.id}:${key.lesson_date}:${key.start_time}:${key.end_time}`;
    const classroomId = `classroom:${occurrenceId}`;
    const classroomState = states[classroomId];
    if (!item.callUrl && now >= times.start - 15 * MINUTE && now < times.end &&
      (!classroomState || !Number.isFinite(Date.parse(classroomState.at)) || now - Date.parse(classroomState.at) >= 5 * MINUTE) && !classroomState?.complete) {
      tasks.push({ id: classroomId, kind: "classroom", occurrence: key, groupId: lesson.external_class_id, lesson });
    }
    const attendanceId = `attendance:${occurrenceId}`;
    const attendanceState = states[attendanceId];
    if (now >= times.end + 60 * MINUTE && now <= times.end + DAY && !attendanceState?.complete && (attendanceState?.attempts ?? 0) < 1) {
      const ids = students.filter(student => student.external_class_id === lesson.external_class_id && !student.hidden && isActiveKodlandStudent(student.status)).map(student => student.external_id);
      if (ids.length) tasks.push({ id: attendanceId, kind: "attendance", occurrence: key, groupId: lesson.external_class_id, lesson, students: [...new Set(ids)] });
    }
  }

  for (const extra of extras) {
    if (!active.has(extra.external_class_id) || cancelled(extra.status)) continue;
    const item = policyOccurrence(extra, "extra");
    const key = occurrence(extra, "extra");
    const times = occurrenceTimes(item, zone);
    if (!times) continue;
    const occurrenceId = `${extra.external_class_id}:${extra.id}:${key.lesson_date}:${key.start_time}:${key.end_time}`;
    const finalId = `extra_final_check:${occurrenceId}`;
    const finalState = states[finalId];
    const dayAfter = addCalendarDays(key.lesson_date, 1);
    const recentOrTracked = now - times.end <= 7 * DAY || (finalState?.attempts ?? 0) > 0;
    if (!item.taught && !extra.final_checked_at && today >= dayAfter && recentOrTracked && !finalState?.complete && (finalState?.attempts ?? 0) < 2 &&
      (!finalState || !Number.isFinite(Date.parse(finalState.at)) || now - Date.parse(finalState.at) >= 30 * MINUTE)) {
      tasks.push({ id: finalId, kind: "extra_final_check", occurrence: key, groupId: extra.external_class_id, extra });
    }
    const classroomId = `classroom:${occurrenceId}`;
    const classroomState = states[classroomId];
    if (!item.callUrl && now >= times.start - 15 * MINUTE && now < times.end &&
      (!classroomState || !Number.isFinite(Date.parse(classroomState.at)) || now - Date.parse(classroomState.at) >= 5 * MINUTE) && !classroomState?.complete) {
      tasks.push({ id: classroomId, kind: "classroom", occurrence: key, groupId: extra.external_class_id, extra });
    }
  }

  // Recording lookups are made once per Agenda visit, at most every 30 minutes,
  // and only for recent occurrences or already-tracked unresolved lookups.
  if (agendaActive) for (const { item: row, kind } of recordings) {
    if (!active.has(row.external_class_id) || cancelled(row.status) || row.recording_url) continue;
    const key = occurrence(row, kind);
    const policy = policyOccurrence(row, kind);
    const times = occurrenceTimes(policy, zone);
    if (!times || now < times.end) continue;
    const stateId = `recordings:${occurrenceKey(policy, zone)}`;
    const state = states[stateId];
    const recent = now - times.end <= 7 * DAY;
    const tracked = Boolean(state && !state.complete);
    if ((!recent && !tracked) || state?.complete || recordingAttemptsThisVisit.has(stateId)) continue;
    if (state?.at && Number.isFinite(Date.parse(state.at)) && now - Date.parse(state.at) < 30 * MINUTE) continue;
    tasks.push({ id: stateId, kind: "recordings", occurrence: key, groupId: row.external_class_id, ...(kind === "lesson" ? { lesson: row as KodlandLesson } : { extra: row as KodlandExtraLesson }) });
  }

  const priority: Record<AutomaticTask["kind"], number> = { classroom: 0, attendance: 1, extra_final_check: 2, extras_discovery: 3, recordings: 4 };
  return [...new Map(tasks.map(task => [task.id, task])).values()].sort((left, right) => priority[left.kind] - priority[right.kind]);
}

export function attendanceConfirmed(lesson: KodlandLesson, studentIds: string[], records: KodlandAttendance[]): boolean {
  if (!studentIds.length) return false;
  return studentIds.every(id => records.some(record => record.external_class_id === lesson.external_class_id && record.external_student_id === id && ["PRESENT", "ABSENT", "LATE", "EXCUSED"].includes(record.status) && lessonForAttendance({ ...record, lesson_title: record.lesson_title ?? "" }, [lesson])?.id === lesson.id));
}
