import type { KodlandAttendance, KodlandGroup } from "./api";
import type { KodlandLesson } from "./kodland-lessons";
import { attendanceDateFromSchedule } from "./attendance-schedule";
import { notificationLessonEnd } from "./student-notification-rules";
/** Reuse a known weekly time only when dated slots agree; never invent a duration. */
export function kodlandNotificationCalendar(record: Pick<KodlandAttendance, "lesson_date">, lesson: KodlandLesson | undefined, lessons: KodlandLesson[], group: KodlandGroup | undefined, zone: string) {
  const date = attendanceDateFromSchedule(record, lesson, lessons, group);
  let start = lesson?.start_time ?? "";
  let end = lesson?.end_time ?? "";
  if ((!start || !end) && date && lesson?.course_index && group) {
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    const anchors = lessons.filter(item => item.external_class_id === group.external_id && item.lesson_date && item.start_time && item.end_time && !/cancel/i.test(item.status ?? "") && new Date(`${item.lesson_date.slice(0, 10)}T12:00:00Z`).getUTCDay() === weekday);
    const clocks = new Set(anchors.map(item => `${item.start_time.slice(0, 5)}|${item.end_time.slice(0, 5)}`));
    if (clocks.size === 1) { const clock = [...clocks][0].split("|"); start ||= clock[0]; end ||= clock[1]; }
  }
  return { date, start, end, endedAt: notificationLessonEnd(date, start, end, zone) };
}
