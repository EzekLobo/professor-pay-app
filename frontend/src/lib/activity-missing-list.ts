import type { NotificationSource } from "./student-notification-source";
export type ActivityTarget = { source: "kodland" | "manual"; class_id: string; student_id: string };
export type MissingActivity = { id: string; module: string; lesson: string; title: string; date: string };
const moduleOf = (label: string) => label.match(/(?:[MМ]\s*|m[oó]dulo\s*)(\d+)/i)?.[1]?.replace(/^0+(?=\d)/, "") ?? "unknown";
export function missingActivityList(source: NotificationSource, target: ActivityTarget, now = new Date()) {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const lessons = source.lessons.filter(item => item.source === target.source && item.class_id === target.class_id && item.student_id === target.student_id && item.active && !item.cancelled && item.lesson_date && (item.lesson_date < today || (item.lesson_date === today && Boolean(item.ended_at) && Date.parse(item.ended_at!) <= now.getTime()))).sort((a, b) => b.lesson_date.localeCompare(a.lesson_date) || (b.ended_at ?? "").localeCompare(a.ended_at ?? ""));
  const currentModule = lessons[0] ? moduleOf(lessons[0].lesson_label) : "unknown";
  const items: MissingActivity[] = [];
  const seen = new Set<string>();
  for (const obligation of source.obligations) {
    if (obligation.source !== target.source || obligation.class_id !== target.class_id || obligation.student_id !== target.student_id || obligation.state !== "missing" || !obligation.required || obligation.exempt || seen.has(obligation.id)) continue;
    const lesson = lessons.find(item => item.occurrence_id === obligation.occurrence_id);
    if (!lesson || !(lesson.lesson_date < today || (lesson.ended_at && Date.parse(lesson.ended_at) <= now.getTime()))) continue;
    seen.add(obligation.id);
    items.push({ id: obligation.id, module: moduleOf(lesson.lesson_label), lesson: lesson.lesson_label, title: obligation.title, date: lesson.lesson_date });
  }
  items.sort((a,b) => a.date.localeCompare(b.date) || a.lesson.localeCompare(b.lesson,"pt-BR",{numeric:true}) || a.title.localeCompare(b.title,"pt-BR",{numeric:true}));
  const modules = [...new Set([currentModule, ...lessons.map(item => moduleOf(item.lesson_label)), ...items.map(item => item.module)])].sort((a,b) => a.localeCompare(b,"pt-BR",{numeric:true}));
  return { currentModule, modules, items };
}
export const activityModuleLabel = (module: string) => module === "all" ? "Todos os módulos" : module === "unknown" ? "Sem módulo identificado" : `Módulo ${module}`;
export function missingActivityMessage(items: readonly MissingActivity[], module: string) {
  const selected = items.filter(item => module === "all" || item.module === module);
  return selected.length ? `Atividades não feitas — ${activityModuleLabel(module)}:\n${selected.map(item => `• ${item.lesson} — ${item.title}`).join("\n")}` : "";
}
