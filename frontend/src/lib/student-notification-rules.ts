import { DEFAULT_WELCOME_MESSAGE, validateWelcomeMessage } from "./welcome-message";
import { renderAbsenceMessage } from "./manual-operations";

export type NotificationCategory = "absence" | "classroom" | "homework";
export type ActivityKind = "classroom" | "homework" | "unknown";
export type NotificationSettings = {
  id: "default";
  enabled: boolean;
  attendance_enabled: boolean;
  classroom_rule: "off" | "none_submitted" | "more_than";
  classroom_threshold: number;
  homework_enabled: boolean;
  tolerance_minutes: number;
  homework_days_after_lesson: number | null;
  start_date: string;
  time_zone: string;
  activity_message_template: string;
  welcome_message_template?: string;
};
export const DEFAULT_ACTIVITY_MESSAGE = "Olá, {responsavel}! Gostaria de conversar sobre {aluno}, da turma {turma}. Há atividades não entregues da aula {aula} ({data}): {atividades}. Como podemos ajudar?";
export function defaultNotificationSettings(today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date())): NotificationSettings {
  return { id: "default", enabled: false, attendance_enabled: true, classroom_rule: "none_submitted", classroom_threshold: 2, homework_enabled: true, tolerance_minutes: 0, homework_days_after_lesson: null, start_date: today, time_zone: "America/Sao_Paulo", activity_message_template: DEFAULT_ACTIVITY_MESSAGE, welcome_message_template: DEFAULT_WELCOME_MESSAGE };
}
export function validateActivityMessageTemplate(template: string) {
  const supported = new Set(["responsavel", "aluno", "turma", "aula", "data", "atividades", "prazo"]);
  const unknown = [...template.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]).find(key => !supported.has(key));
  if (unknown) throw new Error(`Variável desconhecida na mensagem: {${unknown}}. Use os botões de variáveis disponíveis.`);
}
export function validateNotificationSettings(input: unknown): NotificationSettings {
  if (!input || typeof input !== "object") throw new Error("Configuração de notificações inválida.");
  const value = input as NotificationSettings;
  if (typeof value.enabled !== "boolean" || typeof value.attendance_enabled !== "boolean" || typeof value.homework_enabled !== "boolean"
    || !["off", "none_submitted", "more_than"].includes(value.classroom_rule)
    || !Number.isInteger(value.classroom_threshold) || value.classroom_threshold < 0 || value.classroom_threshold > 1000
    || !Number.isInteger(value.tolerance_minutes) || value.tolerance_minutes < 0 || value.tolerance_minutes > 43200
    || (value.homework_days_after_lesson !== null && (!Number.isInteger(value.homework_days_after_lesson) || value.homework_days_after_lesson < 0 || value.homework_days_after_lesson > 365))
    || typeof value.start_date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.start_date) || new Date(`${value.start_date}T12:00:00Z`).toISOString().slice(0, 10) !== value.start_date
    || typeof value.activity_message_template !== "string" || !value.activity_message_template.trim() || value.activity_message_template.length > 5000) throw new Error("Confira as regras, a data inicial e o modelo de mensagem.");
  const welcome = value.welcome_message_template ?? DEFAULT_WELCOME_MESSAGE;
  validateWelcomeMessage(welcome);
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: value.time_zone }).format(); } catch { throw new Error("Fuso horário inválido."); }
  return { id: "default", enabled: value.enabled, attendance_enabled: value.attendance_enabled, classroom_rule: value.classroom_rule, classroom_threshold: value.classroom_threshold, homework_enabled: value.homework_enabled, tolerance_minutes: value.tolerance_minutes, homework_days_after_lesson: value.homework_days_after_lesson, start_date: value.start_date, time_zone: value.time_zone, activity_message_template: value.activity_message_template.trim(), welcome_message_template: welcome.trim() };
}
export type NotificationLesson = {
  source: "manual" | "kodland";
  class_id: string; class_name: string;
  student_id: string; student_name: string;
  occurrence_id: string; lesson_label: string; lesson_date: string;
  ended_at: string | null;
  active: boolean; cancelled: boolean;
  attendance: "absent" | "other" | "unknown";
  guardian_name: string; guardian_phone: string;
  recording_url?: string;
  classroom_inventory?: string[];
};
/** Only explicit assignment/status data belong here. A review queue is not an inventory. */
export type NotificationObligation = {
  id: string; source: "manual" | "kodland"; class_id: string; student_id: string; occurrence_id: string;
  title: string; kind: ActivityKind; due_at: string | null;
  state: "missing" | "delivered" | "unknown";
  required: boolean; exempt: boolean; external_task_id?: string;
};
export type StudentNotification = NotificationLesson & {
  id: string; category: NotificationCategory; revision: string;
  reason: string; activities: { id: string; title: string; due_at: string | null }[];
};
const identity = (item: Pick<NotificationLesson, "source" | "class_id" | "student_id" | "occurrence_id">) => JSON.stringify([item.source, item.class_id, item.student_id, item.occurrence_id]);
export const notificationCaseId = (item: NotificationLesson, category: NotificationCategory) => encodeURIComponent(JSON.stringify([item.source, item.class_id, item.student_id, item.occurrence_id, category]));
/** Convert a civil date/time using the selected IANA zone; reject malformed or nonexistent civil times. */
export function notificationLocalInstant(date: string, time: string, zone: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const target = Date.parse(`${date}T${time}:00Z`);
  if (!Number.isFinite(target) || new Date(target).toISOString().slice(0, 10) !== date) return null;
  try {
    const format = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    const civil = (instant: number) => { const parts = Object.fromEntries(format.formatToParts(instant).map(part => [part.type, part.value])); return Date.parse(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}Z`); };
    let value = target;
    for (let index = 0; index < 3; index++) value += target - civil(value);
    return civil(value) === target ? new Date(value).toISOString() : null;
  } catch { return null; }
}
/** Resolve deadlines using exactly the same policy as alert evaluation. */
function obligationDeadline(item: NotificationObligation, lesson: NotificationLesson, settings: NotificationSettings): number | null {
  let due = Date.parse(item.due_at ?? "");
  if (!Number.isFinite(due) && item.kind === "homework" && settings.homework_days_after_lesson !== null) {
    const date = new Date(lesson.lesson_date + "T12:00:00Z"); date.setUTCDate(date.getUTCDate() + settings.homework_days_after_lesson);
    due = Date.parse(notificationLocalInstant(date.toISOString().slice(0, 10), "23:59", settings.time_zone) ?? "");
  }
  return Number.isFinite(due) ? due : null;
}
/** Next instant when cached data can change alerts, without another source lookup. */
export function nextStudentNotificationEvaluationAt(lessons: readonly NotificationLesson[], obligations: readonly NotificationObligation[], settings: NotificationSettings, now: number): number | null {
  if (!settings.enabled) return null;
  let next: number | null = null;
  const remember = (at: number) => { if (Number.isFinite(at) && at > now) next = next === null ? at : Math.min(next, at); };
  const tolerance = settings.tolerance_minutes * 60000;
  const grouped = new Map<string, NotificationObligation[]>();
  for (const item of obligations) {
    if (!item.required || item.exempt || item.state !== "missing") continue;
    const key = identity(item); const values = grouped.get(key) ?? []; values.push(item); grouped.set(key, values);
  }
  for (const lesson of lessons) {
    const ended = Date.parse(lesson.ended_at ?? "");
    if (!lesson.active || lesson.cancelled || lesson.lesson_date < settings.start_date || !Number.isFinite(ended)) continue;
    if (settings.attendance_enabled && lesson.attendance === "absent") remember(ended + tolerance);
    for (const item of grouped.get(identity(lesson)) ?? []) {
      if (item.kind === "classroom" && settings.classroom_rule !== "off") {
        const due = obligationDeadline(item, lesson, settings);
        if (!item.due_at || due !== null) remember(Math.max(ended + tolerance, due === null ? -Infinity : due + tolerance));
      }
      if (item.kind === "homework" && settings.homework_enabled) {
        const due = obligationDeadline(item, lesson, settings);
        if (due !== null) remember(Math.max(ended + tolerance, due + tolerance));
      }
    }
  }
  return next;
}
export function notificationLessonEnd(date: string, start: string | undefined, end: string | undefined, zone: string): string | null {
  const ended = notificationLocalInstant(date, end?.slice(0, 5) ?? "", zone);
  const started = notificationLocalInstant(date, start?.slice(0, 5) ?? "", zone);
  if (!ended || !started || Date.parse(ended) > Date.parse(started)) return ended;
  if (ended === started) return null;
  const next = new Date(`${date}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return notificationLocalInstant(next.toISOString().slice(0, 10), end!.slice(0, 5), zone);
}
export type NotificationCoverage = { manual: boolean; attendance: string[]; activities: string[] };
export function notificationCovered(item: Pick<StudentNotification, "source" | "class_id" | "category">, coverage?: NotificationCoverage) {
  return !coverage || (item.source === "manual" ? coverage.manual : (item.category === "absence" ? coverage.attendance : coverage.activities).includes(item.class_id));
}
export function evaluateStudentNotifications(lessons: readonly NotificationLesson[], obligations: readonly NotificationObligation[], settings: NotificationSettings, now: Date): StudentNotification[] {
  if (!settings.enabled) return [];
  const grouped = new Map<string, NotificationObligation[]>();
  for (const item of obligations) { const key = identity(item); const list = grouped.get(key) ?? []; if (!list.some(prior => prior.id === item.id)) list.push(item); grouped.set(key, list); }
  const latest = new Map<string, number>();
  for (const lesson of lessons) {
    const end = Date.parse(lesson.ended_at ?? "");
    if (lesson.source === "kodland" && lesson.active && !lesson.cancelled && end <= now.getTime()) latest.set(lesson.class_id, Math.max(latest.get(lesson.class_id) ?? 0, end));
  }
  const result = new Map<string, StudentNotification>();
  for (const lesson of lessons) {
    const ended = Date.parse(lesson.ended_at ?? "");
    if (!lesson.active || lesson.cancelled || lesson.lesson_date < settings.start_date || !Number.isFinite(ended) || ended + settings.tolerance_minutes * 60000 > now.getTime()) continue;
    const add = (category: NotificationCategory, reason: string, activities: NotificationObligation[] = []) => {
      const id = notificationCaseId(lesson, category);
      const sorted = [...activities].sort((a, b) => a.id.localeCompare(b.id));
      result.set(id, { ...lesson, id, category, reason, revision: category === "absence" ? "absence" : JSON.stringify(sorted.map(item => item.id)), activities: sorted.map(item => ({ id: item.id, title: item.title, due_at: item.due_at })) });
    };
    const lastClass = lesson.source !== "kodland" || ended === latest.get(lesson.class_id);
    if (lastClass && settings.attendance_enabled && lesson.attendance === "absent") add("absence", "Falta sem justificativa: entrar em contato com o responsável.");
    const assigned = (grouped.get(identity(lesson)) ?? []).filter(item => item.required && !item.exempt);
    const classroom = assigned.filter(item => item.kind === "classroom");
    const due = (item: NotificationObligation) => !item.due_at || (Number.isFinite(Date.parse(item.due_at)) && Date.parse(item.due_at) + settings.tolerance_minutes * 60000 <= now.getTime());
    const missing = classroom.filter(item => item.state === "missing" && due(item));
    // A verified classroom inventory permits unrelated unknown tasks, but never missing/unknown records for a required classroom task.
    const inventoryComplete = lesson.classroom_inventory
      ? lesson.classroom_inventory.length > 0 && lesson.classroom_inventory.every(id => classroom.some(item => item.external_task_id === id))
      : !assigned.some(item => item.kind === "unknown");
    // Unknown delivery states still prevent an assertion that nothing was delivered.
    if (lastClass && settings.classroom_rule === "none_submitted" && inventoryComplete && classroom.length > 0 && missing.length === classroom.length) add("classroom", "Nenhuma atividade da aula foi entregue.", missing);
    if (lastClass && settings.classroom_rule === "more_than" && missing.length > settings.classroom_threshold) add("classroom", `${missing.length} atividades da aula não entregues.`, missing);
    if (settings.homework_enabled) {
      const overdue = assigned.filter(item => {
        if (item.kind !== "homework" || item.state !== "missing") return false;
        const due = obligationDeadline(item, lesson, settings);
        return due !== null && due + settings.tolerance_minutes * 60000 <= now.getTime();
      });
      if (overdue.length) add("homework", `${overdue.length} atividade(s) de casa com prazo vencido.`, overdue);
    }
  }
  return [...result.values()].sort((a, b) => b.lesson_date.localeCompare(a.lesson_date) || a.student_name.localeCompare(b.student_name));
}
export type NotificationCase = {
  id: string; notification: StudentNotification; active: boolean;
  read_revision: string | null; confirmed_revisions: string[];
  first_seen_at: string; updated_at: string; contact_confirmed_at: string | null;
  reconciled_at?: string;
};
export const needsNotificationContact = (item: NotificationCase) => item.active && !item.confirmed_revisions.includes(item.notification.revision);
export function notificationTarget(item: StudentNotification, demo = false) {
  const params = new URLSearchParams({ tab: item.category === "absence" ? "attendance" : "activities", source: item.source, class: item.class_id, student: item.student_id, occurrence: item.occurrence_id, notification: item.id });
  return demo ? `/demo?${params}#classes` : `/classes?${params}`;
}
export function notificationMessage(item: StudentNotification, template: string) {
  const values: Record<string, string> = { responsavel: item.guardian_name || "responsável", aluno: item.student_name, turma: item.class_name, aula: item.lesson_label, data: item.lesson_date.split("-").reverse().join("/"), atividades: item.activities.map(activity => activity.title).join(", "), prazo: item.activities.map(activity => activity.due_at).filter(Boolean).join(", "), gravacao: item.recording_url || "", primeiro_nome: item.student_name.split(" ")[0] || "aluno", codigo_aula: item.lesson_label };
  const prepared = item.category === "absence" ? renderAbsenceMessage({ template, studentName: item.student_name, lessonCode: item.lesson_label, date: item.lesson_date.split("-").reverse().join("/"), recordingUrl: item.recording_url }) : template;
  return prepared.replace(/\{([a-z_]+)\}/g, (token, key: string) => values[key] ?? token);
}
