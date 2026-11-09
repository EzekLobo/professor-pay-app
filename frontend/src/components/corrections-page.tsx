"use client";
import { kodlandReadPreference } from "@/lib/kodland-read-preference";
import { reuseSyncedRows } from "@/lib/reuse-synced-rows";
import type { SyncDataDomain } from "@/lib/sync-events";
import { readKodlandLocal, watchKodlandSync } from "@/lib/kodland-sync-client";
import { WelcomeContact } from "./welcome-contact";
import { StudentContactFields } from "./student-contact-fields";
import { FavoriteFilterOptions } from "./favorite-filter-options";
import { ActivityMissingList } from "./activity-missing-list";
import type { ActivityTarget } from "@/lib/activity-missing-list";
import type { StudentNotification } from "@/lib/student-notification-rules";
import { NotificationResolution, useStudentNotifications } from "./student-notifications";
import { subscribeStudentNotifications } from "@/lib/student-notification-store";
import { notificationMessage, needsNotificationContact, DEFAULT_ACTIVITY_MESSAGE } from "@/lib/student-notification-rules";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MessageCircle, RefreshCw, List, LayoutGrid, Filter, Search, X, ClipboardCheck, Users, Presentation, FileText, BookOpen, Info, MoreVertical, ChevronDown, Percent, Settings, EyeOff, House } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import { Modal } from "@/components/modal";
import { kodlandApi, manualCoursesApi, manualOperationsApi, manualPedagogyApi, manualTeachingApi, tutorPreferencesApi, type KodlandAttendance, type KodlandGroup, type KodlandLesson, type KodlandReview, type KodlandStudent } from "@/lib/api";
import { attendanceDateFromSchedule, attendanceLessonParts, lessonForAttendance } from "@/lib/attendance-schedule";
import type { KodlandTaskProgress } from "@/lib/kodland-task-progress";
import type { ManualOccurrence } from "@/lib/manual-operations";
import type { ManualActivity } from "@/lib/manual-pedagogy";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import { pendingManualActivities } from "@/lib/manual-pedagogy";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { activeStudentsRankedByPoints, kodlandStudentPoints, isActiveKodlandStudent } from "@/lib/student-ranking";
import { whatsappUrl } from "@/lib/whatsapp";
import { ManualAttendanceGrid } from "@/components/manual-attendance-grid";
import type { ManualAdapters } from "@/lib/manual-adapters";
import { HeaderDropdown } from "@/components/header-dropdown";
import { kodlandCourseProgress } from "@/lib/course-progress";
import { attachActivityWheelScroll } from "@/lib/activity-wheel-scroll";
import { correctionUrlFor } from "@/lib/kodland-task-link";

const absoluteUrl = (value: string) => value.startsWith("/") ? `https://bo.kodland.org${value}` : value;
const lessonForReview = (review: KodlandReview, lessons: KodlandLesson[]) => lessons.find((lesson) => {
  if (lesson.external_class_id !== review.external_class_id) return false;
  if (lesson.id === review.lesson_id || lesson.source_lesson_id === review.lesson_id) return true;
  if (review.lesson_number > 0 && lesson.course_index === review.lesson_number) return true;
  return review.lesson_number > 0 && lesson.lesson_number === review.lesson_number;
});
type ReviewGrouping = "class" | "student" | "lesson";
type AttendanceFilter = "ABSENT" | "ALL" | "PRESENT";
type AttendanceStudentHistory = {
  id: string;
  name: string;
  student?: KodlandStudent;
  records: KodlandAttendance[];
};
type AttendanceColumn = {
  key: string;
  module: string;
  lesson: string;
  date: string;
  startTime: string;
  title: string;
  recordingUrl: string;
  moduleStart: boolean;
};
export type CompactActivityCell =
  | { source: "kodland"; review: KodlandReview }
  | { source: "manual"; activity: ManualActivity }
  | { source: "progress"; progress: KodlandTaskProgress };
export type CompactActivityColumn = {
  key: string;
  lessonLabel: string;
  taskLabel: string;
  sortKey: string;
  moduleLabel?: string;
  kind?: "homework" | "classroom" | "unknown";
  taskOrder?: number;
};
export type CompactActivityRow = {
  key: string;
  name: string;
  student?: KodlandStudent;
  rank?: number;
  points?: number;
  absenceCount?: number;
  manualStudent?: ManualStudent;
  cells: Record<string, CompactActivityCell>;
};
export type CompactActivityClass = {
  key: string;
  name: string;
  courseName?: string;
  completedLessons?: number;
  totalLessons?: number;
  currentLessonNumber?: number;
  completionPercent?: number | null;
  pendingCount?: number;
  columns: CompactActivityColumn[];
  rows: CompactActivityRow[];
};
export type CompactActivitiesModel = CompactActivityClass[];
type WhatsAppDraft = { studentName: string; phone: string; message: string; guardian?: boolean; studentPhone?: string; guardianPhone?: string; phoneEdited?: boolean; activityTarget?: ActivityTarget };
export function refreshWhatsAppDraftContact(draft: WhatsAppDraft, student: Pick<KodlandStudent, "phone" | "student_phone">): WhatsAppDraft {
  const guardianPhone = student.phone || draft.guardianPhone || "";
  const studentPhone = student.student_phone || draft.studentPhone || "";
  return { ...draft, guardianPhone, studentPhone, phone: draft.phoneEdited ? draft.phone : draft.guardian === false ? studentPhone : guardianPhone };
}
const lessonLabel = (review: KodlandReview, lessons: KodlandLesson[]) =>
  `${compactKodlandLessonLabel(review, lessons)}: ${review.lesson_title || "Sem título"}`;
const groupBy = <T,>(items: T[], keyFor: (item: T) => string) =>
  [...items.reduce((groups, item) => {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
    return groups;
  }, new Map<string, T[]>())].sort(([first], [second]) =>
    first.localeCompare(second, "pt-BR"),
  );

type CompactActivityClassDraft = {
  key: string;
  name: string;
  courseName?: string;
  completedLessons?: number;
  totalLessons?: number;
  currentLessonNumber?: number;
  columns: Map<string, CompactActivityColumn>;
  rows: Map<string, CompactActivityRow>;
};

const compactManualLessonLabel = (activity: ManualActivity) => {
  const occurrence = activity.occurrence_id.split(":").at(-1)?.trim();
  return occurrence ? `Aula ${occurrence}` : "Aula";
};

const compactKodlandLessonLabel = (review: KodlandReview, lessons: KodlandLesson[]) => {
  const scheduledLesson = lessonForReview(review, lessons);
  const parts = attendanceLessonParts({
    external_class_id: review.external_class_id,
    lesson_id: scheduledLesson?.id ?? review.lesson_id,
    lesson_title: scheduledLesson?.title ?? review.lesson_title,
  } as KodlandAttendance, lessons);
  return parts.module ? `${parts.module}${parts.lesson}` : review.lesson_title || "Aula";
};

function activityProgressLabel(state: KodlandTaskProgress["state"]) {
  if (state === "missing") return "Sem fazer";
  if (state === "submitted") return "Feita, aguardando correção";
  if (state === "corrected") return "Corrigida";
  if (state === "delivered") return "Entregue; situação da correção não informada";
  if (state === "not_graded") return "Atividade sem avaliação";
  return "Situação não informada pela Kodland";
}
const taskIdInUrl = (url?: string) => String(url ?? "").match(/\/task\/([^/?#]+)(?:[/?#]|$)/)?.[1] ?? "";
function lessonTaskKind(lesson: KodlandLesson | undefined, taskId: string): CompactActivityColumn["kind"] {
  if (!lesson || !taskId) return "unknown";
  const homework = taskIdInUrl(lesson.homework_url) === taskId;
  const classroom = lesson.classroom_tasks?.some(task => taskIdInUrl(task.url) === taskId) ?? false;
  return homework === classroom ? "unknown" : homework ? "homework" : "classroom";
}
function lessonTaskOrder(lesson: KodlandLesson | undefined, taskId: string, fallback = 0): number | undefined {
  const index = lesson?.classroom_tasks?.findIndex(task => taskIdInUrl(task.url) === taskId) ?? -1;
  return index >= 0 ? index + 1 : fallback > 0 ? fallback : undefined;
}
/** Newest modules first; lessons and tasks follow their order within each module. */
export function activityModules(columns: readonly CompactActivityColumn[]): CompactActivityColumn[][] {
  const groups = new Map<string, CompactActivityColumn[]>();
  for (const column of columns) {
    const key = column.moduleLabel?.match(/^M\d+$/i)?.[0].toUpperCase() ?? "";
    groups.set(key, [...(groups.get(key) ?? []), column]);
  }
  return [...groups.entries()].sort(([a], [b]) => (Number(b.slice(1)) || 0) - (Number(a.slice(1)) || 0)).map(([, items]) => [...items].sort((a, b) => {
    const lesson = (value: string) => Number(value.match(/L(\d+)/i)?.[1] ?? 0);
    return lesson(a.lessonLabel) - lesson(b.lessonLabel)
      || a.lessonLabel.localeCompare(b.lessonLabel, "pt-BR", { numeric: true })
      || Number(a.kind === "homework") - Number(b.kind === "homework")
      || (a.taskOrder ?? Number.MAX_SAFE_INTEGER) - (b.taskOrder ?? Number.MAX_SAFE_INTEGER)
      || a.sortKey.localeCompare(b.sortKey, "pt-BR", { numeric: true });
  }));
}

/**
 * Transforms the pending work queue into the same matrix shape used by
 * attendance: class -> student rows -> lesson/task columns. The model keeps
 * all active students when requested, or only students with pending cells.
 */
export function compactActivitiesModel({
  reviews,
  lessons,
  manualActivities,
  groups,
  students,
  manualClasses,
  manualStudents,
  pendingOnly = false,
  manualCourseNames = {},
  taskProgress = [],
  attendance = [],
  manualOccurrences = [],
  complete = false,
}: {
  taskProgress?: readonly KodlandTaskProgress[];
  attendance?: readonly KodlandAttendance[];
  manualOccurrences?: readonly ManualOccurrence[];
  complete?: boolean;
  manualCourseNames?: Record<string, string>;
  reviews: readonly KodlandReview[];
  lessons: readonly KodlandLesson[];
  manualActivities: readonly ManualActivity[];
  groups: readonly KodlandGroup[];
  students: readonly KodlandStudent[];
  manualClasses: readonly ManualClass[];
  manualStudents: readonly ManualStudent[];
  pendingOnly?: boolean;
}): CompactActivitiesModel {
  const drafts = new Map<string, CompactActivityClassDraft>();
  const ensureClass = (key: string, name: string) => {
    const current = drafts.get(key);
    if (current) return current;
    const draft: CompactActivityClassDraft = { key, name, columns: new Map(), rows: new Map() };
    drafts.set(key, draft);
    return draft;
  };
  const ensureRow = (draft: CompactActivityClassDraft, key: string, name: string) => {
    const current = draft.rows.get(key);
    if (current) return current;
    const row: CompactActivityRow = { key, name: name || "Aluno", cells: {} };
    draft.rows.set(key, row);
    return row;
  };

  const groupsByExternalId = new Map(groups.map((group) => [group.external_id, group]));
  const reviewsByClass = new Map<string, KodlandReview[]>();
  for (const review of reviews) {
    const key = review.external_class_id || review.external_class_name || "unknown";
    reviewsByClass.set(key, [...(reviewsByClass.get(key) ?? []), review]);
  }
  for (const group of groups) if (!reviewsByClass.has(group.external_id)) reviewsByClass.set(group.external_id, []);
  for (const [externalClassId, classReviews] of reviewsByClass) {
    const group = groupsByExternalId.get(externalClassId);
    const draft = ensureClass(`kodland:${externalClassId}`, group?.title || classReviews[0]?.external_class_name || "Turma Kodland");
    draft.courseName = group?.course_name;
    const progress = kodlandCourseProgress(group, lessons.filter(item => item.external_class_id === externalClassId));
    draft.totalLessons = progress.total;
    draft.completedLessons = progress.completed;
    draft.currentLessonNumber = progress.completed;
    for (const [index, student] of activeStudentsRankedByPoints(students.filter((item) => item.external_class_id === externalClassId)).entries()) {
      const row = ensureRow(draft, student.external_id || student.id, student.name);
      row.student = student; row.rank = index + 1; row.points = kodlandStudentPoints(student.progress_summary);
      row.absenceCount = new Set(attendance.filter(item => item.external_class_id === externalClassId && item.external_student_id === student.external_id && item.status === "ABSENT").map(item => item.lesson_id || `${item.lesson_date}:${item.start_time}`)).size;
    }
    for (const review of classReviews) {
      const studentKey = review.external_student_id || review.student_name || review.id;
      const row = ensureRow(draft, studentKey, review.student_name);
      const matchedLesson = lessonForReview(review, [...lessons]);
      const lessonKey = matchedLesson?.source_lesson_id || matchedLesson?.id || review.lesson_id || String(review.lesson_number) || review.lesson_title;
      const taskKey = review.task_id || `${review.task_number}:${review.task_title}`;
      const key = `kodland:${lessonKey}:${taskKey}`;
      if (!draft.columns.has(key)) {
        const lessonLabel = compactKodlandLessonLabel(review, [...lessons]);
        draft.columns.set(key, {
          key,
          lessonLabel,
          moduleLabel: lessonLabel.match(/^M\d+/)?.[0],
          taskLabel: `${review.task_number ? `${review.task_number}. ` : ""}${review.task_title || "Atividade"}`,
          kind: lessonTaskKind(matchedLesson, review.task_id),
          taskOrder: lessonTaskOrder(matchedLesson, review.task_id, review.task_number),
          sortKey: `${String(review.lesson_number).padStart(5, "0")}:${String(review.task_number).padStart(5, "0")}:${review.lesson_title}:${review.task_title}`,
        });
      }
      row.cells[key] ??= { source: "kodland", review };
    }
    if (complete && !pendingOnly) for (const progress of taskProgress.filter(item => item.external_class_id === externalClassId)) {
      const rosterStudent = students.find(item => item.external_class_id === externalClassId && item.external_id === progress.external_student_id);
      if (rosterStudent && !isActiveKodlandStudent(rosterStudent.status)) continue;
      const row = ensureRow(draft, progress.external_student_id, rosterStudent?.name || "Aluno");
      const catalog = lessons.find(item => item.external_class_id === externalClassId && (item.id === progress.lesson_id || item.source_lesson_id === progress.lesson_id));
      const existing = [...draft.columns.values()].find(column => {
        const cell = row.cells[column.key];
        return cell?.source === "kodland" && cell.review.task_id === progress.task_id && (cell.review.lesson_id === progress.lesson_id || lessonForReview(cell.review, [...lessons])?.id === catalog?.id && Boolean(catalog));
      });
      const key = existing?.key || `kodland:${catalog?.source_lesson_id || catalog?.id || progress.lesson_id}:${progress.task_id}`;
      const parts = attendanceLessonParts({ external_class_id: externalClassId, lesson_id: catalog?.id || progress.lesson_id, lesson_title: catalog?.title || "Aula" } as KodlandAttendance, [...lessons]);
      const label = parts.module ? `${parts.module}${parts.lesson}` : catalog?.title || "Aula";
      if (!draft.columns.has(key)) draft.columns.set(key, { key, lessonLabel: label, moduleLabel: parts.module || undefined, taskLabel: progress.task_title, kind: lessonTaskKind(catalog, progress.task_id), taskOrder: lessonTaskOrder(catalog, progress.task_id), sortKey: `${String(catalog?.course_index || catalog?.lesson_number || 0).padStart(5, "0")}:00000:${progress.task_title}` });
      row.cells[key] ??= { source: "progress", progress };
    }
  }

  const manualClassesById = new Map(manualClasses.map((item) => [item.id, item]));
  const manualStudentsById = new Map(manualStudents.map((item) => [item.id, item]));
  const activitiesByClass = new Map<string, ManualActivity[]>();
  for (const activity of complete && !pendingOnly ? manualActivities : pendingManualActivities(manualActivities)) {
    activitiesByClass.set(activity.class_id, [...(activitiesByClass.get(activity.class_id) ?? []), activity]);
  }
  for (const item of manualClasses) if (!activitiesByClass.has(item.id)) activitiesByClass.set(item.id, []);
  for (const [classId, classActivities] of activitiesByClass) {
    const manualClass = manualClassesById.get(classId);
    const draft = ensureClass(`manual:${classId}`, manualClass?.name || "Turma própria");
    draft.courseName = manualCourseNames[manualClass?.course_id ?? ""];
    const classOccurrences = manualOccurrences.filter(item => item.class_id === classId && item.status !== "cancelled" && item.status !== "rescheduled");
    draft.totalLessons = classOccurrences.length;
    draft.completedLessons = classOccurrences.filter(item => item.status === "held").length;
    draft.currentLessonNumber = draft.completedLessons;
    for (const studentId of manualClass?.student_ids ?? []) {
      const student = manualStudentsById.get(studentId);
      if (student?.active) { const row = ensureRow(draft, student.id, student.name); row.manualStudent = student; }
    }
    for (const activity of classActivities) {
      const student = manualStudentsById.get(activity.student_id);
      const row = ensureRow(draft, activity.student_id || activity.id, student?.name || "Aluno");
      const key = `manual:${activity.occurrence_id}:${activity.title.trim().toLocaleLowerCase("pt-BR")}`;
      if (!draft.columns.has(key)) {
        draft.columns.set(key, {
          key,
          lessonLabel: manualOccurrences.find(item => item.id === activity.occurrence_id)?.course_code || compactManualLessonLabel(activity),
          moduleLabel: manualOccurrences.find(item => item.id === activity.occurrence_id)?.course_code.match(/^M\d+/)?.[0],
          taskLabel: activity.title || "Atividade",
          kind: activity.kind ?? "unknown",
          sortKey: `${activity.occurrence_id}:${activity.title}`,
        });
      }
      row.cells[key] ??= { source: "manual", activity };
    }
  }

  return [...drafts.values()].map((draft) => ({
    key: draft.key,
    name: draft.name,
    courseName: draft.courseName,
    completedLessons: draft.completedLessons,
    totalLessons: draft.totalLessons,
    currentLessonNumber: draft.currentLessonNumber,
    completionPercent: draft.totalLessons && draft.currentLessonNumber != null ? Math.round(draft.currentLessonNumber * 100 / draft.totalLessons) : null,
    pendingCount: [...draft.rows.values()].reduce((count, row) => count + Object.values(row.cells).filter(cell => cell.source === "kodland" || cell.source === "manual" && pendingManualActivities([cell.activity]).length > 0).length, 0),
    columns: [...draft.columns.values()].sort((first, second) => first.sortKey.localeCompare(second.sortKey, "pt-BR")),
    rows: [...draft.rows.values()].filter(row => !pendingOnly || Object.keys(row.cells).length > 0).sort((first, second) => (first.rank ?? Infinity) - (second.rank ?? Infinity) || first.name.localeCompare(second.name, "pt-BR")),
  })).filter(item => !pendingOnly || item.rows.length > 0).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

/** Filters the finished class model so every source follows the same search rules. */
export function filterCompactActivitiesModel(model: CompactActivitiesModel, query: string): CompactActivitiesModel {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  const normalized = normalize(query.trim());
  if (!normalized) return model;
  const matches = (value: string) => normalize(value).includes(normalized);
  return model.flatMap(item => {
    if (matches(`${item.name} ${item.courseName ?? ""}`)) return [item];
    const columnsByKey = new Map(item.columns.map(column => [column.key, column]));
    let studentMatched = false;
    const rows = item.rows.flatMap(row => {
      if (matches(row.name)) { studentMatched = true; return [row]; }
      const cells = Object.fromEntries(Object.entries(row.cells).filter(([key, cell]) => {
        const column = columnsByKey.get(key);
        const detail = cell.source === "kodland" ? `${cell.review.lesson_title} ${cell.review.task_title}`
          : cell.source === "manual" ? `${cell.activity.title} ${cell.activity.description} ${cell.activity.occurrence_id}`
            : cell.progress.task_title;
        return matches(`${column?.moduleLabel ?? ""} ${column?.lessonLabel ?? ""} ${column?.taskLabel ?? ""} ${detail}`);
      }));
      return Object.keys(cells).length ? [{ ...row, cells }] : [];
    });
    if (!rows.length) return [];
    const retainedKeys = new Set(rows.flatMap(row => Object.keys(row.cells)));
    return [{ ...item, rows, columns: studentMatched ? item.columns : item.columns.filter(column => retainedKeys.has(column.key)),
      pendingCount: rows.reduce((count, row) => count + Object.values(row.cells).filter(cell => cell.source === "kodland" || cell.source === "manual" && pendingManualActivities([cell.activity]).length > 0).length, 0) }];
  });
}

export interface CorrectionsDemoAdapter {
  reviews: KodlandReview[];
  lessons: KodlandLesson[];
  onSync: () => void | Promise<void>;
  onCorrect: (review: KodlandReview) => void;
  onMaterial?: (lesson: KodlandLesson) => void;
  onTask?: (task: KodlandTaskProgress) => void;
  manualActivities?: ManualActivity[];
  manualClasses?: ManualClass[];
  manualStudents?: ManualStudent[];
  onSaveManualActivity?: (activity: ManualActivity) => Promise<ManualActivity>;
  attendance?: KodlandAttendance[];
  students?: KodlandStudent[];
  groups?: KodlandGroup[];
  manualAdapter?: ManualAdapters;
  taskProgress?: KodlandTaskProgress[];
  manualOccurrences?: ManualOccurrence[];
}

const attendanceStatusLabel = (status: KodlandAttendance["status"]) => ({
  ABSENT: "Falta sem justificativa",
  PRESENT: "Presente",
  LATE: "Atrasado",
  EXCUSED: "Falta justificada",
  UNKNOWN: "Sem confirmação",
}[status]);
const attendanceDateLabel = (value: string) => {
  if (!value) return "Data não informada";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};
const saoPauloNow = () => Object.fromEntries(
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date()).map((part) => [part.type, part.value]),
);
const attendanceSortKey = (item: KodlandAttendance) => `${item.lesson_date || "0000-00-00"} ${item.start_time || "00:00"} ${item.lesson_title}`;
const attendanceColumnKey = (item: KodlandAttendance, lessons: KodlandLesson[]) =>
  lessonForAttendance(item, lessons)?.id || item.lesson_id || `${item.lesson_date}:${item.lesson_title}`;
const attendanceLessonDate = (item: KodlandAttendance, lessons: KodlandLesson[], groups: KodlandGroup[]) => {
  const lesson = lessonForAttendance(item, lessons);
  const group = groups.find((candidate) => candidate.external_id === item.external_class_id);
  return attendanceDateFromSchedule(item, lesson, lessons, group);
};
const attendanceMessage = (history: AttendanceStudentHistory, item: KodlandAttendance, scheduledLesson: KodlandLesson | undefined, lessons: KodlandLesson[]) => {
  const parts = scheduledLesson ? attendanceLessonParts({ ...item, lesson_id: scheduledLesson.id }, lessons) : attendanceLessonParts(item, lessons);
  const lessonLabel = parts.module ? `${parts.module}.${parts.lesson}` : item.lesson_title || parts.lesson;
  const firstName = history.name.trim().split(/\s+/)[0];
  const recordingUrl = scheduledLesson?.recording_url?.trim() || item.recording_url?.trim();
  const recordingLine = recordingUrl
    ? `🎥 *Para ficar por dentro do assunto, você pode acessar a aula gravada aqui:*
${recordingUrl}`
    : `🎥 *Para ficar por dentro do assunto:*
Assim que a gravação estiver disponível na plataforma, eu posso enviá-la para você.`;
  return `${firstName ? `Olá, ${firstName}!` : "Olá!"} 👋

Sentimos sua falta na aula ${lessonLabel}. Aconteceu alguma coisa?

${recordingLine}

Se precisar de ajuda, pode contar comigo!`;
};

function LessonLinks({ lesson, demo }: { lesson: KodlandLesson | undefined; demo?: CorrectionsDemoAdapter }) {
  if (!lesson) return null;
  const links = [
    ["Slides", lesson.slides_url],
    ["Roteiro", lesson.guide_url],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const hasMaterial = links.length > 0;
  return (
    <>
      {links.map(([label, href]) => demo ? <button type="button" className="button button-ghost button-small" onClick={() => demo.onMaterial?.(lesson)} aria-label={label} title={label} key={label}>{label === "Slides" ? <Presentation size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}</button> : <a className="button button-ghost button-small" href={absoluteUrl(href)} target="_blank" rel="noreferrer" aria-label={label} title={label} key={label}>{label === "Slides" ? <Presentation size={18} aria-hidden="true" /> : <FileText size={18} aria-hidden="true" />}</a>)}
      {!hasMaterial && (demo ? <button type="button" className="button button-ghost button-small" aria-label="Abrir aula" title="Abrir aula" onClick={() => demo.onMaterial?.(lesson)}><BookOpen size={18} aria-hidden="true" /></button> : <a className="button button-ghost button-small" href={absoluteUrl(lesson.external_url)} target="_blank" rel="noreferrer" aria-label="Abrir aula" title="Abrir aula"><BookOpen size={18} aria-hidden="true" /></a>)}
    </>
  );
}

function AttendanceClassGrid({
  histories,
  lessons,
  groups,
  classOpen,
  onWhatsApp,
  contactButton,
}: {
  histories: AttendanceStudentHistory[];
  lessons: KodlandLesson[];
  groups: KodlandGroup[];
  classOpen: boolean;
  onWhatsApp: (draft: WhatsAppDraft) => void;
  contactButton: (classKey: string, studentKey: string, name: string) => ReactNode;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const attendanceSamples = new Map<string, KodlandAttendance>();
  for (const history of histories) {
    for (const item of history.records) {
      attendanceSamples.set(attendanceColumnKey(item, lessons), item);
      attendanceSamples.set(item.lesson_id, item);
    }
  }
  const columns = (() => {
    const classId = histories[0]?.records[0]?.external_class_id;
    const scheduled = lessons
      // The schedule is the full class timeline. Attendance fills a status
      // where Kodland has one; it must not hide planned calendar lessons.
      .filter((lesson) => lesson.external_class_id === classId && Boolean(lesson.lesson_date))
      .sort((first, second) => `${first.lesson_date} ${first.start_time}`.localeCompare(`${second.lesson_date} ${second.start_time}`, "pt-BR"));
    if (scheduled.length) {
      return scheduled.map((lesson, index): AttendanceColumn => {
        const attendanceSample = attendanceSamples.get(lesson.id)
          ?? attendanceSamples.get(lesson.source_lesson_id ?? "");
        const parts = attendanceLessonParts(attendanceSample ?? {
          lesson_id: lesson.id,
          lesson_title: lesson.title,
          external_class_id: lesson.external_class_id,
        } as KodlandAttendance, lessons);
        return {
          key: lesson.id,
          module: parts.module,
          lesson: parts.lesson,
          date: lesson.lesson_date.slice(0, 10),
          startTime: lesson.start_time,
          title: lesson.title,
          recordingUrl: lesson.recording_url ?? "",
          moduleStart: Boolean(parts.module && parts.module !== (index ? attendanceLessonParts({ lesson_id: scheduled[index - 1].id, lesson_title: scheduled[index - 1].title, external_class_id: scheduled[index - 1].external_class_id } as KodlandAttendance, lessons).module : "")),
        };
      });
    }

    // Compatibility fallback for an account whose class schedule has not yet
    // been synchronized. The next sync replaces these columns with the agenda.
    const samples = new Map<string, KodlandAttendance>();
    for (const history of histories) {
      for (const item of history.records) samples.set(attendanceColumnKey(item, lessons), item);
    }
    const orderedColumns = [...samples.values()]
      .map((item) => {
        const parts = attendanceLessonParts(item, lessons);
        return { key: attendanceColumnKey(item, lessons), module: parts.module, lesson: parts.lesson, date: attendanceLessonDate(item, lessons, groups), startTime: item.start_time, title: item.lesson_title, recordingUrl: item.recording_url ?? "" };
      })
      .sort((first, second) => `${first.date} ${first.startTime} ${first.module}${first.lesson}`.localeCompare(`${second.date} ${second.startTime} ${second.module}${second.lesson}`, "pt-BR"));
    return orderedColumns.map((column, index): AttendanceColumn => ({
      ...column,
      moduleStart: Boolean(column.module && column.module !== orderedColumns[index - 1]?.module),
    }));
  })();
  const gridStyle = { "--attendance-columns": columns.length } as CSSProperties;
  const focusColumnIndex = (() => {
    const now = saoPauloNow();
    const today = `${now.year}-${now.month}-${now.day}`;
    const currentTime = `${now.hour}:${now.minute}`;
    let latestOccurredIndex = -1;
    columns.forEach((column, index) => {
      if (column.date && (column.date < today || (column.date === today && (!column.startTime || column.startTime <= currentTime)))) {
        latestOccurredIndex = index;
      }
    });
    return latestOccurredIndex >= 0 ? latestOccurredIndex : 0;
  })();

  useEffect(() => {
    if (!classOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const element = gridRef.current;
      if (!element) return;
      const target = element.querySelector<HTMLElement>(`[data-attendance-column-index="${focusColumnIndex}"]`);
      const corner = element.querySelector<HTMLElement>(".attendance-grid-corner");
      if (!target) return;
      const stickyWidth = corner?.offsetWidth ?? 0;
      const availableWidth = Math.max(0, element.clientWidth - stickyWidth);
      element.scrollLeft = Math.max(0, target.offsetLeft - stickyWidth - (availableWidth - target.offsetWidth) / 2);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [classOpen, columns.length, focusColumnIndex]);

  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const scrollWithMouseWheel = (event: WheelEvent) => {
      if (element.scrollWidth <= element.clientWidth) return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      const next = Math.max(0, Math.min(element.scrollWidth - element.clientWidth, element.scrollLeft + delta));
      if (next === element.scrollLeft) return;
      event.preventDefault();
      element.scrollLeft = next;
    };
    element.addEventListener("wheel", scrollWithMouseWheel, { passive: false });
    return () => element.removeEventListener("wheel", scrollWithMouseWheel);
  }, []);

  return (
    <div className="attendance-grid-scroll" ref={gridRef} tabIndex={0} aria-label="Grade de histórico de presença">
      <div className="attendance-grid-header" style={gridStyle} role="row">
        <div className="attendance-grid-corner" role="columnheader">Aluno</div>
        {columns.map((column, index) => <div className={`attendance-column-heading${column.moduleStart ? " attendance-module-start" : ""}`} role="columnheader" data-attendance-column-index={index} key={column.key}>
          <strong>{column.date ? attendanceDateLabel(column.date).slice(0, 5) : "Sem data"}</strong>
        </div>)}
      </div>
      {histories.map((history) => {
        const phone = history.student?.phone || "";
        const recordsByColumn = new Map(history.records.map((item) => [attendanceColumnKey(item, lessons), item]));
        return <div className="attendance-grid-row" style={gridStyle} role="row" key={history.id}>
          <div className="attendance-student-summary" role="rowheader">
            <div className="attendance-name-contact"><div className="attendance-student-copy"><h4 title={history.name}>{history.name}</h4></div>{contactButton(`kodland:${history.records[0]?.external_class_id ?? ""}`, history.student?.external_id ?? history.records[0]?.external_student_id ?? history.id, history.name)}</div>
          </div>
          {columns.map((column) => {
            const item = recordsByColumn.get(column.key);
            const className = `attendance-grid-status${item ? ` attendance-status-${item.status.toLowerCase()}` : " attendance-status-empty"}${column.moduleStart ? " attendance-module-start" : ""}`;
            const lessonCode = column.module ? `${column.module}${column.lesson}` : column.lesson;
            const title = item ? `${lessonCode} · ${attendanceDateLabel(column.date)} · ${attendanceStatusLabel(item.status)}` : `${lessonCode} · Sem registro`;
            if (item?.status === "ABSENT") return <span key={column.key} className="attendance-absence-actions"><button
              className={`${className} attendance-absence-action`}
              type="button"
              aria-label={`Preparar mensagem sobre ${lessonCode} de ${history.name} no WhatsApp`}
              title={phone ? `${title} · ${column.title} · Preparar mensagem` : `${title} · ${column.title} · Telefone não cadastrado`}
              disabled={!phone && !history.student?.student_phone}
              onClick={() => onWhatsApp({ studentName: history.name, phone: phone || history.student?.student_phone || "", guardian: Boolean(phone), guardianPhone: phone, studentPhone: history.student?.student_phone ?? "", message: attendanceMessage(history, item, lessons.find((lesson) => lesson.id === column.key), lessons) })}
            >{lessonCode}</button><a href="https://bo.kodland.org/" target="_blank" rel="noreferrer" aria-label={`Abrir Kodland para justificar falta de ${history.name}`} title="Abrir Kodland para justificar falta" onClick={() => window.dispatchEvent(new CustomEvent("nexusclass:attendance-justification-open", { detail: item.external_class_id }))}>↗</a></span>;
            return <div className={className} role="cell" aria-label={item ? `${lessonCode}: ${attendanceStatusLabel(item.status)}` : `${lessonCode}: sem registro`} key={column.key} title={title}>{lessonCode}</div>;
          })}
        </div>;
      })}
    </div>
  );
}

/** Compact, class-scoped activity matrix. It is intentionally independent of
 * the view switch so the list mode can continue to render unchanged. */
function ProgressActivity({ progress, name, column, children, demo }: { progress: KodlandTaskProgress; name: string; column: CompactActivityColumn; children: ReactNode; demo?: CorrectionsDemoAdapter }) {
  const state = activityProgressLabel(progress.state);
  const label = `${name}: abrir ${column.taskLabel} de ${column.lessonLabel}, ${state}`;
  const title = `${column.taskLabel}${column.kind === "homework" ? " · Atividade de casa" : ""} · ${state} · Abrir atividade`;
  const className = `compact-activity-action compact-activity-progress compact-activity-${progress.state}`;
  const content = <>{children}<span className="compact-activity-status-icon" aria-hidden="true">{progress.state === "corrected" ? "✓" : progress.state === "submitted" ? "◷" : progress.state === "missing" ? "!" : progress.state === "not_graded" ? "—" : "?"}</span></>;
  return demo ? <button type="button" className={className} aria-label={label} title={title} onClick={() => demo.onTask?.(progress)}>{content}</button>
    : <a className={className} aria-label={label} title={title} href={correctionUrlFor({ link: progress.task_url ?? "", taskId: progress.task_id, studentId: progress.external_student_id, groupId: progress.external_class_id })} target="_blank" rel="noreferrer">{content}</a>;
}

export function CompactActivitiesGrid({
  model,
  demo,
  onCorrectManual,
  pendingOnly = false,
  displayMode,
  contactButton,
}: {
  contactButton?: (classKey: string, studentKey: string, name: string) => ReactNode;
  model: CompactActivitiesModel;
  demo?: CorrectionsDemoAdapter;
  onCorrectManual: (activity: ManualActivity) => void;
  pendingOnly?: boolean;
  displayMode?: StudentDisplayMode;
}) {
  const mode = displayMode ?? (pendingOnly ? "pending" : "complete");
  const activitiesRoot = useRef<HTMLDivElement>(null);
  const touchStart = useRef<{ x: number; y: number; atStart: boolean } | null>(null);
  const pendingPrepend = useRef<{ key: string; width: number; left: number } | null>(null);
  const positionedKey = useRef<string | null>(null);
  const ignoreScroll = useRef(false);
  const wheelScroller = useRef<ReturnType<typeof attachActivityWheelScroll> | null>(null);
  const modulesByClass = useMemo(() => new Map(model.map(item => [item.key, activityModules(item.columns)])), [model]);
  useEffect(() => {
    const root = activitiesRoot.current;
    if (!root) return;
    const scroller = attachActivityWheelScroll(root);
    wheelScroller.current = scroller;
    return () => { scroller.dispose(); wheelScroller.current = null; };
  }, []);
  const [openClassKey, setOpenClassKey] = useState<string | null>(null);
  const [moduleLimits, setModuleLimits] = useState<Record<string, number>>({});
  useLayoutEffect(() => {
    if (!openClassKey) { positionedKey.current = null; return; }
    const grid = [...(activitiesRoot.current?.querySelectorAll<HTMLElement>(".compact-activities-grid-scroll") ?? [])].find(item => item.dataset.classKey === openClassKey);
    if (!grid) return;
    const pending = pendingPrepend.current;
    if (pending?.key === openClassKey) {
      ignoreScroll.current = true;
      const offset = grid.scrollWidth - pending.width;
      grid.scrollTo({ left: pending.left + offset, behavior: "instant" });
      wheelScroller.current?.shift(grid, offset);
      pendingPrepend.current = null;
    } else if (positionedKey.current !== openClassKey) {
      ignoreScroll.current = true;
      grid.scrollTo({ left: grid.scrollWidth, behavior: "instant" });
      positionedKey.current = openClassKey;
    } else return;
    const frame = requestAnimationFrame(() => { ignoreScroll.current = false; });
    return () => { cancelAnimationFrame(frame); ignoreScroll.current = false; };
  }, [openClassKey, mode, moduleLimits]);
  const [openClassMenu, setOpenClassMenu] = useState<string | null>(null);
  const [editingClassKey, setEditingClassKey] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [names, setNames] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem("nexusclass.integrated-class-names") ?? "{}"); } catch { return {}; } });
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("nexusclass.integrated-hidden-classes") ?? "[]"); } catch { return []; } });
  useEffect(() => { localStorage.setItem("nexusclass.integrated-class-names", JSON.stringify(names)); }, [names]);
  useEffect(() => { localStorage.setItem("nexusclass.integrated-hidden-classes", JSON.stringify(hidden)); }, [hidden]);
  useEffect(() => {
    if (!openClassMenu) return;
    const closeMenu = (event: PointerEvent) => {
      if (!(event.target instanceof Element) || !event.target.closest(".compact-class-actions-menu-anchor")) {
        setOpenClassMenu(null);
        setEditingClassKey(null);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpenClassMenu(null);
      setEditingClassKey(null);
    };
    document.addEventListener("pointerdown", closeMenu);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeMenu);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [openClassMenu]);
  const [contactOverrides, setContactOverrides] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<KodlandStudent | ManualStudent | null>(null);
  const pointsFor = (row: CompactActivityRow) => row.points ?? (row.student ? kodlandStudentPoints(row.student.progress_summary) : null);
  const creditFor = (student?: KodlandStudent) => student && typeof student.lesson_credits_remaining === "number" ? `${new Intl.NumberFormat("pt-BR").format(student.lesson_credits_remaining)} aulas` : "Não informado";
  const openStudent = (row: CompactActivityRow) => { const student = row.student ?? row.manualStudent; setSelected(student ? { ...student, student_phone: contactOverrides[student.id] ?? student.student_phone } : null); };
  const studentSummary = (row: CompactActivityRow, classKey: string) => <div className="activity-student-heading"><div className="compact-student-profile"><button type="button" className="compact-student-name" onClick={() => openStudent(row)} disabled={!row.student && !row.manualStudent} aria-label={`Informações de ${row.name}`} title={row.name}>{row.rank ? `${row.rank}º · ` : ""}{row.name.trim().split(/\s+/).filter((_, index, parts) => index === 0 || index === parts.length - 1).join(" ")}</button>{pointsFor(row) !== null && <small>{new Intl.NumberFormat("pt-BR").format(pointsFor(row)!)} pts</small>}{row.student && <small className="student-lesson-credits" aria-label={`Créditos de ${row.name}: ${creditFor(row.student)}`} title="Saldo global de aulas na Kodland">Créditos: {creditFor(row.student)}</small>}</div><WelcomeContact name={row.name} phone={row.student?.phone || row.manualStudent?.phone || ""} className={model.find(item => item.key === classKey)?.name} />{contactButton?.(classKey, row.key, row.name)}</div>;
  return <><Modal open={Boolean(selected)} title={selected?.name ?? "Aluno"} onClose={() => setSelected(null)}>{selected && <div className="student-profile"><dl>{[["Status", "status" in selected ? selected.status : selected.active ? "Ativo" : "Inativo"], ["Pontuação", "progress_summary" in selected ? `${kodlandStudentPoints(selected.progress_summary)} pts` : "Não informado"], ["Saldo de aulas", "progress_summary" in selected ? creditFor(selected) : "Não informado"], ["Progresso", "progress_summary" in selected ? selected.progress_summary : ""]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl><StudentContactFields key={selected.id} student={selected} demo={Boolean(demo)} onSaved={phone => { setContactOverrides(current => ({ ...current, [selected.id]: phone })); setSelected(current => current ? { ...current, student_phone: phone } : current); }} /></div>}</Modal><div ref={activitiesRoot} className="correction-class-list compact-activities-list" aria-label="Alunos e atividades por turma">
    {model.filter(item => !hidden.includes(item.key)).map((original) => {
      const classModel = { ...original, name: names[original.key] || original.name };
      const isPending = mode === "pending";
      const modules = modulesByClass.get(classModel.key) ?? [];
      const limit = moduleLimits[classModel.key] ?? 1;
      const columns = modules.slice(0, limit).reverse().flat();
      const hasMore = limit < modules.length;
      const loadOlder = (grid: HTMLElement) => {
        if (!hasMore || ignoreScroll.current || pendingPrepend.current) return;
        pendingPrepend.current = { key: classModel.key, width: grid.scrollWidth, left: grid.scrollLeft };
        setModuleLimits(current => ({ ...current, [classModel.key]: Math.min(modules.length, (current[classModel.key] ?? 1) + 1) }));
      };
      const lessonGroups = columns.reduce<Array<{ label: string; count: number }>>((groups, column) => {
        const label = column.lessonLabel || "Aula";
        const previous = groups[groups.length - 1];
        if (previous?.label === label) previous.count++; else groups.push({ label, count: 1 });
        return groups;
      }, []);
      const gridStyle = { "--attendance-columns": Math.max(1, columns.length) } as CSSProperties;
      const classMenuOpen = openClassMenu === classModel.key;
      const classIsBeingRenamed = editingClassKey === classModel.key;
      const menuId = `compact-class-actions-${classModel.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
      return <details className={`correction-class-group attendance-class-group compact-activities-class${classMenuOpen ? " has-actions-menu" : ""}`} key={classModel.key} open={openClassKey === classModel.key} onToggle={event => { const isOpen = event.currentTarget.open; setOpenClassKey(current => isOpen ? classModel.key : current === classModel.key ? null : current); if (isOpen && classModel.key.startsWith("kodland:")) window.dispatchEvent(new CustomEvent("nexusclass:activity-group-open", { detail: classModel.key.slice(8) })); if (isOpen && openClassMenu && openClassMenu !== classModel.key) { setOpenClassMenu(null); setEditingClassKey(null); } }}>
        <summary className="correction-class-heading">
          <div className="compact-class-copy"><h3>{classModel.name}</h3><small className="compact-class-course" title={classModel.courseName || "Curso não informado"}>{classModel.courseName || "Curso não informado"}</small></div>
          <span className="compact-class-actions"><span className="class-count-badge" aria-label={`${classModel.rows.length} alunos`} title={`${classModel.rows.length} alunos`}><Users size={14} aria-hidden="true" />{classModel.rows.length}</span><span className="class-count-badge class-pending-badge" aria-label={`${classModel.pendingCount ?? 0} atividades sem corrigir`} title="Atividades sem corrigir"><ClipboardCheck size={14} aria-hidden="true" />{classModel.pendingCount ?? 0}</span><span className="class-count-badge class-completion-badge" aria-label={classModel.completionPercent == null ? "Percentual de aulas concluídas não informado" : `${classModel.completionPercent}% das aulas concluídas`} title={classModel.completionPercent == null ? "Percentual de aulas concluídas não informado" : `${classModel.completedLessons ?? 0} de ${classModel.totalLessons ?? 0} aulas concluídas`}><Percent size={14} aria-hidden="true" />{classModel.completionPercent == null ? "—" : `${classModel.completionPercent}%`}</span><span className="compact-class-actions-menu-anchor"><button type="button" className="group-menu-button" aria-label={`Ações da turma ${classModel.name}`} title="Ações da turma" aria-haspopup="menu" aria-expanded={classMenuOpen} aria-controls={classMenuOpen ? menuId : undefined} onClick={event => { event.preventDefault(); event.stopPropagation(); setOpenClassMenu(current => current === classModel.key ? null : classModel.key); setEditingClassKey(null); }}><MoreVertical size={18} aria-hidden="true" /></button>{classMenuOpen && <div id={menuId} className="group-actions-menu compact-class-actions-menu" role="menu" aria-label={`Ações da turma ${classModel.name}`} onClick={event => { event.stopPropagation(); }}>{classIsBeingRenamed ? <form className="group-rename-form" onSubmit={event => { event.preventDefault(); const name = nameInput.trim(); if (!name) return; setNames(current => ({ ...current, [classModel.key]: name })); setEditingClassKey(null); setOpenClassMenu(null); }}><label><span className="sr-only">Novo nome da turma</span><input className="input" autoFocus value={nameInput} onChange={event => setNameInput(event.target.value)} aria-label="Novo nome da turma" /></label><div><button className="button button-ghost button-small" type="button" onClick={() => setEditingClassKey(null)}>Cancelar</button><button className="button button-small" type="submit" disabled={!nameInput.trim()}>Salvar</button></div></form> : <><button type="button" role="menuitem" onClick={() => { setNameInput(classModel.name); setEditingClassKey(classModel.key); }}><Settings size={15} aria-hidden="true" /> Renomear turma</button><button className="group-actions-menu-danger" type="button" role="menuitem" onClick={() => { if (window.confirm(`Ocultar a turma ${classModel.name} desta visualização?`)) setHidden(current => [...current, classModel.key]); setOpenClassMenu(null); }}><EyeOff size={15} aria-hidden="true" /> Ocultar turma</button></>}</div>}</span><ChevronDown className="correction-disclosure" size={18} aria-hidden="true" /></span>
        </summary>
        <div className="correction-class-body attendance-class-body">
          <>
          {!isPending && !classModel.columns.length && <p className="complete-activities-note">Nenhuma informação de atividades sincronizada para esta turma.</p>}
          <div className={`attendance-grid-scroll compact-activities-grid-scroll${isPending ? " compact-pending-list" : ""}`} tabIndex={0} role="grid" aria-label={`Atividades da turma ${classModel.name}`} data-class-key={classModel.key} aria-rowcount={classModel.rows.length + 1} aria-colcount={columns.length + 1} onScroll={event => { const el = event.currentTarget; if (hasMore && el.scrollWidth > el.clientWidth + 1 && el.scrollLeft <= Math.max(120, el.clientWidth * 0.75)) loadOlder(el); }} onWheel={event => { const el = event.currentTarget; const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY; if (hasMore && delta < 0 && el.scrollLeft <= 2) { event.preventDefault(); loadOlder(el); } }} onTouchStart={event => { const el = event.currentTarget; const touch = event.touches[0]; touchStart.current = touch ? { x: touch.clientX, y: touch.clientY, atStart: el.scrollLeft <= 2 } : null; }} onTouchEnd={event => { const start = touchStart.current; touchStart.current = null; const touch = event.changedTouches[0]; if (start && touch && start.atStart && touch.clientX - start.x > 30 && touch.clientX - start.x > Math.abs(start.y - touch.clientY)) loadOlder(event.currentTarget); }} onKeyDown={event => { const el = event.currentTarget; if (hasMore && ["ArrowLeft", "PageUp", "Home"].includes(event.key) && el.scrollLeft <= 2) { event.preventDefault(); loadOlder(el); } }}>
            {!isPending && <div className="attendance-grid-header compact-activities-grid-header" style={gridStyle} role="row">
              <div className="attendance-grid-corner" role="columnheader">Aluno</div>
              {lessonGroups.map((group, index) => <div className="attendance-column-heading compact-activity-column-heading compact-lesson-group" role="columnheader" key={`${group.label}-${index}`} style={{ gridColumn: `span ${group.count}` }}><span>{group.label}</span></div>)}
            </div>}
            {classModel.rows.map((row) => <div className={isPending ? "compact-pending-row" : "attendance-grid-row"} style={isPending ? undefined : gridStyle} role="row" key={row.key}>
              <div className="attendance-student-summary" role="rowheader">
                <div className="attendance-student-copy">{studentSummary(row, classModel.key)}</div>
              </div>
              {columns.map((column, columnIndex) => {
                const cell = row.cells[column.key];
                if (!cell) return isPending ? null : <div className="attendance-grid-status attendance-status-empty compact-activity-empty" role="gridcell" aria-label={`${row.name}: sem pendência em ${column.lessonLabel}, ${column.taskLabel}`} key={column.key}>—</div>;
                const kindLabel = column.kind === "homework" ? " · Atividade de casa" : "";
                const label = `${row.name}: corrigir ${column.taskLabel} de ${column.lessonLabel}${kindLabel}`;
                const actionContent = <>{isPending && <span className="compact-activity-lesson" title={column.lessonLabel}>{column.lessonLabel}{column.kind === "homework" && <House size={12} aria-label="Atividade de casa" />}</span>}<span className="compact-activity-task" title={column.taskLabel}>{!isPending && column.kind === "homework" && <House size={12} aria-label="Atividade de casa" />}{column.taskLabel}</span></>;
                return <div className={`compact-activity-cell${columnIndex === 0 || columns[columnIndex - 1].lessonLabel !== column.lessonLabel ? " compact-lesson-start" : ""}`} role="gridcell" key={column.key}>
                  {cell.source === "progress" ? <ProgressActivity progress={cell.progress} name={row.name} column={column} demo={demo}>{actionContent}</ProgressActivity> : cell.source === "manual" && !pendingManualActivities([cell.activity]).length ? <button type="button" className={`compact-activity-action compact-activity-manual compact-activity-${cell.activity.status === "corrected" ? "delivered" : "missing"}`} onClick={() => onCorrectManual(cell.activity)} aria-label={`${row.name}: abrir ${column.taskLabel}${kindLabel}, ${cell.activity.status === "corrected" ? "Corrigida" : "Não entregue"}`} title={`${column.taskLabel}${kindLabel} · ${cell.activity.status === "corrected" ? "Corrigida" : "Não entregue"}`}>{actionContent}<span className="compact-activity-status-icon" aria-hidden="true">{cell.activity.status === "corrected" ? "✓" : "!"}</span></button> : cell.source === "manual" ? <button type="button" className="compact-activity-action compact-activity-manual" aria-label={label} title={label} onClick={() => onCorrectManual(cell.activity)}>{actionContent}</button>
                    : demo ? <button type="button" className="compact-activity-action" aria-label={label} title={label} onClick={() => demo.onCorrect(cell.review)}>{actionContent}</button>
                      : <a className="compact-activity-action" aria-label={label} title={label} href={cell.review.correction_url} onClick={() => window.dispatchEvent(new CustomEvent("nexusclass:activity-correction-open", { detail: cell.review.external_class_id }))} target="_blank" rel="noreferrer">{actionContent}</a>}
                </div>;
              })}
            </div>)}
          </div></>
        </div>
      </details>;
    })}
  </div></>;
}

function ReviewCard({
  review,
  lessons,
  showStudent = true,
  demo,
  contact,
}: {
  review: KodlandReview;
  lessons: KodlandLesson[];
  showStudent?: boolean;
  contact?: ReactNode;
  demo?: CorrectionsDemoAdapter;
}) {
  const lesson = lessonForReview(review, lessons);
  return (
    <article className="entity-card correction-card" key={review.id}>
      <div className="correction-card-copy">
        <div className="correction-card-top">
          {showStudent && <div className="activity-student-heading"><h4>{review.student_name}</h4>{contact}</div>}
          <StatusBadge tone="warning">{review.status_label}</StatusBadge>
        </div>
        <p className="correction-card-lesson" title={lessonLabel(review, lessons)}>{lessonLabel(review, lessons)}</p>
        <p className="correction-card-task" title={`${review.task_number ? `${review.task_number}. ` : ""}${review.task_title || "Sem título"}`}>
          <span className="sr-only">Atividade</span>
          {review.task_number ? `${review.task_number}. ` : ""}{review.task_title || "Sem título"}
        </p>
      </div>
      <div className="card-actions">
        <LessonLinks lesson={lesson} demo={demo} />
        {demo ? <button type="button" className="button button-primary correction-action" aria-label="Corrigir" title="Corrigir atividade" onClick={() => demo.onCorrect(review)}><ClipboardCheck size={18} aria-hidden="true" /></button> : <a
          className="button button-primary correction-action"
          aria-label="Corrigir" title="Corrigir atividade"
          target="_blank"
          rel="noreferrer"
          href={review.correction_url}
          onClick={() => window.dispatchEvent(new CustomEvent("nexusclass:activity-correction-open", { detail: review.external_class_id }))}
        >
          <ClipboardCheck size={18} aria-hidden="true" />
        </a>}
      </div>
    </article>
  );
}

type StudentDisplayMode = "complete" | "pending";

type CorrectionsViewPreferences = {
  studentDisplayMode?: StudentDisplayMode;
  viewMode: "attendance" | "activities";
  activitiesView: "list" | "compact";
  pendingOnly: boolean;
  grouping: ReviewGrouping;
  attendanceFilter: AttendanceFilter;
};

type CorrectionsSnapshot = { reviews: KodlandReview[]; lessons: KodlandLesson[]; progress: KodlandTaskProgress[]; attendance: KodlandAttendance[]; students: KodlandStudent[]; groups: KodlandGroup[]; activities: ManualActivity[]; occurrences: ManualOccurrence[]; classes: ManualClass[]; manualStudents: ManualStudent[]; courseNames: Record<string, string>; enabled: boolean };
const correctionsSnapshots = new Map<string, CorrectionsSnapshot>();

export function CorrectionsContent({ demo, preferenceKey = "default", classesContent }: { demo?: CorrectionsDemoAdapter; preferenceKey?: string; classesContent?: ReactNode }) {
  const unified = Boolean(classesContent);
  const cached = !demo ? correctionsSnapshots.get(preferenceKey) : undefined;

  const notifications = useStudentNotifications();
  const [storedReviews, setReviews] = useState<KodlandReview[]>(cached?.reviews ?? []);
  const [storedLessons, setLessons] = useState<KodlandLesson[]>(cached?.lessons ?? []);
  const [storedTaskProgress, setTaskProgress] = useState<KodlandTaskProgress[]>(cached?.progress ?? []);
  const [storedManualOccurrences, setManualOccurrences] = useState<ManualOccurrence[]>(cached?.occurrences ?? []);
  const taskProgress = demo?.taskProgress ?? storedTaskProgress;
  const manualOccurrences = demo?.manualOccurrences ?? storedManualOccurrences;
  const [storedAttendance, setAttendance] = useState<KodlandAttendance[]>(cached?.attendance ?? []);
  const [storedStudents, setStudents] = useState<KodlandStudent[]>(cached?.students ?? []);
  const [storedGroups, setGroups] = useState<KodlandGroup[]>(cached?.groups ?? []);
  const reviews = demo?.reviews ?? storedReviews;
  const lessons = demo?.lessons ?? storedLessons;
  const attendance = demo?.attendance ?? storedAttendance;
  const attendanceStudents = demo?.students ?? storedStudents;
  const groups = demo?.groups ?? storedGroups;
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<ReviewGrouping>("class");
  const [viewMode, setViewMode] = useState<"attendance" | "activities">("activities");
  const [activitiesView, setActivitiesView] = useState<"list" | "compact">(unified ? "compact" : "list");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filterButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    let focusFrame = 0;
    const frame = window.requestAnimationFrame(() => {
      // HeaderDropdown measures first and mounts its portal on the following
      // render, so wait one more frame before moving focus into it.
      focusFrame = window.requestAnimationFrame(() => {
        document.getElementById("correction-filter-dropdown")?.querySelector<HTMLElement>("select, .favorite-filter-choice")?.focus();
      });
    });
    return () => { window.cancelAnimationFrame(frame); window.cancelAnimationFrame(focusFrame); };
  }, [filtersOpen]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [studentDisplayMode, setStudentDisplayMode] = useState<StudentDisplayMode>("complete");
  const pendingOnly = studentDisplayMode === "pending";
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("ALL");
  const [openAttendanceClasses, setOpenAttendanceClasses] = useState<Set<string>>(() => new Set());
  const [storedWhatsAppDraft, setWhatsAppDraft] = useState<WhatsAppDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(!demo && !cached);
  const [refreshingData, setRefreshingData] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [storedManualActivities, setManualActivities] = useState<ManualActivity[]>(cached?.activities ?? []);
  const [manualCourseNames, setManualCourseNames] = useState<Record<string, string>>(cached?.courseNames ?? {});
  const [storedManualClasses, setManualClasses] = useState<ManualClass[]>(cached?.classes ?? []);
  const [storedManualStudents, setManualStudents] = useState<ManualStudent[]>(cached?.manualStudents ?? []);
  const manualActivities = demo?.manualActivities ?? storedManualActivities;
  const manualClasses = demo?.manualClasses ?? storedManualClasses;
  const manualStudents = demo?.manualStudents ?? storedManualStudents;
  const [hasKodlandGroups, setHasKodlandGroups] = useState(Boolean(cached?.groups.length));
  const [editingManual, setEditingManual] = useState<ManualActivity | null>(null);
  const [feedback, setFeedback] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [kodlandEnabled, setKodlandEnabled] = useState(cached?.enabled ?? false);
  const [viewPreferencesLoaded, setViewPreferencesLoaded] = useState(false);
  const resolveNotificationContext = useCallback((item: StudentNotification) => {
    setViewMode(item.category === "absence" ? "attendance" : "activities");
    setQuery(item.student_name); setAttendanceFilter("ALL");
    setOpenAttendanceClasses(new Set([item.class_name]));
  }, []);

  useEffect(() => {
    let active = true;
    let stored: Partial<CorrectionsViewPreferences> | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(`nexusclass.corrections.view.${preferenceKey}`) ?? "null") as Partial<CorrectionsViewPreferences> | null;
    } catch { /* Prefer defaults when browser storage is unavailable or malformed. */ }
    queueMicrotask(() => {
      if (!active) return;
      if (stored?.viewMode === "attendance" || stored?.viewMode === "activities") setViewMode(stored.viewMode);
      if (stored?.activitiesView === "list" || stored?.activitiesView === "compact") setActivitiesView(stored.activitiesView);
      setStudentDisplayMode(stored?.studentDisplayMode === "complete" || stored?.studentDisplayMode === "pending" ? stored.studentDisplayMode : stored?.pendingOnly ? "pending" : "complete");
      if (unified) setActivitiesView("compact");
      if (stored?.grouping === "class" || stored?.grouping === "student" || stored?.grouping === "lesson") setGrouping(stored.grouping);
      if (stored?.attendanceFilter === "ABSENT" || stored?.attendanceFilter === "ALL" || stored?.attendanceFilter === "PRESENT") setAttendanceFilter(stored.attendanceFilter);
      const context = new URLSearchParams(window.location.search);
      const requestedTab = context.get("tab");
      if (requestedTab === "activities" || requestedTab === "attendance" || (unified && requestedTab === "students")) setViewMode(requestedTab === "attendance" ? "attendance" : "activities");
      if (context.has("notification")) {
        setViewMode(context.get("tab") === "attendance" ? "attendance" : "activities");
        setQuery(""); setAttendanceFilter("ALL");
        if (context.get("class")) setOpenAttendanceClasses(new Set([context.get("class")!]));
      }
      setViewPreferencesLoaded(true);
    });
    return () => { active = false; };
  }, [preferenceKey, unified]);

  useEffect(() => {
    if (!viewPreferencesLoaded || new URLSearchParams(window.location.search).has("notification")) return;
    try {
      localStorage.setItem(`nexusclass.corrections.view.${preferenceKey}`, JSON.stringify({ viewMode, activitiesView, grouping, attendanceFilter, pendingOnly, studentDisplayMode } satisfies CorrectionsViewPreferences));
    } catch { /* The screen remains usable when storage is blocked. */ }
  }, [activitiesView, attendanceFilter, grouping, pendingOnly, studentDisplayMode, preferenceKey, viewMode, viewPreferencesLoaded]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => { if (!demo && !loading) correctionsSnapshots.set(preferenceKey, { reviews: storedReviews, lessons: storedLessons, progress: storedTaskProgress, attendance: storedAttendance, students: storedStudents, groups: storedGroups, activities: storedManualActivities, occurrences: storedManualOccurrences, classes: storedManualClasses, manualStudents: storedManualStudents, courseNames: manualCourseNames, enabled: kodlandEnabled }); }, [demo, loading, preferenceKey, storedReviews, storedLessons, storedTaskProgress, storedAttendance, storedStudents, storedGroups, storedManualActivities, storedManualOccurrences, storedManualClasses, storedManualStudents, manualCourseNames, kodlandEnabled]);
  const snapshotReady = useRef(Boolean(demo || cached));
  const loadedViews = useRef({ activities: false, attendance: false });
  const currentView = useRef(viewMode);
  currentView.current = viewMode;
  const loadGeneration = useRef(0);
  const load = useCallback(async (background = false, silent = false) => {
    const mode = currentView.current;
    const generation = ++loadGeneration.current;
    if (demo) {
      const courses = await demo.manualAdapter?.courses.list() ?? [];
      setManualCourseNames(Object.fromEntries(courses.map(course => [course.id, course.name])));
      const enabled = (await demo.manualAdapter?.preferences.get())?.kodland_enabled === true;
      setKodlandEnabled(enabled); setHasKodlandGroups(enabled && (demo.groups?.length ?? 0) > 0); return;
    }
    if (background) { if (!silent) setRefreshingData(true); } else setLoading(true);
    setError("");
    try {
      const localOnly = Boolean((await readKodlandLocal(() => kodlandApi.browserState(), crypto.randomUUID(), "Armazenamento das atividades", 8000))?.active);
      if (generation !== loadGeneration.current) return;
      const preferences = await kodlandReadPreference(() => tutorPreferencesApi.get(), localOnly);
      if (generation !== loadGeneration.current) return;
      setKodlandEnabled(preferences.kodland_enabled);
      const empty = Promise.resolve({ items: [] });
      const [reviewResult, lessonResult, groupResult, attendanceResult, studentResult, ownActivities, ownClasses, ownStudents, progressResult, ownOccurrences, ownCourses] = await readKodlandLocal(() => Promise.all([
        preferences.kodland_enabled && mode === "activities" ? kodlandApi.reviews() : empty, preferences.kodland_enabled ? kodlandApi.lessons() : empty, preferences.kodland_enabled ? kodlandApi.groups() : empty, preferences.kodland_enabled && mode === "attendance" ? kodlandApi.attendance() : empty, preferences.kodland_enabled ? kodlandApi.students() : empty,
        localOnly || mode !== "activities" ? Promise.resolve(null) : manualPedagogyApi.activities(), localOnly ? Promise.resolve(null) : manualTeachingApi.classes(), localOnly ? Promise.resolve(null) : manualTeachingApi.students(),
        preferences.kodland_enabled && mode === "activities" ? kodlandApi.taskProgress() : empty, localOnly || mode !== "activities" ? Promise.resolve(null) : manualOperationsApi.occurrences(),
        localOnly ? Promise.resolve(null) : manualCoursesApi.list(),
      ]), crypto.randomUUID(), "Atividades e presença", 15000);
      if (generation !== loadGeneration.current) return;
      if (mode === "activities") setTaskProgress(progressResult.items);
      if (ownOccurrences) setManualOccurrences(ownOccurrences);
      if (mode === "activities") setReviews(reviewResult.items);
      setLessons(lessonResult.items);
      if (mode === "attendance") setAttendance(attendanceResult.items);
      setGroups(groupResult.items);
      setHasKodlandGroups(groupResult.items.length > 0);
      if (ownActivities) setManualActivities(ownActivities);
      if (ownClasses) setManualClasses(ownClasses);
      if (ownCourses) setManualCourseNames(Object.fromEntries(ownCourses.map(course => [course.id, course.name])));
      if (ownStudents) setManualStudents(ownStudents);
      setStudents(current => reuseSyncedRows(current, studentResult.items));
      snapshotReady.current = true;
      loadedViews.current[mode] = true;
    } catch (reason) {
      if (generation === loadGeneration.current) setError(reason instanceof Error ? reason.message : "Não foi possível carregar as correções.");
    } finally {
      if (generation === loadGeneration.current) { setLoading(false); setRefreshingData(false); }
    }
  }, [demo]);

  useEffect(() => {
    if (demo || !viewPreferencesLoaded) return;
    const announce = () => window.dispatchEvent(new CustomEvent("nexusclass:kodland-page", { detail: viewMode }));
    window.addEventListener("nexusclass:kodland-page-request", announce);
    announce();
    return () => window.removeEventListener("nexusclass:kodland-page-request", announce);
  }, [demo, viewMode, viewPreferencesLoaded]);

  async function syncCorrections() {
    if (syncing) return;
    if (demo) {
      setSyncing(true);
      try {
        await demo.onSync();
        setNotice("Correções demonstrativas atualizadas. Nenhuma plataforma externa foi consultada.");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a demonstração.");
      } finally {
        setSyncing(false);
      }
      return;
    }
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const credentials = await readKodlandLocal(restoreKodlandCredentials, crypto.randomUUID(), "Acesso à Kodland", 15000);
      if (!credentials) {
        setError("Salve as credenciais em Configurações > Dados e backup antes de atualizar.");
        return;
      }
      const result = await watchKodlandSync(async (report, assertActive) => {
        const options = { onProgress: report, assertActive, followupScope: viewMode };
        assertActive();
        return kodlandApi.sync(credentials.username.trim(), credentials.password, "corrections", options);
      }, () => undefined);
      await load();
      setNotice(
        viewMode === "attendance"
          ? "Presença atualizada."
          : `${result.review_count ?? 0} atividade(s) pendente(s) foram atualizadas.`,
      );
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar as correções.",
      );
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (!viewPreferencesLoaded) return;
    const timer = window.setTimeout(() => { if (!loadedViews.current[viewMode]) void load(snapshotReady.current, Boolean(cached)); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, demo, viewMode, viewPreferencesLoaded, cached]);

  useEffect(() => {
    if (demo) return;
    let active = true;
    let reading = false;
    let pending = false;
    let pendingDomains: Set<SyncDataDomain> | null = new Set();
    const partial = async (domains: Set<SyncDataDomain>) => {
      if (!snapshotReady.current) { await load(true); return; }
      if (domains.has("activities") && currentView.current !== "activities") loadedViews.current.activities = false;
      if (domains.has("attendance") && currentView.current !== "attendance") loadedViews.current.attendance = false;
      const activities = domains.has("activities") && currentView.current === "activities", attendanceChanged = domains.has("attendance") && currentView.current === "attendance", ranking = domains.has("ranking");
      const agenda = domains.has("agenda") || domains.has("recordings") || domains.has("call_link");
      if (!activities && !attendanceChanged && !ranking && !agenda) return;
      const generation = ++loadGeneration.current;
      setRefreshingData(true);
      try {
        const [reviews, progress, attendance, students, groups, lessons] = await readKodlandLocal(() => Promise.all([
          activities ? kodlandApi.reviews() : null, activities ? kodlandApi.taskProgress() : null,
          attendanceChanged ? kodlandApi.attendance() : null, ranking ? kodlandApi.students() : null,
          agenda ? kodlandApi.groups() : null, agenda ? kodlandApi.lessons() : null,
        ]), crypto.randomUUID(), "Atualizações do acompanhamento", 15000);
        if (!active || generation !== loadGeneration.current) return;
        if (reviews) setReviews(current => reuseSyncedRows(current, reviews.items));
        if (progress) setTaskProgress(current => reuseSyncedRows(current, progress.items));
        if (attendance) setAttendance(current => reuseSyncedRows(current, attendance.items));
        if (students) setStudents(current => reuseSyncedRows(current, students.items));
        if (groups) { setGroups(current => reuseSyncedRows(current, groups.items)); setHasKodlandGroups(groups.items.length > 0); }
        if (lessons) setLessons(current => reuseSyncedRows(current, lessons.items));
        setError("");
      } catch (reason) { if (active && generation === loadGeneration.current) setError(reason instanceof Error ? reason.message : "Não foi possível atualizar esta área."); }
      finally { if (active && generation === loadGeneration.current) setRefreshingData(false); }
    };
    const refresh = async (domains?: SyncDataDomain[]) => {
      pending = true;
      if (!domains) pendingDomains = null;
      else if (pendingDomains) domains.forEach(domain => pendingDomains!.add(domain));
      if (reading) return;
      reading = true;
      try {
        do {
          const domains = pendingDomains;
          pending = false; pendingDomains = new Set();
          if (domains) await partial(domains); else await load(true);
        } while (active && pending);
      } finally { reading = false; }
    };
    const unsubscribe = subscribeStudentNotifications((change, domains) => { if (active && change === "source") void refresh(domains); });
    return () => { active = false; unsubscribe(); };
  }, [demo, load, viewMode]);

  const visibleReviews = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const enabledReviews = kodlandEnabled ? reviews : [];
    if (!normalized) return enabledReviews;
    return enabledReviews.filter((review) => `${review.student_name} ${review.external_class_name} ${review.lesson_title} ${review.task_title}`.toLowerCase().includes(normalized));
  }, [kodlandEnabled, query, reviews]);
  const pendingOwn = useMemo(() => pendingManualActivities(manualActivities), [manualActivities]);
  const visibleOwn = useMemo(() => pendingOwn.filter((item) => {
    const student = manualStudents.find((row) => row.id === item.student_id)?.name ?? "";
    const className = manualClasses.find((row) => row.id === item.class_id)?.name ?? "";
    return `${student} ${className} ${item.title} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [pendingOwn, manualClasses, manualStudents, query]);
  const ownByClass = useMemo(() => groupBy(visibleOwn, (item) => manualClasses.find((row) => row.id === item.class_id)?.name || "Turma própria"), [visibleOwn, manualClasses]);
  const reviewsByClass = useMemo(
    () => groupBy(visibleReviews, (review) => review.external_class_name || "Turma não informada"),
    [visibleReviews],
  );
  const compactActivities = useMemo(() => filterCompactActivitiesModel(compactActivitiesModel({
    reviews: kodlandEnabled ? reviews : [],
    lessons,
    manualActivities,
    groups,
    students: attendanceStudents,
    manualClasses,
    manualStudents,
    manualCourseNames,
    taskProgress,
    attendance,
    manualOccurrences,
    pendingOnly,
    complete: studentDisplayMode === "complete",
  }), query), [attendanceStudents, groups, lessons, manualClasses, manualStudents, manualCourseNames, taskProgress, attendance, manualOccurrences, pendingOnly, studentDisplayMode, query, manualActivities, reviews, kodlandEnabled]);
  const attendanceHistories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const studentsByExternalId = new Map(attendanceStudents.map((student) => [student.external_id, student]));
    const histories = new Map<string, AttendanceStudentHistory>();
    for (const item of attendance) {
      const id = `${item.external_class_id}:${item.external_student_id || item.student_name}`;
      const current = histories.get(id) ?? { id, name: item.student_name || "Aluno", student: studentsByExternalId.get(item.external_student_id), records: [] };
      current.records.push(item);
      histories.set(id, current);
    }
    return [...histories.values()].map((history) => ({
      ...history,
      records: [...history.records].sort((first, second) => attendanceSortKey(first).localeCompare(attendanceSortKey(second), "pt-BR")),
    })).filter((history) => {
      const matchesFilter = attendanceFilter === "ALL"
        || (attendanceFilter === "ABSENT" && history.records.some((item) => item.status === "ABSENT"))
        || (attendanceFilter === "PRESENT" && history.records.some((item) => item.status === "PRESENT"));
      const matchesQuery = !normalized || `${history.name} ${history.records.map((item) => `${item.external_class_name} ${item.lesson_title}`).join(" ")}`.toLowerCase().includes(normalized);
      return isActiveKodlandStudent(history.student?.status) && matchesFilter && matchesQuery;
    });
  }, [attendance, attendanceFilter, attendanceStudents, query]);
  const attendanceByClass = useMemo(() => groupBy(attendanceHistories, (history) => history.records[0]?.external_class_name || "Turma não informada"), [attendanceHistories]);

  const whatsAppDraft = (() => {
    const current = storedWhatsAppDraft;
    const target = current?.activityTarget;
    if (!current || !target) return current;
    const student = target.source === "manual"
      ? manualStudents.find(item => item.id === target.student_id)
      : attendanceStudents.find(item => item.external_class_id === target.class_id && (item.external_id === target.student_id || item.id === target.student_id));
    if (!student) return current;
    return refreshWhatsAppDraftContact(current, student);
  })();

  function contactButton(classKey: string, studentKey: string, name: string) {
    const student = classKey.startsWith("manual:")
      ? manualStudents.find((item) => item.id === studentKey)
      : attendanceStudents.find((item) => `kodland:${item.external_class_id}` === classKey && (item.external_id === studentKey || item.id === studentKey));
    const source = classKey.startsWith("manual:") ? "manual" : "kodland";
    const classId = classKey.slice(classKey.indexOf(":") + 1);
    const alert = notifications?.cases.find(item => needsNotificationContact(item) && item.notification.source === source && item.notification.class_id === classId && item.notification.student_id === studentKey && item.notification.category !== "absence");
    const message = alert ? notificationMessage(alert.notification, notifications?.settings?.activity_message_template ?? DEFAULT_ACTIVITY_MESSAGE) : `Olá! Sou o professor de ${name}. Gostaria de conversar sobre as atividades e o acompanhamento das aulas.`;
    return <button type="button" className="activity-whatsapp-button" aria-label={`Mensagem para ${name}`} title={`WhatsApp de ${name}`} onClick={() => setWhatsAppDraft({ studentName: name, phone: student?.phone ?? "", guardian: true, guardianPhone: student?.phone ?? "", studentPhone: demo && student ? localStorage.getItem(`nexusclass.demo.student-phone.${student.id}`) ?? student.student_phone ?? "" : student?.student_phone ?? "", message, activityTarget: { source, class_id: classId, student_id: studentKey } })}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.5 4.2 1.6 6L0 24l6.2-1.6A12 12 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5ZM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.3-.4A10 10 0 1 1 12 22Zm5.5-7.5c-.3-.1-1.8-.9-2.1-1-.3-.1-.5-.1-.7.2l-1 1.2c-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.8.1-.2 0-.4 0-.6L7.8 6.5c-.2-.5-.4-.4-.7-.4h-.6c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.3 3.3 1.5 3.5c.2.2 2.5 3.8 6 5.3 2.2.9 3.1 1 4.2.8.7-.1 1.8-.8 2.1-1.5.2-.8.2-1.4.2-1.5-.1-.2-.3-.3-.6-.5Z" /></svg>
    </button>;
  }

  return (
    <div className="management-grid page-fill-grid">
      <NotificationResolution onContext={resolveNotificationContext} />
      <Modal open={Boolean(whatsAppDraft)} title="Mensagem pelo WhatsApp" onClose={() => setWhatsAppDraft(null)} className="attendance-whatsapp-modal">
        {whatsAppDraft && <div className="form management-form attendance-whatsapp-form">
          <p className="muted">Revise a mensagem para {whatsAppDraft.studentName} antes de enviar.</p>
          <label className="field">Enviar mensagem para<select className="input" value={whatsAppDraft.guardian === false ? "student" : "guardian"} onChange={event => setWhatsAppDraft(current => current ? { ...current, phoneEdited: false, guardian: event.target.value === "guardian", phone: (event.target.value === "guardian" ? whatsAppDraft.guardianPhone : whatsAppDraft.studentPhone) ?? "" } : current)}><option value="guardian">Responsável / contato cadastrado</option><option value="student">Aluno</option></select></label>
          <label className="field">{whatsAppDraft.guardian ? "WhatsApp do responsável" : "Número do WhatsApp"}<Input type="tel" inputMode="tel" autoComplete="off" placeholder="DDD e número" value={whatsAppDraft.phone} onChange={(event) => setWhatsAppDraft((current) => current ? { ...current, phone: event.target.value, phoneEdited: true } : current)} /></label>
          {!whatsAppDraft.phone.trim() && <p className="muted">{whatsAppDraft.guardian ? "Telefone do responsável não cadastrado. Informe o número para enviar." : "Informe o número para enviar."}</p>}
          {whatsAppDraft.activityTarget && notifications && <ActivityMissingList key={`${whatsAppDraft.activityTarget.source}:${whatsAppDraft.activityTarget.class_id}:${whatsAppDraft.activityTarget.student_id}`} target={whatsAppDraft.activityTarget} loadSource={notifications.activitySource} onInsert={(block, previous) => setWhatsAppDraft(current => current ? { ...current, message: previous && current.message.includes(previous) ? current.message.replace(previous, block) : `${current.message.trimEnd()}\n\n${block}` } : current)} />}
          <label className="field">Mensagem
            <textarea aria-label="Mensagem" className="input" rows={5} value={whatsAppDraft.message} onChange={(event) => setWhatsAppDraft((current) => current ? { ...current, message: event.target.value } : current)} />
          </label>
          <div className="form-actions">
            <Button type="button" className="button-ghost" onClick={() => setWhatsAppDraft(null)}>Cancelar</Button>
            <a className="button button-primary" aria-disabled={!/^\d{10,15}$/.test(whatsAppDraft.phone.replace(/\D/g, ""))} href={/^\d{10,15}$/.test(whatsAppDraft.phone.replace(/\D/g, "")) ? whatsappUrl(whatsAppDraft.phone, whatsAppDraft.message) : undefined} target="_blank" rel="noreferrer" onClick={(event) => { if (!/^\d{10,15}$/.test(whatsAppDraft.phone.replace(/\D/g, ""))) event.preventDefault(); else setWhatsAppDraft(null); }}>
              <MessageCircle size={17} aria-hidden="true" /> Enviar no WhatsApp
            </a>
          </div>
        </div>}
      </Modal>
      <Modal open={Boolean(editingManual)} title="Corrigir atividade própria" onClose={() => { if (!savingManual) setEditingManual(null); }}>
        {editingManual && <form className="form management-form" onSubmit={async (event) => {
          event.preventDefault(); setSavingManual(true); setError("");
          try {
            const updated = demo?.onSaveManualActivity
              ? await demo.onSaveManualActivity({ ...editingManual, feedback, status: "corrected" })
              : await manualPedagogyApi.saveActivity({ ...editingManual, feedback, status: "corrected" });
            if (!demo) setManualActivities((current) => current.map((item) => item.id === updated.id ? updated : item));
            setEditingManual(null); setNotice("Atividade corrigida.");
          } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a correção."); }
          finally { setSavingManual(false); }
        }}>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p><strong>{editingManual.title}</strong></p>
          {editingManual.submission_text && <p>Entrega: {editingManual.submission_text}</p>}
          {editingManual.submission_url && <a href={editingManual.submission_url} target="_blank" rel="noreferrer">Abrir entrega</a>}
          <label className="field">Feedback<textarea className="input" value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
          <div className="form-actions"><Button type="submit" disabled={savingManual}>{savingManual ? "Salvando…" : "Concluir correção"}</Button></div>
        </form>}
      </Modal>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{classesContent ? "Alunos, atividades e presença" : "Presença e atividades"}</p>
          <h1>{classesContent ? "Turmas" : "Acompanhamento"}</h1>
        </div>
      </section>
      {error && <div className="activity-load-error" role="alert"><p className="form-error">{error}</p><Button type="button" onClick={() => void load()}>Tentar novamente</Button></div>}
      {!demo && notifications?.autoSync.phase === "error" && <p className="form-error" role="status">{notifications.autoSync.message}</p>}
      {(refreshingData || syncing || (!demo && notifications?.autoSync.phase === "syncing")) && !loading && <p className="muted" role="status">Atualizando {viewMode === "attendance" ? "presença" : "atividades"} em segundo plano… A lista mostra a última consulta concluída.</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <div className="corrections-topbar">
        <nav className="corrections-page-tabs" data-tour={classesContent ? "classes-tabs" : undefined} role="tablist" aria-label={classesContent ? "Áreas de turmas" : "Páginas do acompanhamento"}>
          <button id="activities-tab" type="button" role="tab" aria-controls="corrections-content" aria-selected={viewMode === "activities"} className={viewMode === "activities" ? "active" : ""} onClick={() => setViewMode("activities")}>
            {classesContent ? "Alunos" : "Atividades"}
          </button>
          <button id="attendance-tab" type="button" role="tab" aria-controls="corrections-content" aria-selected={viewMode === "attendance"} className={viewMode === "attendance" ? "active" : ""} onClick={() => setViewMode("attendance")}>
            Presença
          </button>
        </nav>
        <div className="correction-icon-toolbar" data-tour="corrections-filters" role="group" aria-label={`Ferramentas de ${viewMode === "activities" ? "atividades" : "presença"}`}>
          {viewMode === "activities" && classesContent && <div id="classes-toolbar-slot" className="classes-toolbar-slot" />}
          {viewMode === "activities" && !unified && <div className="correction-view-switch" role="group" aria-label="Formato de visualização das atividades">
            <button type="button" aria-label="Lista" title="Visualização em lista" aria-pressed={activitiesView === "list"} className={activitiesView === "list" ? "active" : ""} onClick={() => setActivitiesView("list")}><List size={18} aria-hidden="true" /></button>
            <button type="button" aria-label="Compacto" title="Visualização compacta" aria-pressed={activitiesView === "compact"} className={activitiesView === "compact" ? "active" : ""} onClick={() => setActivitiesView("compact")}><LayoutGrid size={18} aria-hidden="true" /></button>
          </div>}
          <div className="correction-filter-anchor">
            <button ref={filterButton} type="button" className="button button-ghost symbol-action" aria-label="Abrir filtros" title="Filtros" aria-expanded={filtersOpen} aria-controls="correction-filter-dropdown" onClick={() => setFiltersOpen(open => !open)}><Filter size={18} aria-hidden="true" /></button>
            <HeaderDropdown open={filtersOpen} id="correction-filter-dropdown" label="Filtros do acompanhamento" trigger={filterButton} onClose={() => setFiltersOpen(false)} className="correction-filter-dropdown">
        <div className="form">
          {viewMode === "attendance" ? <FavoriteFilterOptions key="attendance" scope={`attendance.${preferenceKey}`} value={attendanceFilter} options={[{ value: "ALL", label: "Todos" }, { value: "ABSENT", label: "Com faltas" }, { value: "PRESENT", label: "Com presença" }]} onChange={value => setAttendanceFilter(value as AttendanceFilter)} />
            : activitiesView === "compact" ? <FavoriteFilterOptions key="activities" scope={`activities.${preferenceKey}`} value={studentDisplayMode} options={[{ value: "complete", label: "Completo" }, { value: "pending", label: "Correções pendentes" }]} onChange={value => setStudentDisplayMode(value as StudentDisplayMode)} />
              : <label className="field">Agrupar por<select className="input" aria-label="Organizar atividades" value={grouping} onChange={(event) => setGrouping(event.target.value as ReviewGrouping)}><option value="class">Turma</option><option value="student">Aluno</option><option value="lesson">Aula</option></select></label>}
        </div>
            </HeaderDropdown>
          </div>
          <Button type="button" className="button-ghost symbol-action" aria-label={searchOpen ? "Fechar busca" : "Abrir busca"} title={searchOpen ? "Fechar e limpar busca" : "Buscar aluno, turma ou atividade"} aria-expanded={searchOpen} aria-controls="correction-search-field" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }}>{searchOpen ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}</Button>
          {kodlandEnabled && hasKodlandGroups && <Button className="button-ghost sync-icon-button" type="button" data-tour="corrections-sync" aria-label={viewMode === "attendance" ? "Atualizar presença" : "Atualizar correções"} title={syncing ? "Atualizando" : viewMode === "attendance" ? "Atualizar presença" : "Atualizar correções"} aria-busy={syncing} onClick={() => void syncCorrections()} disabled={syncing}><RefreshCw size={18} aria-hidden="true" className={syncing ? "sync-icon-spinning" : undefined} /></Button>}
          {viewMode === "attendance" && <Button type="button" className="button-ghost symbol-action" aria-label="Legenda de presença" title="Legenda de presença" aria-haspopup="dialog" aria-expanded={legendOpen} onClick={() => setLegendOpen(true)}><Info size={18} aria-hidden="true" /></Button>}
        </div>
      </div>
      {searchOpen && <Input id="correction-search-field" className="correction-revealed-search" autoFocus aria-label="Buscar correção" placeholder="Buscar aluno, turma ou atividade" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Escape") { setQuery(""); setSearchOpen(false); document.querySelector<HTMLButtonElement>('[aria-label="Fechar busca"]')?.focus(); } }} />}
      <Modal open={legendOpen} title={viewMode === "activities" ? "Legenda das atividades" : "Legenda de presença"} onClose={() => setLegendOpen(false)} className="correction-legend-modal">
        {viewMode === "activities" ? <div className="correction-legend-list" aria-label="Origem das atividades pendentes"><span><i className="activity-legend-swatch is-kodland" aria-hidden="true" />Atividade Kodland pendente de correção</span><span><i className="activity-legend-swatch is-manual" aria-hidden="true" />Atividade própria pendente de correção</span></div>
          : <div className="correction-legend-list" aria-label="Estados de presença">{([
            ["present", "Presente"],
            ["absent", "Falta sem justificativa"],
            ["excused", "Falta justificada"],
            ["late", "Atraso"],
            ["unknown", "Sem confirmação"],
          ] as const).map(([status, label]) => <span key={status}><i className={`attendance-legend-swatch attendance-status-${status}`} aria-hidden="true" />{label}</span>)}</div>}
      </Modal>
      <section id="corrections-content" role="tabpanel" aria-labelledby={viewMode === "activities" ? "activities-tab" : "attendance-tab"} className={`panel corrections-panel corrections-panel-${viewMode} page-fill-panel`}>
        {viewMode === "attendance" ? <>
        <ManualAttendanceGrid adapter={demo?.manualAdapter} />
        {loading ? <p className="muted" role="status">Carregando presença…</p> : attendanceHistories.length === 0 ? <div>
          <p className="muted">{attendance.length === 0 ? "Nenhum registro de presença carregado. Use Atualizar para consultar a Kodland." : "Nenhum registro de presença para este filtro."}</p>
        </div> : <div className="correction-class-list attendance-list">
          {attendanceByClass.map(([className, histories]) => <details
            className="correction-class-group attendance-class-group"
            key={className}
            open={openAttendanceClasses.has(className)}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setOpenAttendanceClasses((current) => {
                const next = new Set(current);
                if (isOpen) next.add(className); else next.delete(className);
                return next;
              });
            }}
          >
            <summary className="correction-class-heading"><div><h3>{className}</h3><span>{histories.length} aluno{histories.length === 1 ? "" : "s"}</span></div><ChevronDown className="correction-disclosure" size={18} aria-hidden="true" /></summary>
            <div className="correction-class-body attendance-class-body"><AttendanceClassGrid histories={histories} lessons={lessons} groups={groups} classOpen={openAttendanceClasses.has(className)} onWhatsApp={setWhatsAppDraft} contactButton={contactButton} /></div>
          </details>)}
        </div>}
        </> : <>
        {classesContent && <div className="classes-integrated-actions" data-tour="classes-management">{classesContent}</div>}
        {loading ? <p className="muted" role="status">Carregando correções…</p> : (activitiesView === "compact" ? compactActivities.length === 0 : visibleReviews.length + visibleOwn.length === 0) ? <p className="muted correction-empty-state">Nenhum aluno ou atividade para os filtros atuais.</p> : activitiesView === "compact" ? <CompactActivitiesGrid
          model={compactActivities}
          contactButton={contactButton}
          pendingOnly={pendingOnly}
          displayMode={studentDisplayMode}
          demo={demo}
          onCorrectManual={(activity) => { setEditingManual(activity); setFeedback(activity.feedback); }}
        /> : <div className="correction-class-list" data-tour="corrections-cards">
          {ownByClass.map(([className, classActivities]) => {
            const ownGroups = grouping === "class" ? [] : groupBy(classActivities, (item) => grouping === "student"
              ? manualStudents.find((student) => student.id === item.student_id)?.name || "Aluno"
              : item.occurrence_id);
            const card = (item: ManualActivity, showStudent: boolean) => <article className="entity-card correction-card" key={item.id}>
              <div className="correction-card-copy"><div className="correction-card-top">
                {showStudent && <div className="activity-student-heading"><h4>{manualStudents.find((student) => student.id === item.student_id)?.name || "Aluno"}</h4>{contactButton(`manual:${item.class_id}`, item.student_id, manualStudents.find((student) => student.id === item.student_id)?.name || "Aluno")}</div>}
                <StatusBadge tone="warning">Entregue</StatusBadge>
              </div><p className="correction-card-lesson">Aula {item.occurrence_id.split(":").at(-1)}</p>
                <p className="correction-card-task" title={item.title}><span className="sr-only">Atividade</span>{item.title}</p></div>
              <div className="card-actions"><Button type="button" className="correction-action" aria-label="Corrigir" title="Corrigir atividade" onClick={() => { setEditingManual(item); setFeedback(item.feedback); }}><ClipboardCheck size={18} aria-hidden="true" /></Button></div>
            </article>;
            return <details className="correction-class-group" key={`manual:${className}`}>
              <summary className="correction-class-heading"><div><h3>{className}</h3><span>{classActivities.length} pendência{classActivities.length === 1 ? "" : "s"}</span></div><ChevronDown className="correction-disclosure" size={18} aria-hidden="true" /></summary>
              <div className="correction-class-body">{grouping === "class"
                ? <div className="entity-list">{classActivities.map((item) => card(item, true))}</div>
                : <div className="correction-subgroup-list">{ownGroups.map(([label, items]) => <section className={`correction-subgroup${grouping === "student" ? " correction-subgroup-student" : ""}`} key={label}>
                  <div className="correction-subgroup-heading"><div className="activity-student-heading"><h4>{label}</h4>{grouping === "student" && contactButton(`manual:${items[0].class_id}`, items[0].student_id, label)}</div><span>{items.length} pendência{items.length === 1 ? "" : "s"}</span></div>
                  <div className="entity-list">{items.map((item) => card(item, grouping !== "student"))}</div>
                </section>)}</div>}</div>
            </details>;
          })}
          {reviewsByClass.map(([className, classReviews]) => {
            const internalGroups = grouping === "class"
              ? []
              : groupBy(
                  classReviews,
                  grouping === "student"
                    ? (review) => review.student_name || "Aluno não informado"
                    : (review) => lessonLabel(review, lessons),
                );
            return <details className="correction-class-group" key={className}>
              <summary className="correction-class-heading">
                <div>
                  <h3>{className}</h3>
                  <span>{classReviews.length} pendência{classReviews.length === 1 ? "" : "s"}</span>
                </div>
                <ChevronDown className="correction-disclosure" size={18} aria-hidden="true" />
              </summary>
              <div className="correction-class-body">
                {grouping === "class" ? (
                  <div className="entity-list">
                    {classReviews.map((review) => <ReviewCard contact={contactButton(`kodland:${review.external_class_id}`, review.external_student_id, review.student_name)} review={review} lessons={lessons} demo={demo} key={review.id} />)}
                  </div>
                ) : (
                  <div className="correction-subgroup-list">
                    {internalGroups.map(([label, groupedReviews]) => (
                      <section className={`correction-subgroup${grouping === "student" ? " correction-subgroup-student" : ""}`} key={label}>
                        <div className="correction-subgroup-heading"><div className="activity-student-heading"><h4>{label}</h4>{grouping === "student" && contactButton(`kodland:${groupedReviews[0].external_class_id}`, groupedReviews[0].external_student_id, label)}</div><span>{groupedReviews.length} pendência{groupedReviews.length === 1 ? "" : "s"}</span></div>
                        <div className="entity-list">
                          {groupedReviews.map((review) => <ReviewCard contact={contactButton(`kodland:${review.external_class_id}`, review.external_student_id, review.student_name)} review={review} lessons={lessons} showStudent={grouping !== "student"} demo={demo} key={review.id} />)}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </details>;
          })}
        </div>}
        </>}
      </section>
    </div>
  );
}

export default function CorrectionsPage() {
  return <AuthGuard>{(user) => <Shell user={user}><CorrectionsContent preferenceKey={user.id} /></Shell>}</AuthGuard>;
}
