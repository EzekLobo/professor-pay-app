export type KodlandLesson = {
  id: string;
  /** Kodland catalog ID; Firestore's id also includes the class ID. */
  source_lesson_id?: string;
  /** Pending until this lesson is opened and its resources are requested. */
  materials_status?: "pending" | "ready" | "empty" | "error" | "unavailable";
  external_class_id: string;
  external_class_name: string;
  module_number?: string;
  lesson_number: number;
  /** One-based position in the full course catalog, distinct from module-local lesson_number. */
  course_index?: number;
  /** Module-local code shown by the group schedule, such as M8.L2. */
  schedule_code?: string;
  title: string;
  theme: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  status: string;
  financial_status?: string;
  lesson_passed: boolean;
  /** Recording published for this scheduled occurrence, when Kodland provides one. */
  recording_url?: string;
  external_url: string;
  slides_url: string;
  guide_url: string;
  homework_url: string;
  homework_title: string;
  classroom_tasks: LessonTask[];
  created_at?: string;
};

export type LessonTask = { title: string; url: string };

export function kodlandLessonLocation(lesson: {
  title: string;
  module_number?: string;
  lesson_number: number;
}) {
  const moduleNumber =
    lesson.module_number?.match(/\d+/)?.[0] ??
    lesson.title.match(/[M\u041c]\s*(\d+)\s*\.?\s*L\s*\d+/i)?.[1];
  const moduleLessonNumber = lesson.title.match(
    /[M\u041c]\s*\d+\s*\.?\s*L\s*(\d+)/i,
  )?.[1];
  if (moduleNumber && lesson.lesson_number)
    return `M${moduleNumber}L${moduleLessonNumber ?? lesson.lesson_number}`;
  return lesson.lesson_number ? `Aula ${lesson.lesson_number}` : "Aula";
}

/** The course lesson endpoint keeps the links that are not present in the group schedule. */
export type KodlandCourseLesson = {
  id: string;
  lesson_number: number;
  course_index?: number;
  title: string;
  materials: unknown[];
  homework: unknown[];
  classroom?: unknown[];
};

export const kodlandLessonCode = (value: string) => {
  const match = value.match(/[M\u041c]\s*(\d+)\s*\.?\s*L\s*(\d+)/i);
  return match ? `M${match[1]}L${match[2]}` : "";
};

/**
 * The group schedule can expose a timetable-event ID that differs from the
 * course lesson ID. Its displayed Mx.Ly code is the most precise link when
 * available, followed by IDs and global catalog positions.
 */
export function matchKodlandCourseLesson(
  lesson: Pick<KodlandLesson, "id" | "schedule_code" | "course_index" | "lesson_number" | "title">,
  courseLessons: KodlandCourseLesson[],
) {
  const code = kodlandLessonCode(lesson.schedule_code || lesson.title);
  return (
    (code
      ? courseLessons.find((candidate) => kodlandLessonCode(candidate.title) === code)
      : undefined) ??
    courseLessons.find((candidate) => candidate.id === lesson.id) ??
    (lesson.course_index && lesson.course_index > 0
      ? courseLessons.find((candidate) => candidate.course_index === lesson.course_index)
      : undefined) ??
    (lesson.lesson_number > 0
      ? courseLessons.find((candidate) => candidate.lesson_number === lesson.lesson_number)
      : undefined) ??
    (() => {
      const lessonTitle = normalizeTitle(lesson.title);
      return lessonTitle
        ? courseLessons.find((candidate) => normalizeTitle(candidate.title) === lessonTitle)
        : undefined;
    })()
  );
}

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
const lists = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  const record = objectValue(value);
  // A schedule response can contain both a short `items` list and the full
  // `schedule` array. The latter is the calendar of record, so never stop at
  // the first array found and accidentally discard later occurrences.
  return listKeys.flatMap((key) =>
    Array.isArray(record[key]) ? record[key] as unknown[] : [],
  );
};
const lessonItems = (value: unknown, depth = 0): unknown[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      Array.isArray(item) ? lessonItems(item, depth + 1) : [item],
    );
  }
  if (depth >= 3 || !value || typeof value !== "object") return [];
  const direct = lists(value);
  // A group response may expose the first page in `results` and the full
  // official calendar inside a nested `data.schedule`. Keep both instead of
  // returning as soon as the first list is found.
  const nested = Object.entries(objectValue(value)).flatMap(([key, item]) =>
    // Known arrays are already represented in `direct`; traverse unknown
    // containers to support alternate provider payload names.
    item && typeof item === "object" && !(Array.isArray(item) && listKeys.includes(key))
      ? lessonItems(item, depth + 1)
      : [],
  );
  return [
    ...direct.flatMap((item) =>
      Array.isArray(item) ? lessonItems(item, depth + 1) : [item],
    ),
    ...nested,
  ];
};

/**
 * Retains every candidate occurrence in a Kodland calendar payload.  This is
 * deliberately exported for the synchronizer: reducing the response to its
 * first `items`/`results` array drops the official calendar when it is nested
 * under `data.schedule`.
 */
export const kodlandLessonEntries = (payload: unknown) => lessonItems(payload);

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
    const catalog = matchKodlandCourseLesson(lesson, courseLessons);
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
      course_index: catalog.course_index || lesson.course_index,
      lesson_number: catalog.lesson_number || lesson.lesson_number,
      title: catalog.title || lesson.title,
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
  return kodlandLessonEntries(payload).flatMap((value, index) => {
    const item = objectValue(value);
    const nestedLesson = objectValue(
      item.lesson ??
        item.lesson_data ??
        item.lessonData ??
        item.course_lesson ??
        item.courseLesson ??
        item.lesson_info ??
        item.lessonInfo,
    );
    const lessonItem = { ...item, ...nestedLesson };
    const lessonCode = [
      lessonItem.lesson_code,
      lessonItem.lessonCode,
      lessonItem.lesson_label,
      lessonItem.lessonLabel,
      lessonItem.display_name,
      lessonItem.displayName,
      lessonItem.lesson_title,
      lessonItem.lessonTitle,
      lessonItem.title,
      item.lesson,
    ]
      .map(text)
      .map((value) =>
        value.match(/[M\u041c]\s*(\d+)\s*\.?\s*L\s*(\d+)/i),
      )
      .find(Boolean);
    const scheduleCode = lessonCode ? `M${lessonCode[1]}L${lessonCode[2]}` : "";
    const id = readText(item, [
      "lesson_id",
      "lessonId",
      "timetable_id",
      "timetableId",
      "event_id",
      "eventId",
      "id",
    ]) || readText(nestedLesson, ["lesson_id", "lessonId", "id"]);
    const explicitLessonNumber = number(
      lessonItem.lesson_number ??
        lessonItem.lessonNumber ??
        lessonItem.lesson_no ??
        lessonItem.lessonNo ??
        lessonItem.course_lesson_number ??
        lessonItem.courseLessonNumber ??
        lessonItem.number ??
        lessonItem.lesson_index ??
        lessonItem.lessonIndex ??
        lessonItem.lesson_order ??
        lessonItem.lessonOrder ??
        (typeof item.lesson === "number"
          ? item.lesson
          : undefined),
    );
    // The schedule can expose its global index in two forms: directly as
    // `lesson_number` (for example 30) or in a compact code such as M7L28.
    // A dotted code such as M8.L2 is module-local, so its L2 must never
    // override the explicit global index 30.
    const lessonNumber =
      source === "schedule" && explicitLessonNumber > 0
        ? explicitLessonNumber
        : source === "schedule" && lessonCode
        ? number(lessonCode[2])
        : explicitLessonNumber;
    const courseIndex =
      source === "schedule"
        ? explicitLessonNumber || number(lessonCode?.[2])
        : 0;
    const moduleNumber = readText(lessonItem, [
      "module_number",
      "moduleNumber",
      "module",
      "module_name",
      "moduleName",
    ]);
    const date = readDate(lessonItem);
    const title = readText(lessonItem, [
      "lesson_title",
      "lessonTitle",
      "title",
      "name",
      "theme",
      "lesson_theme",
    ]);
    const theme = readText(lessonItem, [
      "theme",
      "lesson_theme",
      "lessonTheme",
      "topic",
    ]);
    // A response can also contain arrays of materials, students and metadata.
    // They are not timeline entries even when they have an `id` and a title.
    if (!date && !lessonNumber && !scheduleCode) return [];
    const lessonId =
      id ||
      `${group.external_id}-${date || "lesson"}-${lessonNumber || index + 1}`;
    const slidesUrl = findLessonUrl(lessonItem, [
      "slides_url",
      "slide_url",
      "slides",
      "presentation_url",
      "presentation_link",
      "presentationLink",
      "link_to_slides",
      "link_to_presentation",
    ]);
    const guideUrl = findLessonUrl(lessonItem, [
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
    const homeworkUrl = findLessonUrl(lessonItem, [
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
    const direct = findLessonUrl(lessonItem, [
      "lesson_url",
      "lesson_link",
      "view_url",
      "external_url",
      "external_link",
      "link",
      "href",
    ]);
    const recordingUrl = findLessonUrl(lessonItem, [
      "recording_url",
      "recordingUrl",
      "recording",
      "recordings",
      "video_url",
      "videoUrl",
      "lesson_recording",
      "lessonRecording",
    ]);
    return [
      {
        id: lessonId,
        external_class_id: group.external_id,
        external_class_name: group.title,
        module_number: moduleNumber,
        lesson_number: lessonNumber,
        ...(courseIndex > 0 ? { course_index: courseIndex } : {}),
        ...(source === "schedule" && scheduleCode ? { schedule_code: scheduleCode } : {}),
        title: title || (source === "schedule" ? "Aula agendada" : "Aula"),
        theme,
        lesson_date: date,
        start_time: readTime(lessonItem, [
          "start_time",
          "startTime",
          "start_at",
          "startAt",
          "datetime",
          "start_datetime",
        ]),
        end_time: readTime(lessonItem, [
          "end_time",
          "endTime",
          "end_at",
          "endAt",
          "finish_at",
          "finishAt",
        ]),
        status: readText(lessonItem, ["status", "lesson_status", "state"]),
        lesson_passed: booleanValue(
          lessonItem.lesson_passed ??
            lessonItem.lessonPassed ??
            lessonItem.passed ??
            lessonItem.completed,
        ),
        ...(recordingUrl ? { recording_url: recordingUrl } : {}),
        external_url: toExternalUrl(direct, group.external_id, lessonId),
        slides_url: slidesUrl,
        guide_url: guideUrl,
        homework_url: homeworkUrl,
        homework_title: readText(lessonItem, [
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
  // The group lesson list may carry an out-of-date recurring date after a
  // skipped or rescheduled class. Merge it first, then let the official
  // calendar overwrite occurrence data (date, time and recording).
  const values = [
    ...parseKodlandLessonsPayload(lessonsPayload, group, "lessons"),
    ...parseKodlandLessonsPayload(schedulePayload, group, "schedule"),
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
            recording_url: lesson.recording_url || previous.recording_url,
            external_url: lesson.external_url || previous.external_url,
            slides_url: lesson.slides_url || previous.slides_url,
            guide_url: lesson.guide_url || previous.guide_url,
            homework_url: lesson.homework_url || previous.homework_url,
            homework_title: lesson.homework_title || previous.homework_title,
            classroom_tasks:
              lesson.classroom_tasks.length
                ? lesson.classroom_tasks
                : previous.classroom_tasks,
            schedule_code: lesson.schedule_code || previous.schedule_code,
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
