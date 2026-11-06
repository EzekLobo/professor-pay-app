import type { KodlandCourseLesson, KodlandLesson } from "./kodland-lessons";

export type KodlandCatalogCourse = { id: string; name: string; internal_name: string; lesson_count: number; lessons: KodlandLesson[] };
export const catalogClassId = (courseId: string) => `course:${courseId}`;

export function parseCatalogCourses(items: unknown[]): KodlandCatalogCourse[] {
  const result = new Map<string, KodlandCatalogCourse>();
  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Record<string, unknown>;
    const nested = item.course && typeof item.course === "object" ? item.course as Record<string, unknown> : item;
    const id = String(nested.id ?? nested.course_id ?? "").trim();
    const name = String(nested.title ?? nested.name ?? nested.course_name ?? nested.internal_name ?? "").trim();
    if (!/^[\w-]+$/.test(id) || !name) continue;
    result.set(id, { id, name, internal_name: String(nested.internal_name ?? nested.course_internal_name ?? ""), lesson_count: Number(nested.lesson_count ?? nested.lessons_count ?? nested.number_of_lessons) || 0, lessons: [] });
  }
  return [...result.values()];
}

export function catalogLessons(course: KodlandCatalogCourse, lessons: KodlandCourseLesson[]): KodlandLesson[] {
  return lessons.map((lesson, index) => ({ id: `course-${course.id}-lesson-${lesson.id}`, source_lesson_id: lesson.id, external_class_id: catalogClassId(course.id), external_class_name: course.name, course_index: lesson.course_index ?? index + 1, module_number: lesson.module_number, lesson_number: lesson.lesson_number, title: lesson.title, theme: "", lesson_date: "", start_time: "", end_time: "", status: "", lesson_passed: false, materials_status: "pending", external_url: `https://bo.kodland.org/courses/${encodeURIComponent(course.id)}`, slides_url: "", guide_url: "", homework_url: "", homework_title: "", classroom_tasks: [] }));
}

export function mergeCourseCatalog(incoming: KodlandCatalogCourse[], previous: KodlandCatalogCourse[]): KodlandCatalogCourse[] {
  return incoming.map(course => {
    const saved = new Map(previous.find(item => item.id === course.id)?.lessons.map(lesson => [lesson.source_lesson_id, lesson]) ?? []);
    return { ...course, lessons: course.lessons.map(lesson => {
      const old = saved.get(lesson.source_lesson_id);
      return old && ["ready", "empty"].includes(old.materials_status ?? "") ? { ...lesson, materials_status: old.materials_status, slides_url: old.slides_url, guide_url: old.guide_url, homework_url: old.homework_url, homework_title: old.homework_title, classroom_tasks: old.classroom_tasks } : lesson;
    }) };
  });
}
