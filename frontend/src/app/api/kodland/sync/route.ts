import { NextRequest } from "next/server";

export const runtime = "nodejs";

type Group = { external_id: string; title: string; course_name: string; student_count: number; start_date: string; next_lesson_date: string; archived: boolean };
type Student = { id: string; external_id: string; name: string; email: string; phone: string; status: string; progress_summary: string; profile_url: string; external_class_id: string; external_class_name: string };
type Review = { id: string; external_class_id: string; external_class_name: string; external_student_id: string; student_name: string; lesson_id: string; lesson_number: number; lesson_title: string; module_number: string; task_id: string; task_number: number; task_title: string; status_key: string; status_label: string; correction_url: string };

const sso = "https://sso.production.kodland.org/";
const api = "https://backoffice.kodland.org/api/v2/";
const text = (value: unknown) => typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
const record = (value: unknown) => value && typeof value === "object" ? value as Record<string, unknown> : {};
const list = (value: unknown) => Array.isArray(value) ? value : [];
const number = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

async function requireFirebaseUser(request: NextRequest) {
  const idToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!idToken || !apiKey) return null;
  const response = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ idToken }), cache: "no-store" });
  if (!response.ok) return null;
  const payload = await response.json() as { users?: Array<{ localId?: string }> };
  return payload.users?.[0]?.localId ?? null;
}

function userId(token: string) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("A sessão da Kodland é inválida.");
  const decoded = JSON.parse(Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")) as { user_id?: string | number };
  if (decoded.user_id === undefined) throw new Error("A sessão da Kodland não informa o professor.");
  return String(decoded.user_id);
}

async function kodlandLogin(username: string, password: string) {
  const form = new URLSearchParams({ username: username.trim(), password });
  const response = await fetch(`${sso}login`, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: form, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "Usuário ou senha da Kodland inválidos." : "Não foi possível entrar na Kodland.");
  const payload = await response.json() as { access_token?: string };
  if (!payload.access_token) throw new Error("A Kodland não retornou uma sessão válida.");
  return payload.access_token;
}

async function get(path: string, token: string) {
  const response = await fetch(`${api}${path}`, { headers: { authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!response.ok) throw new Error(response.status === 401 ? "A sessão da Kodland expirou. Tente novamente." : "A Kodland não respondeu como esperado.");
  return response.json();
}

async function groupsForTeacher(teacherId: string, token: string): Promise<Group[]> {
  const groups: Group[] = [];
  for (let page = 1; ; page += 1) {
    const payload = record(await get(`teachers/${teacherId}/get_teachers_groups/?page=${page}&page_size=100`, token));
    const items = list(payload.results);
    groups.push(...items.map((value) => {
      const item = record(value); const course = record(item.course);
      return { external_id: text(item.id ?? item.group_id), title: text(item.title ?? item.group_name), course_name: text(course.title ?? item.course_name), student_count: number(item.students_count ?? item.student_count), start_date: text(item.start_timeslot ?? item.start_date), next_lesson_date: text(item.next_lesson_date), archived: Boolean(item.is_archive ?? item.archived) };
    }).filter((group) => group.external_id && group.title));
    if (!payload.next || !items.length) break;
  }
  return groups;
}

function studentsFromPayload(payload: unknown, group: Group): Student[] {
  return list(payload).flatMap((value) => {
    const item = record(value); const info = record(item.main_info); const externalId = text(info.student_id); const name = text(info.full_name);
    if (!externalId || !name) return [];
    const progress = list(item.progress_info); const current = progress.reduce((sum, item) => sum + number(record(item).module_current_grade), 0); const max = progress.reduce((sum, item) => sum + number(record(item).module_max_grade), 0);
    return [{ id: `kodland-student-${externalId}`, external_id: externalId, name, email: text(info.email), phone: text(info.phone ?? info.phone_number ?? info.mobile), status: text(info.status), progress_summary: max ? `${current}/${max}` : "", profile_url: text(info.profile_url) || `https://bo.kodland.org/students/${externalId}`, external_class_id: group.external_id, external_class_name: group.title }];
  });
}

async function reviewsForGroup(group: Group, studentsPayload: unknown, token: string): Promise<Review[]> {
  try {
    const lessons = list(await get(`student_groups/${group.external_id}/lessons/`, token)).filter((value) => record(value).lesson_passed === true);
    const results = await Promise.all(lessons.map(async (value) => {
      const lesson = record(value); const lessonId = text(lesson.lesson_id ?? lesson.id);
      const progress = record(await get(`student_groups/${group.external_id}/lesson/${lessonId}/get_group_progress/`, token));
      const tasks = new Map(list(progress.lesson_tasks).map((value) => { const task = record(value); return [text(task.id ?? task.task_id), task]; }));
      return list(progress.students_progress).flatMap((value) => {
        const student = record(value); const studentId = text(student.student_id); const studentName = text(student.student_name);
        return list(student.tasks_data).flatMap((value) => { const data = record(value); const status = text(data.task_status_key); const task = tasks.get(text(data.task_id)); if (!studentId || !studentName || !task || !["TASK_SUBMITTED", "TASK_SUBMITTED_LATE"].includes(status)) return []; const taskId = text(task.id ?? task.task_id); const link = text(task.link_to_service ?? task.url); return [{ id: `${group.external_id}-${studentId}-${lessonId}-${taskId}`, external_class_id: group.external_id, external_class_name: group.title, external_student_id: studentId, student_name: studentName, lesson_id: lessonId, lesson_number: number(lesson.lesson_number ?? lesson.number), lesson_title: text(lesson.lesson_title ?? lesson.title), module_number: "", task_id: taskId, task_number: number(task.number ?? task.task_number), task_title: text(task.title ?? task.task_title), status_key: status, status_label: status === "TASK_SUBMITTED_LATE" ? "Entregue com atraso" : "Entregue", correction_url: /^https?:\/\//.test(link) ? link : `https://bo.kodland.org${link || `/groups/${group.external_id}`}` }]; });
      });
    }));
    return results.flat();
  } catch { return []; }
}

export async function POST(request: NextRequest) {
  try {
    if (!await requireFirebaseUser(request)) return Response.json({ message: "Não autorizado." }, { status: 401 });
    const body = await request.json() as { username?: string; password?: string };
    if (!body.username?.trim() || !body.password) return Response.json({ message: "Informe usuário e senha da Kodland." }, { status: 400 });
    const token = await kodlandLogin(body.username, body.password);
    const groups = await groupsForTeacher(userId(token), token);
    const active = groups.filter((group) => !group.archived);
    const snapshots = await Promise.all(active.map(async (group) => { const payload = await get(`student_groups/${group.external_id}/get_students_main_data/`, token); return { students: studentsFromPayload(payload, group), reviews: await reviewsForGroup(group, payload, token) }; }));
    return Response.json({ groups, students: snapshots.flatMap((item) => item.students), reviews: snapshots.flatMap((item) => item.reviews) });
  } catch (error) {
    return Response.json({ message: error instanceof Error ? error.message : "Não foi possível sincronizar com a Kodland." }, { status: 502 });
  }
}
