import type { KodlandAttendance, KodlandGroup, KodlandLesson } from "./api";

const isoDate = (value: string | undefined) => value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";

const shiftWeeks = (date: string, weeks: number) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setUTCDate(parsed.getUTCDate() + weeks * 7);
  return parsed.toISOString().slice(0, 10);
};

/**
 * Resolves a presence date from the synchronized class calendar. Kodland's
 * attendance grid frequently omits dates, so a real dated lesson (or the
 * group's next/start calendar anchor) is shifted by the catalog course index.
 * Module size is never assumed.
 */
export function attendanceDateFromSchedule(
  attendance: Pick<KodlandAttendance, "lesson_date">,
  lesson: KodlandLesson | undefined,
  lessons: KodlandLesson[],
  group: KodlandGroup | undefined,
) {
  const directDate = isoDate(attendance.lesson_date);
  if (directDate) return directDate;
  const lessonDate = isoDate(lesson?.lesson_date);
  if (lessonDate) return lessonDate;
  const targetIndex = lesson?.course_index;
  if (!targetIndex) return "";

  const datedLessons = lessons
    .filter((candidate) => candidate.external_class_id === lesson.external_class_id && candidate.course_index && isoDate(candidate.lesson_date))
    .sort((first, second) => Math.abs((first.course_index ?? 0) - targetIndex) - Math.abs((second.course_index ?? 0) - targetIndex));
  const nearest = datedLessons[0];
  if (nearest?.course_index) return shiftWeeks(isoDate(nearest.lesson_date), targetIndex - nearest.course_index);

  const nextDate = isoDate(group?.next_lesson_date);
  if (nextDate && group) {
    const nextLesson = lessons.find((candidate) =>
      candidate.external_class_id === group.external_id
      && Boolean(group.next_lesson_id)
      && (candidate.id === group.next_lesson_id || candidate.source_lesson_id === group.next_lesson_id),
    );
    const nextIndex = nextLesson?.course_index ?? group.next_lesson_number;
    if (nextIndex) return shiftWeeks(nextDate, targetIndex - nextIndex);
  }

  const startDate = isoDate(group?.start_date);
  return startDate ? shiftWeeks(startDate, targetIndex - 1) : "";
}
