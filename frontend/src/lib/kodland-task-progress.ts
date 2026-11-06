/** Allowlisted progress only; never persist a provider response or student credentials. */
export type KodlandTaskProgress = {
  id: string; external_class_id: string; external_student_id: string;
  lesson_id: string; task_id: string; task_title: string;
  task_url?: string;
  state: "missing" | "submitted" | "corrected" | "delivered" | "not_graded" | "unknown";
};
export function kodlandDeliveryState(status: unknown): KodlandTaskProgress["state"] {
  if (status === "TASK_NOT_SUBMITTED") return "missing";
  if (["TASK_SUBMITTED", "TASK_SUBMITTED_LATE"].includes(String(status))) return "submitted";
  if (status === "TASK_CHECKED") return "corrected";
  if (status === "TASK_NOT_GRADED") return "not_graded";
  return "unknown";
}
export function validateKodlandTaskProgress(input: unknown): KodlandTaskProgress {
  if (!input || typeof input !== "object") throw new Error("Progresso de atividade inválido.");
  const value = input as KodlandTaskProgress;
  if (![value.id, value.external_class_id, value.external_student_id, value.lesson_id, value.task_id, value.task_title].every(field => typeof field === "string" && field.length > 0 && field.length <= 1000) || value.id.includes("/") || !["missing", "submitted", "corrected", "delivered", "not_graded", "unknown"].includes(value.state)) throw new Error("Progresso de atividade inválido.");
  let taskUrl: string | undefined;
  if (typeof value.task_url === "string" && value.task_url.length <= 2048) {
    try { const url = new URL(value.task_url); if (["https:", "http:"].includes(url.protocol)) taskUrl = url.href; } catch { /* Legacy records use the ID-based task link. */ }
  }
  return { id: value.id, external_class_id: value.external_class_id, external_student_id: value.external_student_id, lesson_id: value.lesson_id, task_id: value.task_id, task_title: value.task_title, state: value.state, ...(taskUrl ? { task_url: taskUrl } : {}) };
}
