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
  created_at: string;
  updated_at: string;
};

export const isHttpUrl = (value: string) => {
  try { return ["http:", "https:"].includes(new URL(value).protocol); }
  catch { return false; }
};

export const pendingManualActivities = (items: readonly ManualActivity[]) =>
  items.filter((item) => (item.status === "submitted" || item.status === "pending") && Boolean(item.submission_text.trim() || item.submission_url.trim()));
