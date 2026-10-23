import { manualCourseLessons, type ManualCourse } from "./manual-courses";
import { generateRecurringOccurrences, type RatePeriod } from "./teaching-finance";
import type { ManualClass } from "./manual-teaching";

export const DEFAULT_ABSENCE_MESSAGE = [
  "Olá, {primeiro_nome}! 👋",
  "",
  "Sentimos sua falta na aula {codigo_aula}, em {data}. Aconteceu alguma coisa?",
  "",
  "{gravacao}",
  "",
  "Se precisar de ajuda, pode contar comigo!",
].join("\n");

export type TutorPreferences = {
  id: "preferences";
  default_duration_minutes: number;
  default_payment_day: number;
  kodland_enabled: boolean;
  absence_message_template: string;
  onboarding_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualOccurrenceStatus = "planned" | "held" | "cancelled" | "rescheduled";
export type ManualCurriculumMode = "automatic" | "override" | "skip";

export type ManualOccurrence = {
  id: string;
  recurrence_id: string;
  class_id: string;
  slot_id: string;
  lesson_date: string;
  start_time: string;
  duration_minutes: number;
  hourly_rate_cents: number;
  payment_date: string;
  course_lesson_id: string | null;
  course_code: string;
  curriculum_mode?: ManualCurriculumMode;
  title_snapshot: string;
  status: ManualOccurrenceStatus;
  replacement_for_id: string | null;
  recording_url: string;
  content: string;
  guide: string;
  slides_url: string;
  homework: string;
  notes: string;
  created_at: string;
  updated_at: string;
};

export type ManualAttendanceStatus = "UNMARKED" | "PRESENT" | "EXCUSED" | "ABSENT";

export type ManualAttendance = {
  id: string;
  occurrence_id: string;
  class_id: string;
  student_id: string;
  status: ManualAttendanceStatus;
  note: string;
  created_at: string;
  updated_at: string;
};

export type ManualAvailability = {
  id: string;
  week_day: number;
  start_time: string;
  end_time: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export const defaultTutorPreferences = (timestamp: string): TutorPreferences => ({
  id: "preferences",
  default_duration_minutes: 60,
  default_payment_day: 15,
  kodland_enabled: false,
  absence_message_template: DEFAULT_ABSENCE_MESSAGE,
  onboarding_completed: false,
  created_at: timestamp,
  updated_at: timestamp,
});

const occurrenceTimestamp = (date: string, time: string) => `${date}T${time}`;

export const occurrenceHorizon = (today: string, endDate?: string | null) => {
  if (endDate) return endDate;
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  return date.toISOString().slice(0, 10);
};

/** Builds a stable curriculum plan while allowing cancelled meetings to return their lesson to the queue. */
export const planManualOccurrences = ({
  classroom,
  course,
  existing = [],
  from,
  to,
  defaultRateHistory = [],
  timestamp,
}: {
  classroom: ManualClass;
  course?: ManualCourse | null;
  existing?: readonly ManualOccurrence[];
  from: string;
  to: string;
  defaultRateHistory?: readonly RatePeriod[];
  timestamp: string;
}): ManualOccurrence[] => {
  const recurring = generateRecurringOccurrences(classroom, from, to, [], defaultRateHistory)
    .sort((left, right) => occurrenceTimestamp(left.lesson_date, left.start_time)
      .localeCompare(occurrenceTimestamp(right.lesson_date, right.start_time)));
  const prior = new Map(existing.map((item) => [item.recurrence_id || item.id, item]));
  const lessons = course ? manualCourseLessons(course) : [];
  let curriculumIndex = 0;

  return recurring.map((item) => {
    const previous = prior.get(item.id);
    const automatic = lessons[curriculumIndex];
    const previousLesson = previous?.course_lesson_id
      ? lessons.find((entry) => entry.lesson.id === previous.course_lesson_id)
      : undefined;
    // Explicit substitutions stay attached to the occurrence without consuming
    // the automatic queue. A skip consumes that curriculum lesson intentionally.
    const mode = previous?.curriculum_mode ?? "automatic";
    const preserveAssignedLesson = previous?.status === "held" || mode === "override";
    const selected = mode === "skip" ? undefined : preserveAssignedLesson ? previousLesson ?? automatic : automatic ?? previousLesson;
    const status = previous?.status ?? "planned";
    if (status !== "cancelled" && status !== "rescheduled" && mode === "skip" && automatic) {
      curriculumIndex += 1;
    } else if (status !== "cancelled" && status !== "rescheduled" && selected && mode !== "override") {
      const selectedIndex = lessons.findIndex((entry) => entry.lesson.id === selected.lesson.id);
      curriculumIndex = Math.max(curriculumIndex + 1, selectedIndex + 1);
    }
    return {
      id: previous?.id ?? item.id,
      recurrence_id: item.id,
      class_id: classroom.id,
      slot_id: item.slot_id,
      lesson_date: item.lesson_date,
      start_time: item.start_time,
      duration_minutes: item.duration_minutes,
      hourly_rate_cents: item.hourly_rate_cents,
      payment_date: item.payment_date,
      course_lesson_id: mode === "skip" ? null : selected?.lesson.id ?? previous?.course_lesson_id ?? null,
      course_code: mode === "skip" ? "" : selected?.code ?? previous?.course_code ?? "",
      curriculum_mode: mode,
      title_snapshot: mode === "skip" ? "Aula do curso pulada" : preserveAssignedLesson ? previous?.title_snapshot || selected?.lesson.title || "Aula" : selected?.lesson.title || previous?.title_snapshot || "Aula",
      status,
      replacement_for_id: previous?.replacement_for_id ?? null,
      recording_url: previous?.recording_url ?? "",
      content: previous?.content ?? "",
      guide: previous?.guide || selected?.lesson.guide || "",
      slides_url: previous?.slides_url || selected?.lesson.slides || "",
      homework: previous?.homework || selected?.lesson.homework || "",
      notes: previous?.notes ?? "",
      created_at: previous?.created_at ?? timestamp,
      updated_at: previous?.updated_at ?? timestamp,
    };
  });
};

export const isBillableManualOccurrence = (item: Pick<ManualOccurrence, "status">) =>
  item.status === "planned" || item.status === "held";

export const renderAbsenceMessage = ({
  template,
  studentName,
  lessonCode,
  date,
  recordingUrl,
}: {
  template: string;
  studentName: string;
  lessonCode: string;
  date: string;
  recordingUrl?: string;
}) => {
  const firstName = studentName.trim().split(/\s+/)[0] || "aluno";
  const recording = recordingUrl?.trim()
    ? `🎥 *Para ficar por dentro do assunto, você pode acessar a aula gravada aqui:*\n${recordingUrl.trim()}`
    : "";
  return template
    .replaceAll("{primeiro_nome}", firstName)
    .replaceAll("{codigo_aula}", lessonCode || "aula")
    .replaceAll("{data}", date)
    .replaceAll("{link_gravacao}", recordingUrl?.trim() ?? "")
    .replaceAll("{gravacao}", recording)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};
