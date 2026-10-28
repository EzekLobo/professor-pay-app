/** Allowlisted progress only; never persist a provider response or student credentials. */
export type KodlandTaskProgress = {
  id: string; external_class_id: string; external_student_id: string;
  lesson_id: string; task_id: string; task_title: string;
  state: "missing" | "delivered" | "unknown";
};
export function kodlandDeliveryState(status: unknown): KodlandTaskProgress["state"] {
  if (status === "TASK_NOT_SUBMITTED") return "missing";
  if (["TASK_SUBMITTED", "TASK_SUBMITTED_LATE", "TASK_CHECKED"].includes(String(status))) return "delivered";
  // TASK_NOT_GRADED is not evidence of an assignment requiring submission.
  return "unknown";
}
export function validateKodlandTaskProgress(input: unknown): KodlandTaskProgress {
  if (!input || typeof input !== "object") throw new Error("Progresso de atividade inválido.");
  const value = input as KodlandTaskProgress;
  if (![value.id, value.external_class_id, value.external_student_id, value.lesson_id, value.task_id, value.task_title].every(field => typeof field === "string" && field.length > 0 && field.length <= 1000) || value.id.includes("/") || !["missing", "delivered", "unknown"].includes(value.state)) throw new Error("Progresso de atividade inválido.");
  return { id: value.id, external_class_id: value.external_class_id, external_student_id: value.external_student_id, lesson_id: value.lesson_id, task_id: value.task_id, task_title: value.task_title, state: value.state };
}
