export type ManualLessonContent = {
  id: string;
  class_id: string;
  /** Null means the content is shared by the entire class. */
  occurrence_id: string | null;
  title: string;
  content: string;
  guide: string;
  links: { label: string; url: string }[];
  created_at: string;
  updated_at: string;
};

export type ManualActivity = {
  id: string;
  class_id: string;
  student_id: string;
  occurrence_id: string;
  title: string;
  description: string;
  submission_text: string;
  submission_url: string;
  feedback: string;
  status: "assigned" | "submitted" | "corrected" | "pending" | "completed";
  /** Legacy activities remain unknown until the teacher classifies them. */
  kind?: "classroom" | "homework" | "unknown";
  due_at?: string | null;
  required?: boolean;
  exempt?: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualActivityNotificationFields = Pick<ManualActivity, "kind" | "due_at" | "required" | "exempt">;
export function manualActivityNotificationFields(input: ManualActivityNotificationFields, previous: ManualActivityNotificationFields = {}): Required<ManualActivityNotificationFields> {
  const kind = input.kind ?? previous.kind ?? "unknown";
  const due_at = input.due_at !== undefined ? input.due_at : previous.due_at ?? null;
  const required = input.required ?? previous.required ?? true;
  const exempt = input.exempt ?? previous.exempt ?? false;
  if (!["classroom", "homework", "unknown"].includes(kind) || typeof required !== "boolean" || typeof exempt !== "boolean"
    || (due_at !== null && (typeof due_at !== "string" || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(due_at) || !Number.isFinite(Date.parse(due_at))))) throw new Error("Confira o tipo, o prazo e a dispensa da atividade.");
  return { kind, due_at, required, exempt };
}

export const isHttpUrl = (value: string) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
};

export const pendingManualActivities = (items: readonly ManualActivity[]) =>
  items.filter((item) => (item.status === "submitted" || item.status === "pending") && Boolean(item.submission_text.trim() || item.submission_url.trim()));
