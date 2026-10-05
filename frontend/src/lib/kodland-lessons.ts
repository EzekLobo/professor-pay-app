export type KodlandLesson = {
  id: string;
  external_class_id: string;
  external_class_name: string;
  module_number?: string;
  lesson_number: number;
  title: string;
  theme: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  status: string;
  financial_status?: string;
  lesson_passed: boolean;
  external_url: string;
  slides_url: string;
  guide_url: string;
  homework_url: string;
  homework_title: string;
  classroom_tasks: LessonTask[];
  created_at?: string;
};

export type LessonTask = { title: string; url: string };

/** The course lesson endpoint keeps the links that are not present in the group schedule. */
export type KodlandCourseLesson = {
  id: string;
  lesson_number: number;
  title: string;
  materials: unknown[];
  homework: unknown[];
  classroom?: unknown[];
};

type ObjectValue = Record<string, unknown>;

const objectValue = (value: unknown): ObjectValue =>
  value && typeof value === "object" ? (value as ObjectValue) : {};
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
const number = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const booleanValue = (value: unknown) =>
  value === true || value === 1 || value === "true";

const listKeys = [
  "results",
  "items",
  "data",
  "lessons",
  "events",
  "schedule",
  "timetable",
  "slots",
];
const list = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const record = objectValue(value);
  for (const key of listKeys) {
    if (Array.isArray(record[key])) return record[key] as unknown[];
  }
  return [];
};

const aliases = (values: string[]) =>
  new Set(values.map((value) => value.toLowerCase().replace(/[- ]/g, "_")));
const normalizeKey = (value: string) =>
  value.toLowerCase().replace(/[- ]/g, "_");
const urlValue = (value: unknown) => {
  const candidate = text(value);
  return /^(https?:\/\/|\/)/i.test(candidate) ? candidate : "";
};

/** Finds a link in alternate response shapes without requiring a fixed API schema. */
export function findLessonUrl(
  value: unknown,
  keys: string[],
  depth = 0,
): string {
  if (depth > 4 || value === null || value === undefined) return "";
  const accepted = aliases(keys);
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findLessonUrl(item, keys, depth + 1);
      if (found) return found;
    }
    return "";
  }
  if (typeof value !== "object") return "";
  const record = objectValue(value);
  for (const [key, item] of Object.entries(record)) {
    if (accepted.has(normalizeKey(key))) {
      const direct = urlValue(item);
      if (direct) return direct;
    }
  }
  for (const item of Object.values(record)) {
    const found = findLessonUrl(item, keys, depth + 1);
    if (found) return found;
  }
  return "";
}

const readText = (record: ObjectValue, keys: string[]) => {
  for (const key of keys) {
    const value = text(record[key]);
    if (value) return value;
  }
  return "";
};

const readDate = (record: ObjectValue) =>
  readText(record, [
    "lesson_date",
    "lessonDate",
    "date",
    "date_start",
    "start_date",
    "startDate",
    "start_at",
    "startAt",
    "datetime",
    "start_datetime",
    "startDatetime",
  ]);

const readTime = (record: ObjectValue, keys: string[]) => {
  const value = readText(record, keys);
  if (!value) return "";
  const match = value.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/);
  return match?.[0]?.slice(0, 5) ?? value.slice(0, 5);
};

const toExternalUrl = (value: string, groupId: string, lessonId: string) => {
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("/")) return `https://bo.kodland.org${value}`;
  return `https://bo.kodland.org/groups/${groupId}${lessonId ? `#lesson-${lessonId}` : ""}`;
};

const normalizeTitle = (value: string) =>
  value.toLocaleLowerCase().replace(/[^a-z0-9]+/gi, "");
const materialTitle = (value: unknown) =>
  readText(objectValue(value), ["title", "name", "label"]);
const materialUrl = (value: unknown) =>
  findLessonUrl(value, [
    "link",
    "url",
    "href",
    "file_url",
    "fileUrl",
    "download_url",
    "downloadUrl",
  ]);
const taskId = (value: unknown) =>
  readText(objectValue(value), ["id", "task_id", "taskId"]);
const taskTitle = (value: unknown) =>
  readText(objectValue(value), ["title", "name", "task_title", "taskTitle"]);

const courseLessonUrl = (courseId: string, lessonId: string) =>
  courseId && lessonId
    ? `https://bo.kodland.org/courses/${encodeURIComponent(courseId)}?lessonId=${encodeURIComponent(lessonId)}`
    : "";

const taskUrl = (value: unknown) => {
  const direct = findLessonUrl(value, [
    "link",
    "url",
    "href",
    "task_url",
    "taskUrl",
    "link_to_service",
    "linkToService",
  ]);
  if (direct) return direct;
  const id = taskId(value);
  return id
    ? `https://learn.kodland.org/pt/task/${encodeURIComponent(id)}/teacher/do`
    : "";
};

/**
 * Adds the course-level material/task links to lessons coming from a group
 * schedule. The backoffice exposes those as separate resources, which is why
 * the group schedule alone cannot populate the cards.
 */
export function enrichKodlandLessons(
  lessons: KodlandLesson[],
  courseLessons: KodlandCourseLesson[],
  courseId: string,
): KodlandLesson[] {
  return lessons.map((lesson) => {
    const lessonTitle = normalizeTitle(lesson.title);
    const catalog =
      courseLessons.find((candidate) => candidate.id === lesson.id) ??
      (lesson.lesson_number > 0
        ? courseLessons.find(
            (candidate) => candidate.lesson_number === lesson.lesson_number,
          )
        : undefined) ??
      (lessonTitle
        ? courseLessons.find(
            (candidate) => normalizeTitle(candidate.title) === lessonTitle,
          )
        : undefined);
    if (!catalog)
      return {
        ...lesson,
        external_url:
          courseLessonUrl(courseId, lesson.id) || lesson.external_url,
      };

    const materials = Array.isArray(catalog.materials) ? catalog.materials : [];
    const linkedMaterials = materials
      .map((item) => ({
        item,
        title: materialTitle(item),
        url: materialUrl(item),
      }))
      .filter((item) => item.url);
    const slides = linkedMaterials.find(
      ({ title, url }) =>
        /slide|apresent|presentation|ppt/i.test(title) ||
        /docs\.google\.com\/presentation/i.test(url),
    );
    const guide = linkedMaterials.find(
      ({ title, url }) =>
        /roteiro|guia|guide|metod|script|wiki/i.test(title) ||
        /wiki\.kodland/i.test(url),
    );
    const homework = (Array.isArray(catalog.homework) ? catalog.homework : [])
      .map((item) => ({ title: taskTitle(item), url: taskUrl(item) }))
      .find((item) => item.url);
    const classroomTasks = (Array.isArray(catalog.classroom)
      ? catalog.classroom
      : [])
      .map((item) => ({ title: taskTitle(item), url: taskUrl(item) }))
      .filter((item): item is LessonTask => Boolean(item.url));

    return {
      ...lesson,
      external_url:
        courseLessonUrl(courseId, catalog.id) || lesson.external_url,
      slides_url: slides?.url || lesson.slides_url,
      guide_url: guide?.url || lesson.guide_url,
      homework_url: homework?.url || lesson.homework_url,
      homework_title: homework?.title || lesson.homework_title,
      classroom_tasks: classroomTasks.length
        ? classroomTasks
        : lesson.classroom_tasks,
    };
  });
}

export type LessonSource = "schedule" | "lessons";

export function parseKodlandLessonsPayload(
  payload: unknown,
  group: { external_id: string; title: string },
  source: LessonSource = "lessons",
): KodlandLesson[] {
  return list(payload).flatMap((value, index) => {
    const item = objectValue(value);
    const id = readText(item, [
      "lesson_id",
      "lessonId",
      "timetable_id",
      "timetableId",
      "event_id",
      "eventId",
      "id",
    ]);
    const lessonNumber = number(
      item.lesson_number ??
        item.lessonNumber ??
        item.number ??
        item.lesson_index ??
        item.lessonIndex,
    );
    const moduleNumber = readText(item, [
      "module_number",
      "moduleNumber",
      "module",
      "module_name",
      "moduleName",
    ]);
    const date = readDate(item);
    const title = readText(item, [
      "lesson_title",
      "lessonTitle",
      "title",
      "name",
      "theme",
      "lesson_theme",
    ]);
    const theme = readText(item, [
      "theme",
      "lesson_theme",
      "lessonTheme",
      "topic",
    ]);
    if (!id && !date && !lessonNumber && !title) return [];
    const lessonId =
      id ||
      `${group.external_id}-${date || "lesson"}-${lessonNumber || index + 1}`;
    const slidesUrl = findLessonUrl(item, [
      "slides_url",
      "slide_url",
      "slides",
      "presentation_url",
      "presentation_link",
      "presentationLink",
      "link_to_slides",
      "link_to_presentation",
    ]);
    const guideUrl = findLessonUrl(item, [
      "guide_url",
      "script_url",
      "lesson_plan_url",
      "teacher_guide_url",
      "teacher_material_url",
      "teacher_materials",
      "methodology_url",
      "roteiro_url",
      "scenario_url",
      "script",
    ]);
    const homeworkUrl = findLessonUrl(item, [
      "homework_url",
      "homework_link",
      "assignment_url",
      "activity_url",
      "activity_link",
      "link_to_homework",
      "link_to_task",
      "homework",
      "assignment",
      "activity",
      "task",
    ]);
    const direct = findLessonUrl(item, [
      "lesson_url",
      "lesson_link",
      "view_url",
      "external_url",
      "external_link",
      "link",
      "href",
    ]);
    return [
      {
        id: lessonId,
        external_class_id: group.external_id,
        external_class_name: group.title,
        module_number: moduleNumber,
        lesson_number: lessonNumber,
        title: title || (source === "schedule" ? "Aula agendada" : "Aula"),
        theme,
        lesson_date: date,
        start_time: readTime(item, [
          "start_time",
          "startTime",
          "start_at",
          "startAt",
          "datetime",
          "start_datetime",
        ]),
        end_time: readTime(item, [
          "end_time",
          "endTime",
          "end_at",
          "endAt",
          "finish_at",
          "finishAt",
        ]),
        status: readText(item, ["status", "lesson_status", "state"]),
        lesson_passed: booleanValue(
          item.lesson_passed ??
            item.lessonPassed ??
            item.passed ??
            item.completed,
        ),
        external_url: toExternalUrl(direct, group.external_id, lessonId),
        slides_url: slidesUrl,
        guide_url: guideUrl,
        homework_url: homeworkUrl,
        homework_title: readText(item, [
          "homework_title",
          "homeworkTitle",
          "assignment_title",
          "activity_title",
          "task_title",
        ]),
        classroom_tasks: [],
      },
    ];
  });
}

export function mergeKodlandLessons(
  schedulePayload: unknown,
  lessonsPayload: unknown,
  group: { external_id: string; title: string },
): KodlandLesson[] {
  const values = [
    ...parseKodlandLessonsPayload(schedulePayload, group, "schedule"),
    ...parseKodlandLessonsPayload(lessonsPayload, group, "lessons"),
  ];
  const merged = new Map<string, KodlandLesson>();
  for (const lesson of values) {
    const key =
      lesson.id ||
      `${lesson.lesson_date}-${lesson.lesson_number}-${lesson.title}`;
    const previous = merged.get(key);
    merged.set(
      key,
      previous
        ? {
            ...previous,
            ...lesson,
            title:
              lesson.title === "Aula" || lesson.title === "Aula agendada"
                ? previous.title
                : lesson.title,
            theme: lesson.theme || previous.theme,
            lesson_date: lesson.lesson_date || previous.lesson_date,
            start_time: lesson.start_time || previous.start_time,
            end_time: lesson.end_time || previous.end_time,
            status: lesson.status || previous.status,
            external_url: lesson.external_url || previous.external_url,
            slides_url: lesson.slides_url || previous.slides_url,
            guide_url: lesson.guide_url || previous.guide_url,
            homework_url: lesson.homework_url || previous.homework_url,
            homework_title: lesson.homework_title || previous.homework_title,
            classroom_tasks:
              lesson.classroom_tasks.length
                ? lesson.classroom_tasks
                : previous.classroom_tasks,
          }
        : lesson,
    );
  }
  return [...merged.values()].sort((a, b) =>
    `${a.lesson_date} ${a.start_time}`.localeCompare(
      `${b.lesson_date} ${b.start_time}`,
    ),
  );
}
