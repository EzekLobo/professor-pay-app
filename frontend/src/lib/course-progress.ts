import type { KodlandGroup, KodlandLesson } from "./api";

const passed = (lesson: KodlandLesson) => lesson.lesson_passed || /^(held|completed|done|passed|conducted|finished)$/i.test(lesson.status);
const code = (title: string) => title.match(/[M\u041c]\s*(\d+)\s*\.?\s*L\s*(\d+)/i)?.slice(1).map(Number).join(":");

/** Resolve the next lesson against the actual catalog; a forthcoming lesson is not completed. */
export function kodlandCourseProgress(group: KodlandGroup | undefined, lessons: readonly KodlandLesson[]) {
  const unique = new Map<string, KodlandLesson>();
  for (const lesson of lessons) {
    if (/cancel/i.test(lesson.status)) continue;
    const key = lesson.source_lesson_id || lesson.id;
    if (!unique.has(key) || passed(lesson)) unique.set(key, lesson);
  }
  const catalog = [...unique.values()].sort((a, b) => (a.course_index ?? Infinity) - (b.course_index ?? Infinity));
  const confirmed = catalog.filter(passed).length;
  const nextId = group?.next_lesson_id;
  const nextCode = code(group?.next_lesson_title ?? "");
  let next = nextId ? catalog.findIndex(lesson => lesson.id === nextId || lesson.source_lesson_id === nextId) : -1;
  if (next < 0 && nextCode) next = catalog.findIndex(lesson => code(lesson.title) === nextCode || code(lesson.schedule_code ?? "") === nextCode);
  if (next < 0 && Number.isInteger(group?.next_lesson_number) && Number(group?.next_lesson_number) > 0) {
    next = catalog.findIndex(lesson => lesson.course_index === group!.next_lesson_number);
    // A global number is usable by position only when the complete sequence is known.
    if (next < 0 && catalog.every(lesson => !lesson.course_index) && Number(group!.next_lesson_number) <= catalog.length) next = Number(group!.next_lesson_number) - 1;
  }
  if (next < 0) {
    const date = group?.next_lesson_date?.match(/^\d{4}-\d{2}-\d{2}/)?.[0];
    const matches = date ? catalog.map((lesson, index) => ({ lesson, index })).filter(({ lesson }) => lesson.lesson_date?.slice(0, 10) === date) : [];
    // Use the scheduled date only when it identifies exactly one lesson.
    if (matches.length === 1) next = matches[0].index;
  }
  const completed = confirmed > 0 || next >= 0 ? Math.min(catalog.length, Math.max(confirmed, next)) : undefined;
  return { total: catalog.length, completed, percent: catalog.length && completed !== undefined ? Math.round(completed * 100 / catalog.length) : null };
}
