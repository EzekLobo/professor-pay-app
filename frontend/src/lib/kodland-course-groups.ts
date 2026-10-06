import type { KodlandGroup, KodlandLesson } from "@/lib/api";

export type KodlandCourseGroup = {
  id: string;
  name: string;
  groups: KodlandGroup[];
  lessons: KodlandLesson[];
};

const cleanCourseName = (value: string) =>
  value.replace(/\[[^\]]*\]/g, " ").replace(/\s+/g, " ").trim();

const courseIdentity = (group: KodlandGroup) => {
  const id = group.course_id?.trim() || group.course_name.match(/^\[(\d+)\]/)?.[1];
  return id ? `course-${id}` : `name-${cleanCourseName(group.course_name || group.title).toLocaleLowerCase()}`;
};

const legacyLessonModule = (lesson: KodlandLesson) =>
  lesson.module_number?.match(/\d+/)?.[0] ?? lesson.title.match(/[MМ]\s*(\d+)\s*\.?\s*L\s*\d+/i)?.[1] ?? "";

const lessonModule = (lesson: KodlandLesson) =>
  lesson.module_number?.match(/\d+/)?.[0]
  ?? lesson.title.match(/[\u004d\u041c]\s*(\d+)\s*\.?\s*L\s*\d+/i)?.[1]
  ?? legacyLessonModule(lesson)
  ?? "";

const lessonKey = (lesson: KodlandLesson) => {
  if (lesson.course_index && lesson.course_index > 0) return `index-${lesson.course_index}`;
  if (lesson.id) return `id-${lesson.id}`;
  const moduleIndex = lessonModule(lesson);
  if (moduleIndex && lesson.lesson_number > 0) return `module-${moduleIndex}-lesson-${lesson.lesson_number}`;
  return `title-${(lesson.title || lesson.theme).trim().toLocaleLowerCase()}`;
};

const nonEmpty = <T,>(first: T, second: T): T => {
  if (typeof first === "string") return (first.trim() ? first : second) as T;
  return first ?? second;
};

function mergeLessons(first: KodlandLesson, second: KodlandLesson): KodlandLesson {
  const classroomTasks = new Map<string, KodlandLesson["classroom_tasks"][number]>();
  for (const task of [...(first.classroom_tasks ?? []), ...(second.classroom_tasks ?? [])]) {
    classroomTasks.set(task.url || task.title, task);
  }
  return {
    ...first,
    course_index: first.course_index || second.course_index,
    module_number: nonEmpty(first.module_number ?? "", second.module_number ?? "") || undefined,
    title: nonEmpty(first.title, second.title),
    theme: nonEmpty(first.theme, second.theme),
    lesson_date: nonEmpty(first.lesson_date, second.lesson_date),
    start_time: nonEmpty(first.start_time, second.start_time),
    end_time: nonEmpty(first.end_time, second.end_time),
    external_url: nonEmpty(first.external_url, second.external_url),
    slides_url: nonEmpty(first.slides_url, second.slides_url),
    guide_url: nonEmpty(first.guide_url, second.guide_url),
    homework_url: nonEmpty(first.homework_url, second.homework_url),
    homework_title: nonEmpty(first.homework_title, second.homework_title),
    classroom_tasks: [...classroomTasks.values()],
  };
}

/** Combines per-class snapshots into one course catalog without losing materials. */
export function groupKodlandLessonsByCourse(
  groups: KodlandGroup[],
  lessons: KodlandLesson[],
): KodlandCourseGroup[] {
  const result = new Map<string, KodlandCourseGroup>();

  for (const group of groups) {
    const key = courseIdentity(group);
    const current = result.get(key) ?? {
      id: key,
      name: cleanCourseName(group.course_name) || group.course_name || "Curso",
      groups: [],
      lessons: [],
    };
    current.groups.push(group);

    const byLesson = new Map(current.lessons.map((lesson) => [lessonKey(lesson), lesson]));
    for (const lesson of lessons.filter((item) => item.external_class_id === group.external_id)) {
      const lessonId = lessonKey(lesson);
      const existing = byLesson.get(lessonId);
      byLesson.set(lessonId, existing ? mergeLessons(existing, lesson) : lesson);
    }
    current.lessons = [...byLesson.values()].sort((a, b) =>
      (a.course_index || Number.MAX_SAFE_INTEGER) - (b.course_index || Number.MAX_SAFE_INTEGER)
      || lessonModule(a).localeCompare(lessonModule(b), undefined, { numeric: true })
      || a.lesson_number - b.lesson_number
      || a.title.localeCompare(b.title),
    );
    result.set(key, current);
  }

  return [...result.values()].sort((a, b) => a.name.localeCompare(b.name));
}
