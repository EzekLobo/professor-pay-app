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
};
export const DEFAULT_ACTIVITY_MESSAGE = "Olá, {responsavel}! Gostaria de conversar sobre {aluno}, da turma {turma}. Há atividades não entregues da aula {aula} ({data}): {atividades}. Como podemos ajudar?";
export function defaultNotificationSettings(today = new Date().toISOString().slice(0, 10)): NotificationSettings {
  return { id: "default", enabled: false, attendance_enabled: true, classroom_rule: "none_submitted", classroom_threshold: 2, homework_enabled: true, tolerance_minutes: 0, homework_days_after_lesson: null, start_date: today, time_zone: "America/Sao_Paulo", activity_message_template: DEFAULT_ACTIVITY_MESSAGE };
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
  try { new Intl.DateTimeFormat("pt-BR", { timeZone: value.time_zone }).format(); } catch { throw new Error("Fuso horário inválido."); }
  return { id: "default", enabled: value.enabled, attendance_enabled: value.attendance_enabled, classroom_rule: value.classroom_rule, classroom_threshold: value.classroom_threshold, homework_enabled: value.homework_enabled, tolerance_minutes: value.tolerance_minutes, homework_days_after_lesson: value.homework_days_after_lesson, start_date: value.start_date, time_zone: value.time_zone, activity_message_template: value.activity_message_template.trim() };
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
};
/** Only explicit assignment/status data belong here. A review queue is not an inventory. */
export type NotificationObligation = {
  id: string; source: "manual" | "kodland"; class_id: string; student_id: string; occurrence_id: string;
  title: string; kind: ActivityKind; due_at: string | null;
  state: "missing" | "delivered" | "unknown";
  required: boolean; exempt: boolean;
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
export function evaluateStudentNotifications(lessons: readonly NotificationLesson[], obligations: readonly NotificationObligation[], settings: NotificationSettings, now: Date): StudentNotification[] {
  if (!settings.enabled) return [];
  const grouped = new Map<string, NotificationObligation[]>();
  for (const item of obligations) { const key = identity(item); const list = grouped.get(key) ?? []; if (!list.some(prior => prior.id === item.id)) list.push(item); grouped.set(key, list); }
  const result = new Map<string, StudentNotification>();
  for (const lesson of lessons) {
    const ended = Date.parse(lesson.ended_at ?? "");
    if (!lesson.active || lesson.cancelled || lesson.lesson_date < settings.start_date || !Number.isFinite(ended) || ended + settings.tolerance_minutes * 60000 > now.getTime()) continue;
    const add = (category: NotificationCategory, reason: string, activities: NotificationObligation[] = []) => {
      const id = notificationCaseId(lesson, category);
      const sorted = [...activities].sort((a, b) => a.id.localeCompare(b.id));
      result.set(id, { ...lesson, id, category, reason, revision: category === "absence" ? "absence" : JSON.stringify(sorted.map(item => item.id)), activities: sorted.map(item => ({ id: item.id, title: item.title, due_at: item.due_at })) });
    };
    if (settings.attendance_enabled && lesson.attendance === "absent") add("absence", "Falta sem justificativa: entrar em contato com o responsável.");
    const assigned = (grouped.get(identity(lesson)) ?? []).filter(item => item.required && !item.exempt);
    const classroom = assigned.filter(item => item.kind === "classroom");
    const due = (item: NotificationObligation) => !item.due_at || (Number.isFinite(Date.parse(item.due_at)) && Date.parse(item.due_at) + settings.tolerance_minutes * 60000 <= now.getTime());
    const missing = classroom.filter(item => item.state === "missing" && due(item));
    // Unknown statuses prevent an assertion that absolutely nothing was delivered.
    if (settings.classroom_rule === "none_submitted" && !assigned.some(item => item.kind === "unknown") && classroom.length > 0 && missing.length === classroom.length) add("classroom", "Nenhuma atividade da aula foi entregue.", missing);
    if (settings.classroom_rule === "more_than" && missing.length > settings.classroom_threshold) add("classroom", `${missing.length} atividades da aula não entregues.`, missing);
    if (settings.homework_enabled) {
      const overdue = assigned.filter(item => {
        if (item.kind !== "homework" || item.state !== "missing") return false;
        let due = Date.parse(item.due_at ?? "");
        if (!Number.isFinite(due) && settings.homework_days_after_lesson !== null) {
          const date = new Date(`${lesson.lesson_date}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + settings.homework_days_after_lesson);
          due = Date.parse(notificationLocalInstant(date.toISOString().slice(0, 10), "23:59", settings.time_zone) ?? "");
        }
        return Number.isFinite(due) && due + settings.tolerance_minutes * 60000 <= now.getTime();
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
};
export const needsNotificationContact = (item: NotificationCase) => item.active && !item.confirmed_revisions.includes(item.notification.revision);
export function notificationTarget(item: StudentNotification, demo = false) {
  const params = new URLSearchParams({ tab: item.category === "absence" ? "attendance" : "activities", source: item.source, class: item.class_id, student: item.student_id, occurrence: item.occurrence_id, notification: item.id });
  return demo ? `/demo?${params}#corrections` : `/corrections?${params}`;
}
export function notificationMessage(item: StudentNotification, template: string) {
  const values: Record<string, string> = { responsavel: item.guardian_name || "responsável", aluno: item.student_name, turma: item.class_name, aula: item.lesson_label, data: item.lesson_date.split("-").reverse().join("/"), atividades: item.activities.map(activity => activity.title).join(", "), prazo: item.activities.map(activity => activity.due_at).filter(Boolean).join(", "), gravacao: item.recording_url || "", primeiro_nome: item.guardian_name.split(" ")[0] || "responsável", codigo_aula: item.lesson_label };
  return template.replace(/\{([a-z_]+)\}/g, (token, key: string) => values[key] ?? token);
}
