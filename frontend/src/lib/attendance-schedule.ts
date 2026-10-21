import type { KodlandAttendance, KodlandGroup, KodlandLesson } from "./api";

const isoDate = (value: string | undefined) => value?.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";

const shiftWeeks = (date: string, weeks: number) => {
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return "";
  parsed.setUTCDate(parsed.getUTCDate() + weeks * 7);
  return parsed.toISOString().slice(0, 10);
};

// Kodland mixes the Latin M (U+004D) and Cyrillic M (U+041C) in otherwise
// identical lesson titles. Accept both, then normalize the UI back to Latin M.
const moduleLessonCode = (value: string) => value.match(/[M\u041c](\d+)(?:\s*[.·-]\s*)?L(\d+)/i);

/** Resolves an attendance lesson against the real course catalog. */
export function lessonForAttendance(item: KodlandAttendance, lessons: KodlandLesson[]) {
  const sameClass = lessons.filter((lesson) => lesson.external_class_id === item.external_class_id);
  const direct = sameClass.find((lesson) => lesson.id === item.lesson_id || lesson.source_lesson_id === item.lesson_id);
  if (direct) return direct;

  // In the main attendance grid, Kodland commonly sends the global catalog
  // position as lesson_id. It is only used to find the catalog row; the label
  // still comes from that row's real module and module-local lesson number.
  const globalIndex = /^\d+$/.test(item.lesson_id) ? Number(item.lesson_id) : 0;
  const indexed = globalIndex ? sameClass.find((lesson) => lesson.course_index === globalIndex) : undefined;
  if (indexed) return indexed;

  const code = moduleLessonCode(item.lesson_title);
  const localized = code ? sameClass.find((lesson) =>
    lesson.module_number?.match(/\d+/)?.[0] === code[1]
    && lesson.lesson_number === Number(code[2])) : undefined;
  if (localized) return localized;

  return sameClass.find((lesson) =>
    Boolean(item.lesson_date && lesson.lesson_date === item.lesson_date && (!item.start_time || lesson.start_time === item.start_time))
  );
}

export function attendanceLessonParts(item: KodlandAttendance, lessons: KodlandLesson[]) {
  const lesson = lessonForAttendance(item, lessons);
  const catalogCode = moduleLessonCode(lesson?.title ?? "");
  const moduleNumber = lesson?.module_number?.match(/\d+/)?.[0] ?? catalogCode?.[1];
  if (lesson && moduleNumber) {
    const moduleLessons = lessons
      .filter((candidate) => {
        if (candidate.external_class_id !== lesson.external_class_id) return false;
        const candidateModule = candidate.module_number?.match(/\d+/)?.[0] ?? moduleLessonCode(candidate.title)?.[1];
        return candidateModule === moduleNumber;
      })
      .sort((first, second) => (first.course_index ?? Number.MAX_SAFE_INTEGER) - (second.course_index ?? Number.MAX_SAFE_INTEGER));
    const localIndex = moduleLessons.findIndex((candidate) =>
      candidate.id === lesson.id
      || Boolean(candidate.source_lesson_id && candidate.source_lesson_id === lesson.source_lesson_id)
      || Boolean(candidate.course_index && candidate.course_index === lesson.course_index),
    );
    if (localIndex >= 0) return { module: `M${moduleNumber}`, lesson: `L${localIndex + 1}` };
  }

  const suppliedCode = moduleLessonCode(item.lesson_title);
  if (suppliedCode) return { module: `M${suppliedCode[1]}`, lesson: `L${suppliedCode[2]}` };
  return { module: "", lesson: "Aula" };
}

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
  // The class calendar is canonical for the occurrence. The attendance grid
  // only supplies who attended it and can carry a stale or absent date.
  const lessonDate = isoDate(lesson?.lesson_date);
  if (lessonDate) return lessonDate;
  const directDate = isoDate(attendance.lesson_date);
  if (directDate) return directDate;
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
