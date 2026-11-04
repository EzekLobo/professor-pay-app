"use client";
import { FavoriteFilterOptions } from "./favorite-filter-options";
import { ActivityMissingList } from "./activity-missing-list";
import type { ActivityTarget } from "@/lib/activity-missing-list";
import type { StudentNotification } from "@/lib/student-notification-rules";
import { NotificationResolution, useStudentNotifications } from "./student-notifications";
import { subscribeStudentNotifications } from "@/lib/student-notification-store";
import { notificationMessage, needsNotificationContact, DEFAULT_ACTIVITY_MESSAGE } from "@/lib/student-notification-rules";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { MessageCircle, RefreshCw, List, LayoutGrid, Filter, Search, X, ClipboardCheck, Users, Presentation, FileText, BookOpen, Info, MoreVertical, ChevronDown, Eye, EyeOff } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ApiError, kodlandApi, manualCoursesApi, manualOperationsApi, manualPedagogyApi, manualTeachingApi, tutorPreferencesApi, type KodlandAttendance, type KodlandGroup, type KodlandLesson, type KodlandReview, type KodlandStudent } from "@/lib/api";
import { attendanceDateFromSchedule, attendanceLessonParts, lessonForAttendance } from "@/lib/attendance-schedule";
import type { KodlandTaskProgress } from "@/lib/kodland-task-progress";
import type { ManualOccurrence } from "@/lib/manual-operations";
import type { ManualActivity } from "@/lib/manual-pedagogy";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import { pendingManualActivities } from "@/lib/manual-pedagogy";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { activeStudentsRankedByPoints, kodlandStudentPoints, isActiveKodlandStudent } from "@/lib/student-ranking";
import { whatsappUrl } from "@/lib/whatsapp";
import { ManualAttendanceGrid } from "@/components/manual-attendance-grid";
import type { ManualAdapters } from "@/lib/manual-adapters";

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
};
export type CompactActivityRow = {
  key: string;
  name: string;
  email: string;
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
  completionPercent?: number | null;
  pendingCount?: number;
  columns: CompactActivityColumn[];
  rows: CompactActivityRow[];
};
export type CompactActivitiesModel = CompactActivityClass[];
type WhatsAppDraft = { studentName: string; phone: string; message: string; guardian?: boolean; activityTarget?: ActivityTarget };
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
  const ensureRow = (draft: CompactActivityClassDraft, key: string, name: string, email = "") => {
    const current = draft.rows.get(key);
    if (current) return current;
    const row: CompactActivityRow = { key, name: name || "Aluno", email, cells: {} };
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
    const uniqueLessons = [...new Map(lessons.filter(item => item.external_class_id === externalClassId && !/cancel/i.test(item.status)).map(item => [item.source_lesson_id || item.id, item])).values()];
    draft.totalLessons = uniqueLessons.length;
    draft.completedLessons = uniqueLessons.filter(item => item.lesson_passed || /^(held|completed|done|passed|conducted|finished)$/i.test(item.status)).length;
    for (const [index, student] of activeStudentsRankedByPoints(students.filter((item) => item.external_class_id === externalClassId)).entries()) {
      const row = ensureRow(draft, student.external_id || student.id, student.name, student.email);
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
          sortKey: `${String(review.lesson_number).padStart(5, "0")}:${String(review.task_number).padStart(5, "0")}:${review.lesson_title}:${review.task_title}`,
        });
      }
      row.cells[key] ??= { source: "kodland", review };
    }
    if (complete && !pendingOnly) for (const progress of taskProgress.filter(item => item.external_class_id === externalClassId)) {
      const rosterStudent = students.find(item => item.external_class_id === externalClassId && item.external_id === progress.external_student_id);
      if (rosterStudent && !isActiveKodlandStudent(rosterStudent.status)) continue;
      const row = ensureRow(draft, progress.external_student_id, rosterStudent?.name || "Aluno", rosterStudent?.email);
      const catalog = lessons.find(item => item.external_class_id === externalClassId && (item.id === progress.lesson_id || item.source_lesson_id === progress.lesson_id));
      const existing = [...draft.columns.values()].find(column => {
        const cell = row.cells[column.key];
        return cell?.source === "kodland" && cell.review.task_id === progress.task_id && (cell.review.lesson_id === progress.lesson_id || lessonForReview(cell.review, [...lessons])?.id === catalog?.id && Boolean(catalog));
      });
      const key = existing?.key || `kodland:${catalog?.source_lesson_id || catalog?.id || progress.lesson_id}:${progress.task_id}`;
      const parts = attendanceLessonParts({ external_class_id: externalClassId, lesson_id: catalog?.id || progress.lesson_id, lesson_title: catalog?.title || "Aula" } as KodlandAttendance, [...lessons]);
      const label = parts.module ? `${parts.module}${parts.lesson}` : catalog?.title || "Aula";
      if (!draft.columns.has(key)) draft.columns.set(key, { key, lessonLabel: label, moduleLabel: parts.module || undefined, taskLabel: progress.task_title, sortKey: `${String(catalog?.course_index || catalog?.lesson_number || 0).padStart(5, "0")}:00000:${progress.task_title}` });
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
    for (const studentId of manualClass?.student_ids ?? []) {
      const student = manualStudentsById.get(studentId);
      if (student?.active) { const row = ensureRow(draft, student.id, student.name, student.email); row.manualStudent = student; }
    }
    for (const activity of classActivities) {
      const student = manualStudentsById.get(activity.student_id);
      const row = ensureRow(draft, activity.student_id || activity.id, student?.name || "Aluno", student?.email || "");
      const key = `manual:${activity.occurrence_id}:${activity.title.trim().toLocaleLowerCase("pt-BR")}`;
      if (!draft.columns.has(key)) {
        draft.columns.set(key, {
          key,
          lessonLabel: manualOccurrences.find(item => item.id === activity.occurrence_id)?.course_code || compactManualLessonLabel(activity),
          moduleLabel: manualOccurrences.find(item => item.id === activity.occurrence_id)?.course_code.match(/^M\d+/)?.[0],
          taskLabel: activity.title || "Atividade",
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
    completionPercent: draft.totalLessons ? Math.round((draft.completedLessons ?? 0) * 100 / draft.totalLessons) : null,
    pendingCount: [...draft.rows.values()].reduce((count, row) => count + Object.values(row.cells).filter(cell => cell.source === "kodland" || cell.source === "manual" && pendingManualActivities([cell.activity]).length > 0).length, 0),
    columns: [...draft.columns.values()].sort((first, second) => first.sortKey.localeCompare(second.sortKey, "pt-BR")),
    rows: [...draft.rows.values()].filter(row => !pendingOnly || Object.keys(row.cells).length > 0).sort((first, second) => (first.rank ?? Infinity) - (second.rank ?? Infinity) || first.name.localeCompare(second.name, "pt-BR")),
  })).filter(item => !pendingOnly || item.rows.length > 0).sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
}

export interface CorrectionsDemoAdapter {
  reviews: KodlandReview[];
  lessons: KodlandLesson[];
  onSync: () => void | Promise<void>;
  onCorrect: (review: KodlandReview) => void;
  onMaterial?: (lesson: KodlandLesson) => void;
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
}: {
  histories: AttendanceStudentHistory[];
  lessons: KodlandLesson[];
  groups: KodlandGroup[];
  classOpen: boolean;
  onWhatsApp: (draft: WhatsAppDraft) => void;
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
        const phone = history.student?.guardian_phone || history.student?.phone || "";
        const recordsByColumn = new Map(history.records.map((item) => [attendanceColumnKey(item, lessons), item]));
        return <div className="attendance-grid-row" style={gridStyle} role="row" key={history.id}>
          <div className="attendance-student-summary" role="rowheader">
            <div className="attendance-student-copy"><h4>{history.name}</h4></div>
          </div>
          {columns.map((column) => {
            const item = recordsByColumn.get(column.key);
            const className = `attendance-grid-status${item ? ` attendance-status-${item.status.toLowerCase()}` : " attendance-status-empty"}${column.moduleStart ? " attendance-module-start" : ""}`;
            const lessonCode = column.module ? `${column.module}${column.lesson}` : column.lesson;
            const title = item ? `${lessonCode} · ${attendanceDateLabel(column.date)} · ${attendanceStatusLabel(item.status)}` : `${lessonCode} · Sem registro`;
            if (item?.status === "ABSENT") return <button
              className={`${className} attendance-absence-action`}
              type="button"
              aria-label={`Preparar mensagem sobre ${lessonCode} de ${history.name} no WhatsApp`}
              key={column.key}
              title={phone ? `${title} · ${column.title} · Preparar mensagem` : `${title} · ${column.title} · Telefone não cadastrado`}
              disabled={!phone}
              onClick={() => onWhatsApp({ studentName: history.name, phone, message: attendanceMessage(history, item, lessons.find((lesson) => lesson.id === column.key), lessons) })}
            >{lessonCode}</button>;
            return <div className={className} role="cell" aria-label={item ? `${lessonCode}: ${attendanceStatusLabel(item.status)}` : `${lessonCode}: sem registro`} key={column.key} title={title}>{lessonCode}</div>;
          })}
        </div>;
      })}
    </div>
  );
}

/** Compact, class-scoped activity matrix. It is intentionally independent of
 * the view switch so the list mode can continue to render unchanged. */
export function CompactActivitiesGrid({
  model,
  demo,
  onCorrectManual,
  pendingOnly = false,
  contactButton,
}: {
  contactButton?: (classKey: string, studentKey: string, name: string) => ReactNode;
  model: CompactActivitiesModel;
  demo?: CorrectionsDemoAdapter;
  onCorrectManual: (activity: ManualActivity) => void;
  pendingOnly?: boolean;
}) {
  const [emptyFields, setEmptyFields] = useState<Record<string, boolean>>(() => {
    try { const value = JSON.parse(localStorage.getItem("nexusclass.class-empty-fields") ?? "{}"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
  });
  useEffect(() => { try { localStorage.setItem("nexusclass.class-empty-fields", JSON.stringify(emptyFields)); } catch { /* Keep this preference in memory when storage is unavailable. */ } }, [emptyFields]);
  const activitiesRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = activitiesRoot.current;
    if (!root) return;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !(event.target instanceof Element)) return;
      const grid = event.target.closest<HTMLElement>(".compact-activities-grid-scroll");
      if (!grid || !root.contains(grid) || grid.scrollWidth <= grid.clientWidth + 1) return;
      event.preventDefault();
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      const scale = event.deltaMode === 1 ? 20 : event.deltaMode === 2 ? grid.clientWidth : 1;
      grid.scrollLeft += delta * scale;
    };
    root.addEventListener("wheel", onWheel, { passive: false });
    return () => root.removeEventListener("wheel", onWheel);
  }, []);
  const [classAction, setClassAction] = useState<CompactActivityClass | null>(null);
  const [names, setNames] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem("nexusclass.integrated-class-names") ?? "{}"); } catch { return {}; } });
  const [hidden, setHidden] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem("nexusclass.integrated-hidden-classes") ?? "[]"); } catch { return []; } });
  useEffect(() => { localStorage.setItem("nexusclass.integrated-class-names", JSON.stringify(names)); }, [names]);
  useEffect(() => { localStorage.setItem("nexusclass.integrated-hidden-classes", JSON.stringify(hidden)); }, [hidden]);
  const [selected, setSelected] = useState<KodlandStudent | null>(null);
  return <><Modal open={Boolean(selected)} title={selected?.name ?? "Aluno"} onClose={() => setSelected(null)}>{selected && <div className="student-profile"><dl>{[["Status", selected.status], ["Pontuação", `${kodlandStudentPoints(selected.progress_summary)} pts`], ["Progresso", selected.progress_summary], ["E-mail", selected.email], ["Telefone", selected.phone], ["Responsável", selected.guardian_name], ["Telefone do responsável", selected.guardian_phone], ["E-mail do responsável", selected.guardian_email]].filter(([, value]) => value).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>{selected.profile_url && <a className="button button-ghost" href={absoluteUrl(selected.profile_url)} target="_blank" rel="noreferrer">Perfil na Kodland</a>}</div>}</Modal><div ref={activitiesRoot} className="correction-class-list compact-activities-list" aria-label="Atividades pendentes em formato compacto">
    {model.filter(item => !hidden.includes(item.key)).map((original) => {
      const classModel = { ...original, name: names[original.key] || original.name };
      const hideEmpty = !(emptyFields[classModel.key] ?? !pendingOnly);
      const gridStyle = { "--attendance-columns": Math.max(1, classModel.columns.length) } as CSSProperties;
      return <details className="correction-class-group attendance-class-group compact-activities-class" key={classModel.key}>
        <summary className="correction-class-heading">
          <div className="compact-class-copy"><h3>{classModel.name}</h3><small className="compact-class-course" title={classModel.courseName || "Curso não informado"}>{classModel.courseName || "Curso não informado"}</small></div>
          <span className="compact-class-actions"><span className="class-count-badge" aria-label={`${classModel.rows.length} alunos`} title={`${classModel.rows.length} alunos`}><Users size={14} aria-hidden="true" />{classModel.rows.length}</span><span className="class-count-badge class-pending-badge" aria-label={`${classModel.rows.reduce((total, row) => total + Object.keys(row.cells).length, 0)} atividades sem corrigir`} title="Atividades sem corrigir"><ClipboardCheck size={14} aria-hidden="true" />{classModel.rows.reduce((total, row) => total + Object.keys(row.cells).length, 0)}</span><button type="button" className="group-menu-button" aria-label={`${hideEmpty ? "Mostrar" : "Ocultar"} campos vazios de ${classModel.name}`} title={hideEmpty ? "Mostrar campos vazios" : "Ocultar campos vazios"} aria-pressed={!hideEmpty} onClick={event => { event.preventDefault(); event.stopPropagation(); setEmptyFields(current => ({ ...current, [classModel.key]: hideEmpty })); }}>{hideEmpty ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}</button><button type="button" className="group-menu-button" aria-label={`Ações da turma ${classModel.name}`} title="Ações da turma" onClick={event => { event.preventDefault(); setClassAction(classModel); }}><MoreVertical size={18} aria-hidden="true" /></button><ChevronDown className="correction-disclosure" size={18} aria-hidden="true" /></span>
        </summary>
        <div className="correction-class-body attendance-class-body">
          <div className="attendance-grid-scroll compact-activities-grid-scroll" tabIndex={0} role="grid" aria-label={`Atividades pendentes da turma ${classModel.name}`} aria-rowcount={classModel.rows.length + 1} aria-colcount={classModel.columns.length + 1}>
            {<div className="attendance-grid-header compact-activities-grid-header" style={gridStyle} role="row">
              <div className="attendance-grid-corner" role="columnheader">Aluno</div>
              {classModel.columns.map((column) => <div className="attendance-column-heading compact-activity-column-heading" role="columnheader" key={column.key} title={`${column.lessonLabel} · ${column.taskLabel}`}>
                <span className="sr-only">{column.lessonLabel}: {column.taskLabel}</span>
              </div>)}
            </div>}
            {classModel.rows.map((row) => <div className="attendance-grid-row" style={gridStyle} role="row" key={row.key}>
              <div className="attendance-student-summary" role="rowheader">
                <div className="attendance-student-copy"><div className="activity-student-heading"><div className="compact-student-profile">{row.student ? <button type="button" className="compact-student-name" onClick={() => setSelected(row.student!)} aria-label={`Informações de ${row.name}`} title={row.name}>{row.rank}º · {row.name.trim().split(/\s+/).filter((_, index, parts) => index === 0 || index === parts.length - 1).join(" ")}</button> : <h4>{row.name}</h4>}{row.student && <small>{new Intl.NumberFormat("pt-BR").format(kodlandStudentPoints(row.student.progress_summary))} pts</small>}</div>{contactButton?.(classModel.key, row.key, row.name)}</div></div>
              </div>
              {classModel.columns.map((column) => {
                const cell = row.cells[column.key];
                if (!cell) return hideEmpty ? <div className="compact-activity-placeholder" role="gridcell" aria-label={`${row.name}: sem pendência em ${column.lessonLabel}, ${column.taskLabel}`} key={column.key} /> : <div className="attendance-grid-status attendance-status-empty compact-activity-empty" role="gridcell" aria-label={`${row.name}: sem pendência em ${column.lessonLabel}, ${column.taskLabel}`} key={column.key}>—</div>;
                const label = `${row.name}: corrigir ${column.taskLabel} de ${column.lessonLabel}`;
                const actionContent = <><span className="compact-activity-lesson" title={column.lessonLabel}>{column.lessonLabel}</span><span className="compact-activity-task" title={column.taskLabel}>{column.taskLabel}</span></>;
                return <div className="compact-activity-cell" role="gridcell" key={column.key}>
                  {cell.source === "progress" ? <div className={`compact-activity-action compact-activity-progress compact-activity-${cell.progress.state}`} aria-label={`${row.name}: ${column.taskLabel}, ${cell.progress.state === "delivered" ? "Entregue" : cell.progress.state === "missing" ? "Não entregue" : "Sem informação"}`}>{actionContent}<span className="compact-activity-state">{cell.progress.state === "delivered" ? "Entregue" : cell.progress.state === "missing" ? "Não entregue" : "Sem informação"}</span></div> : cell.source === "manual" ? <button type="button" className="compact-activity-action compact-activity-manual" aria-label={label} title={label} onClick={() => onCorrectManual(cell.activity)}>{actionContent}</button>
                    : demo ? <button type="button" className="compact-activity-action" aria-label={label} title={label} onClick={() => demo.onCorrect(cell.review)}>{actionContent}</button>
                      : <a className="compact-activity-action" aria-label={label} title={label} href={cell.review.correction_url} target="_blank" rel="noreferrer">{actionContent}</a>}
                </div>;
              })}
            </div>)}
          </div>
        </div>
      </details>;
    })}
  </div><Modal open={Boolean(classAction)} title={`Turma ${classAction?.name ?? ""}`} onClose={() => setClassAction(null)}>{classAction && <div className="form"><Button type="button" onClick={() => { const name = window.prompt("Novo nome da turma", classAction.name)?.trim(); if (name) setNames(current => ({ ...current, [classAction.key]: name })); setClassAction(null); }}>Renomear turma</Button><Button type="button" className="button-ghost" onClick={() => { if (window.confirm(`Ocultar a turma ${classAction.name} desta visualização?`)) setHidden(current => [...current, classAction.key]); setClassAction(null); }}>Ocultar turma</Button></div>}</Modal></>;
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
        >
          <ClipboardCheck size={18} aria-hidden="true" />
        </a>}
      </div>
    </article>
  );
}

type CorrectionsViewPreferences = {
  viewMode: "attendance" | "activities";
  activitiesView: "list" | "compact";
  pendingOnly: boolean;
  grouping: ReviewGrouping;
  attendanceFilter: AttendanceFilter;
};

export function CorrectionsContent({ demo, preferenceKey = "default", classesContent }: { demo?: CorrectionsDemoAdapter; preferenceKey?: string; classesContent?: ReactNode }) {
  const unified = Boolean(classesContent);

  const notifications = useStudentNotifications();
  const [storedReviews, setReviews] = useState<KodlandReview[]>([]);
  const [storedLessons, setLessons] = useState<KodlandLesson[]>([]);
  const [storedTaskProgress, setTaskProgress] = useState<KodlandTaskProgress[]>([]);
  const [storedManualOccurrences, setManualOccurrences] = useState<ManualOccurrence[]>([]);
  const taskProgress = demo?.taskProgress ?? storedTaskProgress;
  const manualOccurrences = demo?.manualOccurrences ?? storedManualOccurrences;
  const [storedAttendance, setAttendance] = useState<KodlandAttendance[]>([]);
  const [storedStudents, setStudents] = useState<KodlandStudent[]>([]);
  const [storedGroups, setGroups] = useState<KodlandGroup[]>([]);
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
  const filterRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!filtersOpen) return;
    filterRoot.current?.querySelector<HTMLElement>("select, .favorite-filter-choice")?.focus();
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !filterRoot.current?.contains(event.target)) setFiltersOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setFiltersOpen(false);
      filterRoot.current?.querySelector<HTMLButtonElement>("button")?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [filtersOpen]);
  const [legendOpen, setLegendOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [withoutPending, setWithoutPending] = useState(false);
  const [pendingOnly, setPendingOnly] = useState(true);
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("ABSENT");
  const [openAttendanceClasses, setOpenAttendanceClasses] = useState<Set<string>>(() => new Set());
  const [whatsAppDraft, setWhatsAppDraft] = useState<WhatsAppDraft | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(!demo);
  const [syncing, setSyncing] = useState(false);
  const [storedManualActivities, setManualActivities] = useState<ManualActivity[]>([]);
  const [manualCourseNames, setManualCourseNames] = useState<Record<string, string>>({});
  const [storedManualClasses, setManualClasses] = useState<ManualClass[]>([]);
  const [storedManualStudents, setManualStudents] = useState<ManualStudent[]>([]);
  const manualActivities = demo?.manualActivities ?? storedManualActivities;
  const manualClasses = demo?.manualClasses ?? storedManualClasses;
  const manualStudents = demo?.manualStudents ?? storedManualStudents;
  const [hasKodlandGroups, setHasKodlandGroups] = useState(false);
  const [editingManual, setEditingManual] = useState<ManualActivity | null>(null);
  const [feedback, setFeedback] = useState("");
  const [savingManual, setSavingManual] = useState(false);
  const [kodlandEnabled, setKodlandEnabled] = useState(false);
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
      setPendingOnly(typeof stored?.pendingOnly === "boolean" ? stored.pendingOnly : !unified);
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
      localStorage.setItem(`nexusclass.corrections.view.${preferenceKey}`, JSON.stringify({ viewMode, activitiesView, grouping, attendanceFilter, pendingOnly } satisfies CorrectionsViewPreferences));
    } catch { /* The screen remains usable when storage is blocked. */ }
  }, [activitiesView, attendanceFilter, grouping, pendingOnly, preferenceKey, viewMode, viewPreferencesLoaded]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const load = useCallback(async (background = false) => {
    if (demo) {
      const courses = await demo.manualAdapter?.courses.list() ?? [];
      setManualCourseNames(Object.fromEntries(courses.map(course => [course.id, course.name])));
      const enabled = (await demo.manualAdapter?.preferences.get())?.kodland_enabled === true;
      setKodlandEnabled(enabled); setHasKodlandGroups(enabled && (demo.groups?.length ?? 0) > 0); return;
    }
    if (!background) setLoading(true);
    setError("");
    try {
      const localOnly = Boolean((await kodlandApi.browserState())?.active);
      const preferences = localOnly ? { kodland_enabled: true } : await tutorPreferencesApi.get();
      setKodlandEnabled(preferences.kodland_enabled);
      const empty = Promise.resolve({ items: [] });
      const [reviewResult, lessonResult, groupResult, attendanceResult, studentResult, ownActivities, ownClasses, ownStudents, progressResult, ownOccurrences] = await Promise.all([
        preferences.kodland_enabled ? kodlandApi.reviews() : empty, preferences.kodland_enabled ? kodlandApi.lessons() : empty, preferences.kodland_enabled ? kodlandApi.groups() : empty, preferences.kodland_enabled ? kodlandApi.attendance() : empty, preferences.kodland_enabled ? kodlandApi.students() : empty,
        localOnly ? Promise.resolve(null) : manualPedagogyApi.activities(), localOnly ? Promise.resolve(null) : manualTeachingApi.classes(), localOnly ? Promise.resolve(null) : manualTeachingApi.students(),
        preferences.kodland_enabled ? kodlandApi.taskProgress() : empty, localOnly ? Promise.resolve(null) : manualOperationsApi.occurrences(),
      ]);
      setTaskProgress(progressResult.items);
      if (ownOccurrences) setManualOccurrences(ownOccurrences);
      setReviews(reviewResult.items);
      setLessons(lessonResult.items);
      setAttendance(attendanceResult.items);
      setGroups(groupResult.items);
      setHasKodlandGroups(groupResult.items.length > 0);
      if (ownActivities) setManualActivities(ownActivities);
      if (ownClasses) setManualClasses(ownClasses);
      if (!localOnly) { const courses = await manualCoursesApi.list(); setManualCourseNames(Object.fromEntries(courses.map(course => [course.id, course.name]))); }
      if (ownStudents) setManualStudents(ownStudents);
      setStudents(studentResult.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as correções.");
    } finally {
      setLoading(false);
    }
  }, [demo]);

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
    const credentials = await restoreKodlandCredentials();
    if (!credentials) {
      setError("Salve as credenciais em Dados e backup antes de atualizar as correções.");
      return;
    }
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const result = await kodlandApi.sync(
        credentials.username.trim(),
        credentials.password,
        "corrections",
      );
      await load();
      setNotice(
        `${result.review_count ?? 0} atividade(s) pendente(s) foram atualizadas.`,
      );
    } catch (reason) {
      setError(
        reason instanceof ApiError || reason instanceof KodlandSyncResponseError || reason instanceof KodlandSyncPersistenceError
          ? reason.message
          : "Não foi possível atualizar as correções.",
      );
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, demo, viewMode]);

  useEffect(() => {
    if (demo) return;
    let timer: ReturnType<typeof setTimeout>;
    const unsubscribe = subscribeStudentNotifications(change => { if (change !== "source") return; clearTimeout(timer); timer = setTimeout(() => { void load(true); }, 150); });
    return () => { clearTimeout(timer); unsubscribe(); };
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
  const compactActivities = useMemo(() => compactActivitiesModel({
    reviews: visibleReviews,
    lessons,
    manualActivities: visibleOwn,
    groups,
    students: attendanceStudents,
    manualClasses,
    manualStudents,
    manualCourseNames,
    taskProgress,
    attendance,
    manualOccurrences,
    pendingOnly,
  }).map(item => withoutPending ? { ...item, rows: item.rows.filter(row => Object.keys(row.cells).length === 0), columns: [] } : item).filter(item => !withoutPending || item.rows.length > 0).map((item) => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (!normalized || item.name.toLocaleLowerCase("pt-BR").includes(normalized)) return item;
    return { ...item, rows: item.rows.filter(row => `${row.name} ${row.email}`.toLocaleLowerCase("pt-BR").includes(normalized) || Object.keys(row.cells).length > 0) };
  }).filter(item => !query.trim() || item.rows.length > 0 || item.name.toLocaleLowerCase("pt-BR").includes(query.trim().toLocaleLowerCase("pt-BR"))), [attendanceStudents, groups, lessons, manualClasses, manualStudents, manualCourseNames, taskProgress, attendance, manualOccurrences, pendingOnly, withoutPending, query, visibleOwn, visibleReviews]);
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
      const matchesQuery = !normalized || `${history.name} ${history.student?.email ?? ""} ${history.records.map((item) => `${item.external_class_name} ${item.lesson_title}`).join(" ")}`.toLowerCase().includes(normalized);
      return isActiveKodlandStudent(history.student?.status) && matchesFilter && matchesQuery;
    });
  }, [attendance, attendanceFilter, attendanceStudents, query]);
  const attendanceByClass = useMemo(() => groupBy(attendanceHistories, (history) => history.records[0]?.external_class_name || "Turma não informada"), [attendanceHistories]);

  function contactButton(classKey: string, studentKey: string, name: string) {
    const student = classKey.startsWith("manual:")
      ? manualStudents.find((item) => item.id === studentKey)
      : attendanceStudents.find((item) => `kodland:${item.external_class_id}` === classKey && (item.external_id === studentKey || item.id === studentKey));
    const source = classKey.startsWith("manual:") ? "manual" : "kodland";
    const classId = classKey.slice(classKey.indexOf(":") + 1);
    const alert = notifications?.cases.find(item => needsNotificationContact(item) && item.notification.source === source && item.notification.class_id === classId && item.notification.student_id === studentKey && item.notification.category !== "absence");
    const message = alert ? notificationMessage(alert.notification, notifications?.settings?.activity_message_template ?? DEFAULT_ACTIVITY_MESSAGE) : `Olá! Sou o professor de ${name}. Gostaria de conversar sobre as atividades e o acompanhamento das aulas.`;
    return <button type="button" className="activity-whatsapp-button" aria-label={`Mensagem aos responsáveis de ${name}`} title={`WhatsApp dos responsáveis de ${name}`} onClick={() => setWhatsAppDraft({ studentName: name, phone: student?.guardian_phone ?? "", guardian: true, message, activityTarget: { source, class_id: classId, student_id: studentKey } })}>
      <svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" aria-hidden="true"><path d="M20.5 3.5A11.9 11.9 0 0 0 12 0C5.4 0 0 5.4 0 12c0 2.1.5 4.2 1.6 6L0 24l6.2-1.6A12 12 0 0 0 12 24c6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.5-8.5ZM12 22a10 10 0 0 1-5.1-1.4l-.4-.2-3.7 1 1-3.6-.3-.4A10 10 0 1 1 12 22Zm5.5-7.5c-.3-.1-1.8-.9-2.1-1-.3-.1-.5-.1-.7.2l-1 1.2c-.2.2-.4.2-.7.1-1.8-.9-3-1.6-4.2-3.6-.3-.5.3-.5.9-1.8.1-.2 0-.4 0-.6L7.8 6.5c-.2-.5-.4-.4-.7-.4h-.6c-.2 0-.6.1-.9.4-.3.4-1.2 1.2-1.2 2.9s1.3 3.3 1.5 3.5c.2.2 2.5 3.8 6 5.3 2.2.9 3.1 1 4.2.8.7-.1 1.8-.8 2.1-1.5.2-.8.2-1.4.2-1.5-.1-.2-.3-.3-.6-.5Z" /></svg>
    </button>;
  }

  return (
    <div className="management-grid page-fill-grid">
      <NotificationResolution onContext={resolveNotificationContext} />
      <Modal open={Boolean(whatsAppDraft)} title="Mensagem pelo WhatsApp" onClose={() => setWhatsAppDraft(null)} className="attendance-whatsapp-modal">
        {whatsAppDraft && <div className="form management-form attendance-whatsapp-form">
          <p className="muted">Revise a mensagem para {whatsAppDraft.studentName} antes de enviar.</p>
          <label className="field">{whatsAppDraft.guardian ? "WhatsApp do responsável" : "Número do WhatsApp"}<Input type="tel" inputMode="tel" autoComplete="off" placeholder="DDD e número" value={whatsAppDraft.phone} onChange={(event) => setWhatsAppDraft((current) => current ? { ...current, phone: event.target.value } : current)} /></label>
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
      {error && <p className="form-error" role="alert">{error}</p>}
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
          <div className="correction-filter-anchor" ref={filterRoot}>
            <Button type="button" className="button-ghost symbol-action" aria-label="Abrir filtros" title="Filtros" aria-expanded={filtersOpen} aria-controls="correction-filter-dropdown" onClick={() => setFiltersOpen(open => !open)}><Filter size={18} aria-hidden="true" /></Button>
            {filtersOpen && <div id="correction-filter-dropdown" className="correction-filter-dropdown" role="region" aria-label="Filtros do acompanhamento">
        <div className="form">
          {viewMode === "attendance" ? <FavoriteFilterOptions key="attendance" scope={`attendance.${preferenceKey}`} value={attendanceFilter} options={[{ value: "ALL", label: "Todos" }, { value: "ABSENT", label: "Com faltas" }, { value: "PRESENT", label: "Com presença" }]} onChange={value => setAttendanceFilter(value as AttendanceFilter)} />
            : activitiesView === "compact" ? <FavoriteFilterOptions key="activities" scope={`activities.${preferenceKey}`} value={withoutPending ? "clear" : pendingOnly ? "pending" : "all"} options={[{ value: "all", label: "Todos os alunos" }, { value: "pending", label: "Com correções pendentes" }, { value: "clear", label: "Sem correções pendentes" }]} onChange={value => { setPendingOnly(value === "pending"); setWithoutPending(value === "clear"); }} />
              : <label className="field">Agrupar por<select className="input" aria-label="Organizar atividades" value={grouping} onChange={(event) => setGrouping(event.target.value as ReviewGrouping)}><option value="class">Turma</option><option value="student">Aluno</option><option value="lesson">Aula</option></select></label>}
        </div>
            </div>}
          </div>
          <Button type="button" className="button-ghost symbol-action" aria-label={searchOpen ? "Fechar busca" : "Abrir busca"} title={searchOpen ? "Fechar e limpar busca" : "Buscar aluno, turma ou atividade"} aria-expanded={searchOpen} aria-controls="correction-search-field" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setQuery(""); }}>{searchOpen ? <X size={18} aria-hidden="true" /> : <Search size={18} aria-hidden="true" />}</Button>
          {kodlandEnabled && hasKodlandGroups && <Button className="button-ghost sync-icon-button" type="button" data-tour="corrections-sync" aria-label="Atualizar correções" title={syncing ? "Atualizando correções" : "Atualizar correções"} aria-busy={syncing} onClick={() => void syncCorrections()} disabled={syncing}><RefreshCw size={18} aria-hidden="true" className={syncing ? "sync-icon-spinning" : undefined} /></Button>}
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
        {loading ? <p className="muted">Carregando presença…</p> : attendanceHistories.length === 0 ? <p className="muted">Nenhum registro de presença para este filtro.</p> : <div className="correction-class-list attendance-list">
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
            <div className="correction-class-body attendance-class-body"><AttendanceClassGrid histories={histories} lessons={lessons} groups={groups} classOpen={openAttendanceClasses.has(className)} onWhatsApp={setWhatsAppDraft} /></div>
          </details>)}
        </div>}
        </> : <>
        {classesContent && <div className="classes-integrated-actions" data-tour="classes-management">{classesContent}</div>}
        {loading ? <p className="muted">Carregando correções…</p> : (activitiesView === "compact" ? compactActivities.length === 0 : visibleReviews.length + visibleOwn.length === 0) ? <p className="muted correction-empty-state">Sem pendências para os filtros atuais.</p> : activitiesView === "compact" ? <CompactActivitiesGrid
          model={compactActivities}
          contactButton={contactButton}
          pendingOnly={pendingOnly}
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
