import { NextRequest } from "next/server";
import {
  allowedMaterialUrl,
  courseImportCatalog,
  courseLessonFromSource,
  mapWithConcurrency,
  sourceList,
  validateImportRequest,
} from "@/lib/course-import";
import type { KodlandCourseLesson } from "@/lib/kodland-lessons";

export const runtime = "nodejs";

const SSO_URL = "https://sso.production.kodland.org/login";
const API_URL = "https://backoffice.kodland.org/api/v2/";
const PROVIDER_HOSTS = new Set([
  "sso.production.kodland.org",
  "backoffice.kodland.org",
]);
const MAX_LESSONS = 80;

async function requireFirebaseUser(request: NextRequest) {
  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!idToken || !apiKey) return null;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as { users?: Array<{ localId?: string }> };
  return payload.users?.[0]?.localId ?? null;
}

export async function GET(request: NextRequest) {
  if (!(await requireFirebaseUser(request)))
    return Response.json({ message: "NÃ£o autorizado." }, { status: 401 });
  // Provider course IDs remain server-side; the UI receives only safe choices.
  const courses = courseImportCatalog().map(({ id, name, available }) => ({ id, name, available }));
  return Response.json({ courses });
}

function assertProviderUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !PROVIDER_HOSTS.has(url.hostname.toLowerCase()))
    throw new Error("A fonte do curso não é permitida.");
  return url;
}

async function providerFetch(url: string, init: RequestInit) {
  const target = assertProviderUrl(url);
  const response = await fetch(target, { ...init, cache: "no-store", redirect: "manual" });
  // A redirect may otherwise turn a provider request into an SSRF request.
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location");
    if (!location) throw new Error("A fonte do curso retornou um redirecionamento inválido.");
    assertProviderUrl(new URL(location, target).toString());
    throw new Error("A fonte do curso exigiu redirecionamento. Tente novamente.");
  }
  return response;
}

async function login(username: string, password: string) {
  const response = await providerFetch(SSO_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username, password }),
  });
  if (!response.ok)
    throw new Error(response.status === 401 ? "Credenciais inválidas." : "Não foi possível autenticar na fonte do curso.");
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token) throw new Error("A fonte não retornou uma sessão válida.");
  return payload.access_token;
}

async function get(path: string, token: string) {
  const response = await providerFetch(new URL(path, API_URL).toString(), {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error("Não foi possível consultar o curso selecionado.");
  return response.json();
}

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
const record = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};

function catalogLessons(value: unknown): KodlandCourseLesson[] {
  return sourceList(value)
    .flatMap((value): KodlandCourseLesson[] => {
      const item = record(value);
      const id = text(item.id ?? item.lesson_id ?? item.lessonId);
      return id ? [{
        id,
        lesson_number: number(item.lesson_number ?? item.lessonNumber ?? item.number),
        title: text(item.title ?? item.lesson_title ?? item.name) || "Aula",
        materials: [],
        homework: [],
      }] : [];
    })
    .slice(0, MAX_LESSONS);
}

async function detailsForLesson(courseLesson: KodlandCourseLesson, token: string) {
  const [materials, homework, classroom] = await Promise.all([
    get(`materials?lesson=${encodeURIComponent(courseLesson.id)}`, token),
    get(`tasks/get_tasks_list?lesson=${encodeURIComponent(courseLesson.id)}&is_hw=true`, token),
    get(`tasks/get_tasks_list?lesson=${encodeURIComponent(courseLesson.id)}&is_hw=false`, token),
  ]);
  return {
    ...courseLesson,
    materials: sourceList(materials),
    homework: sourceList(homework),
    classroom: sourceList(classroom),
  };
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireFirebaseUser(request)))
      return Response.json({ message: "Não autorizado." }, { status: 401 });
    const input = validateImportRequest(await request.json());
    const course = courseImportCatalog().find((entry) => entry.id === input.courseId);
    if (!course?.available)
      return Response.json({ message: "Este curso ainda não está configurado para importação." }, { status: 422 });

    // Credentials and provider token remain local variables and are never returned or stored.
    const token = await login(input.username, input.password);
    const catalog = catalogLessons(
      await get(`lessons/get_lessons_list?course=${encodeURIComponent(course.providerCourseId)}`, token),
    );
    const detailed = await mapWithConcurrency(catalog, 4, (lesson) => detailsForLesson(lesson, token));
    const lessons = detailed.map((lesson) => courseLessonFromSource(course.providerCourseId, lesson));
    return Response.json({
      course: { id: course.id, name: course.name, lesson_count: lessons.length },
      lessons: lessons.map((lesson) => ({
        ...lesson,
        external_url: allowedMaterialUrl(lesson.external_url),
        slides_url: allowedMaterialUrl(lesson.slides_url),
        guide_url: allowedMaterialUrl(lesson.guide_url),
        homework_url: allowedMaterialUrl(lesson.homework_url),
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Não foi possível importar o curso.";
    return Response.json({ message }, { status: 400 });
  }
}
