import { findLessonUrl, type KodlandCourseLesson, type LessonTask } from "@/lib/kodland-lessons";

export const MATERIAL_HOSTS = new Set([
  "bo.kodland.org",
  "wiki.kodland.org",
  "learn.kodland.org",
  "docs.google.com",
  "drive.google.com",
]);

export type CourseCatalogEntry = {
  id: "roblox" | "scratch" | "python";
  name: string;
  providerCourseId: string;
  available: boolean;
};

const providerId = (value: string | undefined) =>
  value && /^\d{1,12}$/.test(value.trim()) ? value.trim() : "";

/**
 * IDs are deliberately server-controlled. A browser may choose only an entry
 * from this list; it can never make the server fetch an arbitrary URL/course.
 */
export function courseImportCatalog(
  configured = process.env.COURSE_IMPORT_CATALOG,
): CourseCatalogEntry[] {
  const overrides = new Map<string, string>();
  for (const item of (configured ?? "").split(",")) {
    const [key, rawId] = item.split(":", 2);
    const id = providerId(rawId);
    if (key && id) overrides.set(key.trim().toLowerCase(), id);
  }
  const entries: Array<[CourseCatalogEntry["id"], string, string]> = [
    ["roblox", "Roblox", "1192"],
    ["scratch", "Scratch", "1183"],
    ["python", "Python", ""],
  ];
  return entries.map(([id, name, defaultId]) => {
    const courseId = overrides.get(id) ?? defaultId;
    return {
      id,
      name,
      providerCourseId: courseId,
      available: Boolean(courseId),
    };
  });
}

export type ImportRequest = {
  courseId: CourseCatalogEntry["id"];
  username: string;
  password: string;
};

export function validateImportRequest(value: unknown): ImportRequest {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("Pedido de importação inválido.");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["courseId", "username", "password"]);
  if (Object.keys(record).some((key) => !allowed.has(key)))
    throw new Error("Pedido de importação contém campos não permitidos.");
  const courseId = typeof record.courseId === "string" ? record.courseId : "";
  const username = typeof record.username === "string" ? record.username.trim() : "";
  const password = typeof record.password === "string" ? record.password : "";
  if (!/^(roblox|scratch|python)$/.test(courseId))
    throw new Error("Curso não permitido.");
  if (!username || username.length > 254 || !password || password.length > 1024)
    throw new Error("Informe credenciais válidas para importar o curso.");
  return { courseId: courseId as ImportRequest["courseId"], username, password };
}

/** Returns only an HTTPS material link whose final hostname is explicitly allowed. */
export function allowedMaterialUrl(value: unknown): string {
  if (typeof value !== "string" || value.length > 4096) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" && MATERIAL_HOSTS.has(url.hostname.toLowerCase())
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

const materialUrl = (value: unknown) =>
  allowedMaterialUrl(
    findLessonUrl(value, [
      "link",
      "url",
      "href",
      "file_url",
      "fileUrl",
      "download_url",
      "downloadUrl",
    ]),
  );
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const record = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const list = (value: unknown) => {
  if (Array.isArray(value)) return value;
  const item = record(value);
  const key = ["results", "items", "data", "lessons", "materials", "tasks"].find(
    (candidate) => Array.isArray(item[candidate]),
  );
  return key ? (item[key] as unknown[]) : [];
};

export type ImportedCourseLesson = {
  id: string;
  lesson_number: number;
  title: string;
  module_number: string;
  external_url: string;
  slides_url: string;
  guide_url: string;
  homework_url: string;
  homework_title: string;
  classroom_tasks: LessonTask[];
};

export function courseLessonFromSource(
  courseId: string,
  lesson: KodlandCourseLesson,
): ImportedCourseLesson {
  const materials = lesson.materials
    .map((value) => ({ value, title: text(record(value).title ?? record(value).name), url: materialUrl(value) }))
    .filter((value) => value.url);
  const slides = materials.find(({ title, url }) =>
    /slide|apresent|presentation|ppt/i.test(title) || /docs\.google\.com\/presentation/i.test(url),
  );
  const guide = materials.find(({ title, url }) =>
    /roteiro|guia|guide|metod|script|wiki/i.test(title) || /wiki\.kodland\.org/i.test(url),
  );
  const homework = lesson.homework
    .map((value) => {
      const item = record(value);
      const direct = materialUrl(value);
      const taskId = text(item.id ?? item.task_id ?? item.taskId);
      return {
        title: text(item.title ?? item.name ?? item.task_title),
        url: direct || (taskId ? `https://learn.kodland.org/pt/task/${encodeURIComponent(taskId)}/teacher/do` : ""),
      };
    })
    .find((value) => allowedMaterialUrl(value.url));
  const classroom_tasks = (lesson.classroom ?? [])
    .map((value) => {
      const item = record(value);
      const direct = materialUrl(value);
      const taskId = text(item.id ?? item.task_id ?? item.taskId);
      return {
        title: text(item.title ?? item.name ?? item.task_title),
        url: direct || (taskId ? `https://learn.kodland.org/pt/task/${encodeURIComponent(taskId)}/teacher/do` : ""),
      };
    })
    .filter((task): task is LessonTask => Boolean(allowedMaterialUrl(task.url)));
  return {
    id: lesson.id,
    lesson_number: lesson.lesson_number,
    title: lesson.title,
    module_number: text(record(lesson as unknown).module_number),
    external_url: `https://bo.kodland.org/courses/${encodeURIComponent(courseId)}?lessonId=${encodeURIComponent(lesson.id)}`,
    slides_url: slides?.url ?? "",
    guide_url: guide?.url ?? "",
    homework_url: homework?.url ? allowedMaterialUrl(homework.url) : "",
    homework_title: homework?.title ?? "",
    classroom_tasks,
  };
}

/** Bounded fan-out prevents a long course from flooding the provider. */
export async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const safeLimit = Math.max(1, Math.min(5, Math.floor(limit)));
  const output = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(safeLimit, values.length) }, async () => {
      for (;;) {
        const index = cursor++;
        if (index >= values.length) return;
        output[index] = await mapper(values[index]);
      }
    }),
  );
  return output;
}

export { list as sourceList };
