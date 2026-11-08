"use client";

import Link from "next/link";
import { ScheduleEntryAction } from "@/components/schedule-entry-action";
import { Info, RefreshCw } from "lucide-react";
import { type MouseEvent, useCallback, useEffect, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardContent } from "@/components/dashboard-content";
import {
  LessonMaterialModal,
  type LessonMaterialDetails,
} from "@/components/lesson-material-modal";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { reuseSyncedRows } from "@/lib/reuse-synced-rows";
import { syncPaymentsOnEntry } from "@/lib/auto-sync-payroll";
import { useStudentNotifications } from "@/components/student-notifications";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import {
  ApiError,
  dashboardApi,
  holidaysApi,
  kodlandApi,
  manualTeachingApi,
  manualPedagogyApi,
  tutorPreferencesApi,
  type KodlandExtraLesson,
  type KodlandExtraManualStatus,
  type KodlandAvailability,
  type KodlandGroup,
  type KodlandLesson,
  type KodlandReview,
  type KodlandStudent,
  type DashboardResponse,
} from "@/lib/api";
import { holidaysForDate, type CustomHoliday } from "@/lib/holidays";
import { kodlandLessonLocation } from "@/lib/kodland-lessons";
import { readKodlandLocal } from "@/lib/kodland-sync-client";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import { freeAvailabilityWindows } from "@/lib/availability-windows";
import {
  kodlandExtraSchedulePresentation,
  type KodlandExtraScheduleState,
} from "@/lib/kodland-extra-status";
import { activeStudentsRankedByPoints, kodlandStudentPoints } from "@/lib/student-ranking";
import { generateRecurringOccurrences } from "@/lib/teaching-finance";
import { pendingManualActivities } from "@/lib/manual-pedagogy";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import { nextScheduleCallBoundary, safeScheduleCallUrl, type ScheduleCallLink } from "@/lib/schedule-call";
import { addCalendarDays, calendarDay, DEFAULT_SYNC_TIME_ZONE, occurrenceKey, occurrenceTimes, syncTimeZone, zonedInstant } from "@/lib/sync-policy";
import { subscribeSyncDataChanged } from "@/lib/sync-events";
import { createStudentNotificationStore } from "@/lib/student-notification-store";

const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
type ScheduleEntry = {
  id: string;
  day: number;
  start: string;
  end: string;
  title: string;
  detail?: string;
  extra: boolean;
  extraState?: KodlandExtraScheduleState;
  extraLesson?: KodlandExtraLesson;
  availability?: boolean;
  lesson?: KodlandLesson;
  group?: KodlandGroup;
  manualClass?: ManualClass;
  date?: string;
};
const dateOnly = (value: string) =>
  value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
const normalizeLessonTitle = (value: string) =>
  value
    .toLocaleLowerCase()
    .replace(/м/g, "m")
    .replace(/[^\p{L}\p{N}]+/gu, "");
const timeOnly = (value: string) =>
  value.match(/\b\d{1,2}:\d{2}/)?.[0]?.padStart(5, "0") ?? "";
const addMinutes = (time: string, minutes: number) => {
  const [hour, minute] = time.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return "—";
  const total = hour * 60 + minute + minutes;
  return `${String(Math.floor((total % 1440) / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
const courseDuration = (group: KodlandGroup) =>
  Number(group.course_name.match(/\[(\d+)\s*min\]/i)?.[1] ?? 90);
const groupTime = (group: KodlandGroup) => {
  const direct = timeOnly(group.start_date) || timeOnly(group.next_lesson_date);
  if (direct && direct !== "00:00") return direct;
  const match = group.title.match(/[-_](\d{1,2})(?::(\d{2}))?$/);
  return match
    ? `${match[1].padStart(2, "0")}:${(match[2] ?? "00").padStart(2, "0")}`
    : direct || "—";
};
const weekDay = (value: string) => {
  const date = new Date(`${dateOnly(value)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? -1 : (date.getDay() + 6) % 7;
};
const currentWeek = (offset: number, timeZone: string, now: number) => {
  const start = new Date(`${calendarDay(now, timeZone)}T12:00:00`);
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) + offset * 7);
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
const lessonLocation = (lesson?: KodlandLesson) =>
  lesson ? kodlandLessonLocation(lesson) : "Aula não informada";

/** A recurring placeholder must not inherit a call from a different dated occurrence. */
function entryCall(entry: ScheduleEntry | null, timeZone: string): ScheduleCallLink | null {
  const item = entry?.extraLesson ?? entry?.lesson;
  if (item && /cancel|substitu|replacement/i.test(`${item.status} ${"financial_status" in item ? item.financial_status ?? "" : ""}`)) return null;
  if (!item || !entry?.date || dateOnly(item.lesson_date) !== entry.date || timeOnly(item.start_time) !== entry.start || timeOnly(item.end_time) !== entry.end) return null;
  const occurrence = { id: item.id, date: dateOnly(item.lesson_date), startTime: timeOnly(item.start_time), endTime: timeOnly(item.end_time) };
  const times = occurrenceTimes(occurrence, timeZone);
  return times ? { url: item.call_url, occurrenceKey: item.call_occurrence_key, expectedOccurrenceKey: occurrenceKey(occurrence, timeZone), startAt: times.start, endAt: times.end } : null;
}

function ClassroomAction({ call }: { call: ScheduleCallLink | null }) {
  const [now, setNow] = useState(() => Date.now());
  const url = safeScheduleCallUrl(call, now);
  useEffect(() => {
    const timer = window.setTimeout(() => setNow(Date.now()), 0);
    return () => window.clearTimeout(timer);
  }, [call]);
  useEffect(() => {
    const boundary = nextScheduleCallBoundary(call, Date.now());
    if (boundary === null) return;
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(1, Math.min(2_147_483_647, boundary - Date.now())));
    return () => window.clearTimeout(timer);
  }, [call, now]);
  return url ? <a className="button button-primary schedule-modal-call" href={url} target="_blank" rel="noopener noreferrer" onClick={event => { if (!safeScheduleCallUrl(call, Date.now())) event.preventDefault(); }}>Abrir chamada</a> : null;
}

export function WeekSchedule({
  groups,
  students,
  lessons,
  extraLessons,
  availability,
  onRefresh,
  refreshing,
  refreshNotice,
  scheduleLastUpdatedAt,
  onUpdateExtraStatus,
  onMaterialsLoaded,
  customHolidays,
  manualClasses = [],
  externalSyncEnabled,
  demoMode = false,
  timeZone = DEFAULT_SYNC_TIME_ZONE,
}: {
  groups: KodlandGroup[];
  students: KodlandStudent[];
  lessons: KodlandLesson[];
  extraLessons: KodlandExtraLesson[];
  availability: KodlandAvailability[];
  onRefresh: () => void;
  refreshing: boolean;
  refreshNotice: string;
  scheduleLastUpdatedAt: string | null;
  onUpdateExtraStatus: (
    id: string,
    status: KodlandExtraManualStatus,
  ) => Promise<KodlandExtraLesson>;
  onMaterialsLoaded: (lesson: KodlandLesson) => void;
  customHolidays: CustomHoliday[];
  manualClasses?: ManualClass[];
  externalSyncEnabled?: boolean;
  demoMode?: boolean;
  timeZone?: string;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [scheduleNow, setScheduleNow] = useState(() => Date.now());
  useEffect(() => {
    const resume = () => setScheduleNow(Date.now());
    const nextDay = addCalendarDays(calendarDay(scheduleNow, timeZone), 1);
    const midnight = zonedInstant(nextDay, "00:00", timeZone);
    const timer = midnight === null ? null : window.setTimeout(resume, Math.max(1, midnight - Date.now()));
    window.addEventListener("focus", resume);
    return () => { window.removeEventListener("focus", resume); if (timer !== null) window.clearTimeout(timer); };
  }, [scheduleNow, timeZone]);
  const [scheduleInfoOpen, setScheduleInfoOpen] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [selectedCatalogLessonId, setSelectedCatalogLessonId] = useState("");
  const [modalTab, setModalTab] = useState<"lesson" | "students">("lesson");
  const [selectedExtraState, setSelectedExtra] = useState<KodlandExtraLesson | null>(null);
  const selectedExtra = extraLessons.find(item => item.id === selectedExtraState?.id) ?? selectedExtraState;
  const [savingExtraStatus, setSavingExtraStatus] = useState(false);
  const [extraStatusError, setExtraStatusError] = useState("");
  const days = currentWeek(weekOffset, timeZone, scheduleNow);
  const weekState =
    weekOffset === 0 ? "Atual" : weekOffset < 0 ? "Passada" : "Próxima";
  const range = new Set(days.map(isoDate));
  const active = groups.filter((group) => !group.archived);
  const entries: ScheduleEntry[] = lessons
    .filter((lesson) => range.has(dateOnly(lesson.lesson_date)))
    .filter(
      (lesson) =>
        !/substitu|replacement/i.test(lesson.financial_status ?? lesson.status),
    )
    .map((lesson) => ({
      id: `lesson-${lesson.id}`,
      day: weekDay(lesson.lesson_date),
      start: timeOnly(lesson.start_time) || "—",
      end:
        timeOnly(lesson.end_time) ||
        addMinutes(timeOnly(lesson.start_time), 90),
      title: lesson.external_class_name,
      detail: "",
      extra: false,
      lesson,
      group: groups.find((group) => group.external_id === lesson.external_class_id),
      date: dateOnly(lesson.lesson_date),
    }));
  const groupsWithEvent = new Set(entries.map((entry) => entry.title));
  active.forEach((group) => {
    const day = weekDay(group.start_date || group.next_lesson_date);
    const start = groupTime(group);
    if (day < 0 || groupsWithEvent.has(group.title)) return;
    const referenceDate = dateOnly(group.next_lesson_date || group.start_date);
    const allGroupLessons = lessons.filter(
      (lesson) => lesson.external_class_id === group.external_id,
    );
    const groupLessons = allGroupLessons.filter((lesson) =>
      Boolean(dateOnly(lesson.lesson_date)),
    );
    const nextLessonTitle = normalizeLessonTitle(group.next_lesson_title ?? "");
    const linkedLessonId =
      group.next_lesson_id ||
      group.next_lesson_url?.match(/[?&]lessonId=(\d+)/i)?.[1] ||
      "";
    const nearestByDate = [...groupLessons].sort(
      (a, b) =>
        Math.abs(
          Date.parse(dateOnly(a.lesson_date)) - Date.parse(referenceDate),
        ) -
        Math.abs(
          Date.parse(dateOnly(b.lesson_date)) - Date.parse(referenceDate),
      ),
    )[0];
    const scheduledAtSlot = allGroupLessons.filter(
      (lesson) =>
        (lesson.course_index ?? lesson.lesson_number) > 0 &&
        timeOnly(lesson.start_time) === start &&
        Boolean(dateOnly(lesson.lesson_date)),
    );
    const nextScheduledAtSlot =
      scheduledAtSlot
        .filter((lesson) => dateOnly(lesson.lesson_date) >= calendarDay(scheduleNow, timeZone))
        .sort((a, b) => a.lesson_date.localeCompare(b.lesson_date))[0] ??
      [...scheduledAtSlot].sort((a, b) =>
        b.lesson_date.localeCompare(a.lesson_date),
      )[0];
    const nearestLesson =
      // A dated event from the teacher calendar is the same occurrence shown
      // in the platform grid (e.g. M7L28), so it takes precedence over the
      // group's generic “next lesson”, which may refer to a later module.
      nextScheduledAtSlot ??
      allGroupLessons.find(
        (lesson) => linkedLessonId && lesson.id === linkedLessonId,
      ) ??
      allGroupLessons.find(
        (lesson) =>
          nextLessonTitle &&
          normalizeLessonTitle(lesson.title) === nextLessonTitle,
      ) ??
      allGroupLessons.find(
        (lesson) =>
          group.next_lesson_number &&
          lesson.course_index === group.next_lesson_number,
      ) ??
      nearestByDate;
    entries.push({
      id: `recurring-${group.id}`,
      day,
      start,
      end: addMinutes(start, courseDuration(group)),
      title: group.title,
      detail: "",
      extra: false,
      lesson: nearestLesson,
      group,
      date: isoDate(days[day]),
    });
  });
  manualClasses.forEach((classroom) => {
    if (!classroom.schedule_slots?.length) return;
    const occurrences = generateRecurringOccurrences(
      classroom, isoDate(days[0]), isoDate(days[6]), [], [],
    );
    occurrences.forEach((occurrence) => entries.push({
      id: occurrence.id,
      day: weekDay(occurrence.lesson_date),
      start: occurrence.start_time,
      end: addMinutes(occurrence.start_time, occurrence.duration_minutes),
      title: classroom.name,
      extra: false,
      manualClass: classroom,
      date: occurrence.lesson_date,
    }));
  });
  extraLessons
    .filter((lesson) => range.has(dateOnly(lesson.lesson_date)))
    .forEach((lesson) => {
      const presentation = kodlandExtraSchedulePresentation(lesson);
      entries.push({
        id: `extra-${lesson.id}`,
        day: weekDay(lesson.lesson_date),
        start: timeOnly(lesson.start_time) || "—",
        end:
          timeOnly(lesson.end_time) ||
          addMinutes(timeOnly(lesson.start_time), 60),
        title: lesson.student_name || "Aula extra",
        detail: "",
        extra: true,
        extraState: presentation.state,
        extraLesson: lesson,
        date: dateOnly(lesson.lesson_date),
      });
    });
  freeAvailabilityWindows(availability, entries).forEach((slot) => {
    entries.push({
      id: slot.id,
      day: slot.weekday,
      start: timeOnly(slot.start_time),
      end: timeOnly(slot.end_time),
      title: "Disponível",
      detail: "",
      extra: false,
      availability: true,
    });
  });
  return (
    <section className="panel weekly-schedule page-fill-panel" data-tour="dashboard-schedule" aria-busy={refreshing}>
      <div className="section-heading week-section-heading">
        <div className="week-heading-copy">
          <h2>Grade de horários</h2>

        </div>
        <p className="week-header-updated">
          {manualClasses.length > 0 && groups.length === 0 ? "Atualizadas ao salvar" : <>Última atualização: {scheduleLastUpdatedAt ? <time dateTime={scheduleLastUpdatedAt}>{new Intl.DateTimeFormat("pt-BR", { timeZone, dateStyle: "short", timeStyle: "short" }).format(new Date(scheduleLastUpdatedAt))}</time> : "não registrada"}</>}
        </p>
        <button type="button" className="button button-ghost symbol-action week-info-button" aria-label="Informações da grade" title="Atualização e legenda da grade" onClick={() => setScheduleInfoOpen(true)}><Info size={18} aria-hidden="true" /></button>
        <div className="week-actions">
          {externalSyncEnabled && (groups.length > 0 || manualClasses.length === 0) && <button
            className="button button-ghost symbol-action"
            type="button"
            aria-label="Atualizar grade" title={refreshing ? "Atualizando grade" : "Atualizar grade"} aria-busy={refreshing}
            onClick={onRefresh}
            disabled={refreshing}
          >
            <RefreshCw size={18} aria-hidden="true" className={refreshing ? "sync-icon-spinning" : undefined} />
          </button>}
          <div className="week-navigation" aria-label="Navegação semanal">
            <button
              className="button button-ghost compact"
              type="button"
              onClick={() => setWeekOffset((value) => value - 1)}
              aria-label="Semana anterior"
            >
              ←
            </button>
            <span className="week-state">{weekState}</span>
            <button
              className="button button-ghost compact"
              type="button"
              onClick={() => setWeekOffset((value) => value + 1)}
              aria-label="Próxima semana"
            >
              →
            </button>
          </div>
        </div>
      </div>
      <Modal open={scheduleInfoOpen} title="Informações da grade" onClose={() => setScheduleInfoOpen(false)} className="schedule-info-modal">
          <p className="muted week-last-updated">
            {manualClasses.length > 0 && groups.length === 0 ? "Turmas próprias atualizadas ao salvar" : <>Última atualização: {scheduleLastUpdatedAt ? (
              <time dateTime={scheduleLastUpdatedAt}>
                {new Intl.DateTimeFormat("pt-BR", {
                  timeZone,
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(scheduleLastUpdatedAt))}
              </time>
            ) : "não registrada"}</>}
          </p>
      <div className="week-schedule-legend" aria-label="Legenda da grade">
        <span className="week-legend-class">Turma</span>
        <span className="week-legend-extra">Extra pendente</span>
        <span className="week-legend-done">Extra realizada</span>
        <span className="week-legend-availability">Disponível</span>
        <span className="week-legend-holiday">Feriado</span>
      </div>
      </Modal>
      {refreshing && <p role="status" className="schedule-refresh-state">Atualizando grade de horários…</p>}
      <div
        className="week-grid"
        data-tour="dashboard-lesson-details"
        role="grid"
        aria-label="Grade de horários semanal"
      >
        {days.map((date, day) => {
          const dayHoliday = holidaysForDate(isoDate(date), customHolidays)[0];
          const dayEntries = entries
            .filter((entry) => entry.day === day)
            .sort((a, b) => a.start.localeCompare(b.start));
          const isToday = isoDate(date) === calendarDay(scheduleNow, timeZone);
          return (
            <section
              className={`week-day${isToday ? " is-today" : ""}${dayHoliday ? " is-holiday" : ""}`}
              role="gridcell"
              key={isoDate(date)}
            >
              <header>
                <strong>
                  {dayLabels[day]}
                  {isToday && <small>Hoje</small>}
                </strong>
                <span>
                  {date.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                  {dayHoliday && <small className="week-day-holiday" title={dayHoliday.name}>{dayHoliday.name}</small>}
                </span>
              </header>
              {dayEntries.length ? (
                dayEntries.map((entry) => {
                  const className = `week-slot${entry.extra ? " week-slot-extra" : ""}${entry.extraState ? ` week-slot-extra-${entry.extraState}` : ""}${entry.availability ? " week-slot-availability" : ""}`;
                  const contents = <>
                    <time>{entry.start} – {entry.end}</time>
                    <strong>{entry.title}</strong>
                    {entry.detail && <span>{entry.detail}</span>}
                  </>;
                  return entry.group || entry.manualClass || entry.availability || entry.extra ? (
                    <ScheduleEntryAction
                      className={`${className} week-slot-action`}
                      key={entry.id}
                      call={entryCall(entry, timeZone)}
                      label={`Abrir detalhes de ${entry.title}${entry.detail ? `, ${entry.detail}` : ""}`}
                      onDetails={() => {
                        if (entry.extraLesson) {
                          setExtraStatusError("");
                          setSelectedExtra(entry.extraLesson);
                          return;
                        }
                        setSelectedCatalogLessonId("");
                        setModalTab("lesson");
                        setSelectedEntry(entry);
                      }}
                    >
                      {contents}
                    </ScheduleEntryAction>
                  ) : (
                    <article className={className} key={entry.id}>{contents}</article>
                  );
                })
              ) : (
                <p className="week-empty">Sem aula</p>
              )}
            </section>
          );
        })}
      </div>
      {refreshNotice && (
        <p className="notice weekly-schedule-notice" role="status">
          {refreshNotice}
        </p>
      )}
      <Modal
        open={Boolean(selectedEntry?.manualClass)}
        title={selectedEntry?.manualClass?.name ?? "Turma"}
        onClose={() => setSelectedEntry(null)}
      >
        {selectedEntry?.manualClass && <div className="student-profile"><p><strong>{selectedEntry.start} – {selectedEntry.end}</strong> · {selectedEntry.date}</p><p>Turma própria · {selectedEntry.manualClass.student_ids.length} aluno(s)</p><Link className="button button-ghost button-small" href="/classes">Gerenciar turma</Link></div>}
      </Modal>
      <Modal
        open={Boolean(selectedExtra)}
        title={selectedExtra ? `Aula extra · ${selectedExtra.student_name}` : "Aula extra"}
        onClose={() => !savingExtraStatus && setSelectedExtra(null)}
        className="extra-status-modal"
      >
        {selectedExtra && (
          <div className="extra-status-content">
            <p className="muted">
              {new Date(`${selectedExtra.lesson_date}T00:00:00`).toLocaleDateString("pt-BR", {
                day: "2-digit",
                month: "long",
                year: "numeric",
              })} · {selectedExtra.start_time || "Horário não informado"}
              {selectedExtra.end_time ? ` – ${selectedExtra.end_time}` : ""}
            </p>
            <ClassroomAction call={entryCall({ id: selectedExtra.id, day: weekDay(selectedExtra.lesson_date), date: dateOnly(selectedExtra.lesson_date), start: timeOnly(selectedExtra.start_time), end: timeOnly(selectedExtra.end_time), title: selectedExtra.student_name, extra: true, extraLesson: selectedExtra }, timeZone)} />
            {selectedExtra.recording_url && <a className="button button-ghost" href={selectedExtra.recording_url} target="_blank" rel="noopener noreferrer">Ver gravação</a>}
            <section className="extra-status-options" aria-label="Status da aula extra">
              <h3>Atualizar status</h3>
              <button
                type="button"
                className={selectedExtra.manual_status === "PENDING" || (!selectedExtra.manual_status && !selectedExtra.completed) ? "extra-status-option active" : "extra-status-option"}
                disabled={savingExtraStatus}
                onClick={() => void (async () => {
                  setSavingExtraStatus(true);
                  setExtraStatusError("");
                  try {
                    setSelectedExtra(await onUpdateExtraStatus(selectedExtra.id, "PENDING"));
                  } catch (error) {
                    setExtraStatusError(error instanceof Error ? error.message : "Não foi possível atualizar o status.");
                  } finally {
                    setSavingExtraStatus(false);
                  }
                })()}
              >
                <strong>Pendente</strong>
                <span>Aguarda definição; não entra no extrato.</span>
              </button>
              <button
                type="button"
                className={selectedExtra.manual_status === "DONE" || selectedExtra.manual_status === "ACCOUNTED" || (!selectedExtra.manual_status && selectedExtra.completed) ? "extra-status-option active" : "extra-status-option"}
                disabled={savingExtraStatus}
                onClick={() => void (async () => {
                  setSavingExtraStatus(true);
                  setExtraStatusError("");
                  try {
                    setSelectedExtra(await onUpdateExtraStatus(selectedExtra.id, "DONE"));
                  } catch (error) {
                    setExtraStatusError(error instanceof Error ? error.message : "Não foi possível atualizar o status.");
                  } finally {
                    setSavingExtraStatus(false);
                  }
                })()}
              >
                <strong>Realizada</strong>
                <span>Inclui a aula extra no próximo extrato.</span>
              </button>
            </section>
            {extraStatusError && <p className="form-error" role="alert">{extraStatusError}</p>}
          </div>
        )}
      </Modal>
      {(() => {
        const groupLessons = selectedEntry?.group
          ? lessons
              .filter(
                (lesson) =>
                  lesson.external_class_id === selectedEntry.group?.external_id,
              )
              .sort(
                (a, b) =>
                  (a.course_index ?? a.lesson_number) -
                    (b.course_index ?? b.lesson_number) ||
                  a.lesson_date.localeCompare(b.lesson_date),
              )
          : [];
        const scheduledLesson = selectedEntry?.lesson;
        const activeLessonId = selectedCatalogLessonId || scheduledLesson?.id || "";
        const selectedLesson =
          groupLessons.find((lesson) => lesson.id === activeLessonId) ??
          scheduledLesson;
        const selectedLessonIndex = selectedLesson
          ? groupLessons.findIndex((lesson) => lesson.id === selectedLesson.id)
          : -1;
        const scheduledLessonIndex = scheduledLesson
          ? groupLessons.findIndex((lesson) => lesson.id === scheduledLesson.id)
          : -1;
        const previousLesson =
          selectedLessonIndex > 0 ? groupLessons[selectedLessonIndex - 1] : null;
        const nextLesson =
          selectedLessonIndex >= 0 && selectedLessonIndex < groupLessons.length - 1
            ? groupLessons[selectedLessonIndex + 1]
            : null;
        const viewingDifferentLesson = Boolean(
          scheduledLesson &&
            selectedLesson &&
            scheduledLesson.id !== selectedLesson.id,
        );
        const viewingEarlierLesson =
          viewingDifferentLesson &&
          selectedLessonIndex >= 0 &&
          scheduledLessonIndex >= 0 &&
          selectedLessonIndex < scheduledLessonIndex;
        const lessonPeriodLabel = !viewingDifferentLesson
          ? "Hoje"
          : viewingEarlierLesson
            ? "Passada"
            : "Próxima";
        const materialDetails: LessonMaterialDetails | null = selectedLesson
          ? {
              ...selectedLesson,
              classroom_tasks: selectedLesson.classroom_tasks ?? [],
              location: lessonLocation(selectedLesson),
              source: selectedEntry?.group?.title ?? selectedLesson.external_class_name,
              note_key: `kodland:${selectedLesson.external_class_id}:${selectedLesson.id}`,
            }
          : null;
        const classStudents = selectedEntry?.group
          ? activeStudentsRankedByPoints(
              students.filter(
                (student) =>
                  student.external_class_id === selectedEntry.group?.external_id,
              ),
            )
          : [];
        const title = selectedEntry?.availability
          ? "Horário disponível"
          : selectedEntry
            ? `${selectedEntry.group?.title ?? selectedEntry.title} · ${selectedLesson ? lessonLocation(selectedLesson) : "Escolha a aula"}`
            : "Materiais da aula";
        const modalTitle =
          selectedEntry?.group && modalTab === "students"
            ? selectedEntry.group.title + " · Alunos"
            : title;
        const studentsPlatformUrl = !demoMode && selectedEntry?.group
          ? `https://bo.kodland.org/groups/${encodeURIComponent(selectedEntry.group.external_id)}`
          : "";
        return (
          <LessonMaterialModal
            demoMode={demoMode}
            key={selectedLesson?.id ?? selectedEntry?.id ?? "schedule"}
            open={Boolean(selectedEntry && !selectedEntry.manualClass)}
            title={modalTitle}
            lesson={modalTab === "lesson" ? materialDetails : null}
            onMaterialsLoaded={onMaterialsLoaded}
            className={`class-schedule-modal${modalTab === "lesson" && viewingDifferentLesson ? " class-schedule-modal--adjacent" : ""}`}
            onClose={() => {
              setSelectedEntry(null);
              setSelectedCatalogLessonId("");
              setModalTab("lesson");
            }}
          >
            {selectedEntry?.group && (
              <>
                {!viewingDifferentLesson && <ClassroomAction call={entryCall({ ...selectedEntry, lesson: selectedLesson }, timeZone)} />}
                <div className="class-lesson-navigation" aria-label="Navegar entre aulas">
                  <button
                    type="button"
                    className="class-lesson-navigation-button"
                    disabled={!previousLesson}
                    aria-label="Ver conteúdo da aula anterior"
                    title="Aula anterior"
                    onClick={() => {
                      if (!previousLesson) return;
                      setSelectedCatalogLessonId(previousLesson.id);
                      setModalTab("lesson");
                    }}
                  >
                    <span aria-hidden="true">←</span>
                  </button>
                  {modalTab === "students" ? (
                    <button
                      type="button"
                      className="class-lesson-navigation-title class-lesson-navigation-title-button"
                      onClick={() => setModalTab("lesson")}
                    >
                      {lessonPeriodLabel}
                    </button>
                  ) : viewingDifferentLesson ? (
                    <button
                      type="button"
                      className="class-lesson-navigation-title class-lesson-navigation-return"
                      onClick={() => {
                        setSelectedCatalogLessonId("");
                        setModalTab("lesson");
                      }}
                    >
                      Voltar para a aula atual
                    </button>
                  ) : (
                    <strong className="class-lesson-navigation-title">
                      {lessonPeriodLabel}
                    </strong>
                  )}
                  <button
                    type="button"
                    className="class-lesson-navigation-button"
                    disabled={!nextLesson}
                    aria-label="Ver conteúdo da próxima aula"
                    title="Próxima aula"
                    onClick={() => {
                      if (!nextLesson) return;
                      setSelectedCatalogLessonId(nextLesson.id);
                      setModalTab("lesson");
                    }}
                  >
                    <span aria-hidden="true">→</span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={modalTab === "students"}
                    className={modalTab === "students" ? "class-modal-tab active" : "class-modal-tab"}
                    onClick={() => setModalTab("students")}
                  >
                    Alunos <span>{classStudents.length}</span>
                  </button>
                </div>
                {modalTab === "students" && (
                  <div className="class-student-tab">
                    <section className="class-student-ranking" aria-label="Ranking de alunos">
                      <div className="class-student-ranking-heading">
                        <h3>Ranking por pontos</h3>
                        <span>{classStudents.length} aluno{classStudents.length === 1 ? "" : "s"} ativo{classStudents.length === 1 ? "" : "s"}</span>
                      </div>
                      {classStudents.length ? (
                        <ol className="class-student-ranking-list">
                          {classStudents.map((student, index) => {
                            const points = kodlandStudentPoints(student.progress_summary);
                            return (
                              <li className="class-student-ranking-item" key={student.id}>
                                <span className={index < 3 ? "class-student-rank top-three" : "class-student-rank"}>
                                  {index + 1}º
                                </span>
                                <strong>{student.name}</strong>
                                <span className="class-student-points">
                                  {student.progress_summary
                                    ? new Intl.NumberFormat("pt-BR").format(points) + " pts"
                                    : "Sem pontos"}
                                </span>
                              </li>
                            );
                          })}
                        </ol>
                      ) : (
                        <p className="muted">Nenhum aluno ativo encontrado nesta turma.</p>
                      )}
                    </section>
                    {studentsPlatformUrl && (
                      <a
                        className="button secondary class-platform-action"
                        href={studentsPlatformUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir na plataforma
                      </a>
                    )}
                  </div>
                )}
              </>
            )}
            {selectedEntry?.availability ? (
              <section className="lesson-material-section">
                <h3>Disponibilidade</h3>
                <p className="muted">
                  {selectedEntry.start} – {selectedEntry.end} · Horário cadastrado na plataforma.
                </p>
              </section>
            ) : modalTab === "lesson" && selectedEntry && !selectedLesson && (
              <section className="lesson-material-section">
                <h3>Aulas desta turma</h3>
                <p className="muted">
                  O cronograma informa a turma e o horário, mas não indica qual
                  aula do curso corresponde a este encontro. Selecione a aula
                  para ver as tarefas, a lição de casa, os slides e o roteiro.
                </p>
                {groupLessons.length ? (
                  <label className="field">
                    Aula
                    <select
                      className="input"
                      value={selectedCatalogLessonId}
                      onChange={(event) =>
                        setSelectedCatalogLessonId(event.target.value)
                      }
                    >
                      <option value="">Selecione uma aula</option>
                      {groupLessons.map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>
                          {lessonLocation(lesson)} · {lesson.title}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : (
                  <p className="muted">
                    Nenhuma aula sincronizada foi encontrada para esta turma.
                  </p>
                )}
              </section>
            )}
          </LessonMaterialModal>
        );
      })()}
    </section>
  );
}

export function KodlandSummary({
  groups,
  students,
  reviews,
  lessons,
  extraLessons,
  availability,
  onRefresh,
  refreshing,
  refreshNotice,
  scheduleLastUpdatedAt,
  onUpdateExtraStatus,
  onMaterialsLoaded,
  customHolidays,
  manualClasses = [],
  manualStudents = [],
  manualPendingCount = 0,
  demoMode = false,
  onOpenCorrections,
  externalSyncEnabled,
  timeZone,
}: {
  groups: KodlandGroup[];
  students: KodlandStudent[];
  reviews: KodlandReview[];
  lessons: KodlandLesson[];
  extraLessons: KodlandExtraLesson[];
  availability: KodlandAvailability[];
  onRefresh: () => void;
  refreshing: boolean;
  refreshNotice: string;
  scheduleLastUpdatedAt: string | null;
  onUpdateExtraStatus: (
    id: string,
    status: KodlandExtraManualStatus,
  ) => Promise<KodlandExtraLesson>;
  onMaterialsLoaded: (lesson: KodlandLesson) => void;
  customHolidays: CustomHoliday[];
  manualClasses?: ManualClass[];
  manualStudents?: ManualStudent[];
  manualPendingCount?: number;
  demoMode?: boolean;
  onOpenCorrections?: () => void;
  externalSyncEnabled?: boolean;
  timeZone?: string;
}) {
  const active = groups.filter((group) => !group.archived);
  const canExternalSync = externalSyncEnabled ?? !demoMode;
  return (
    <div className="dashboard-grid page-fill-grid">
      <section className="metric-grid kodland-metrics">
        <article className="metric-card">
          <span>Turmas</span>
          <strong>{active.length + manualClasses.filter((item) => item.active).length}</strong>
        </article>
        <article className="metric-card metric-success">
          <span>Alunos ativos</span>
          <strong>{activeStudentsRankedByPoints(students).length + manualStudents.filter((item) => item.active).length}</strong>
        </article>
        <Link className="metric-card metric-card-link" href={demoMode ? "#classes" : "/classes?tab=activities"} onClick={demoMode ? (event: MouseEvent<HTMLAnchorElement>) => { event.preventDefault(); onOpenCorrections?.(); } : undefined} aria-label={`Abrir correções: ${reviews.length + manualPendingCount} pendente(s)`}>
          <span>Correções pendentes</span>
          <strong>{reviews.length + manualPendingCount}</strong>
        </Link>
      </section>
      <WeekSchedule
        demoMode={demoMode}
        timeZone={timeZone}
        groups={groups}
        students={students}
        lessons={lessons}
        extraLessons={extraLessons}
        availability={availability}
        onRefresh={onRefresh}
        refreshing={refreshing}
        refreshNotice={refreshNotice}
        scheduleLastUpdatedAt={scheduleLastUpdatedAt}
        onUpdateExtraStatus={onUpdateExtraStatus}
        onMaterialsLoaded={onMaterialsLoaded}
        customHolidays={customHolidays}
        manualClasses={manualClasses}
        externalSyncEnabled={canExternalSync}
      />
    </div>
  );
}

function DashboardPageContent({ uid }: { uid: string }) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [reviews, setReviews] = useState<KodlandReview[]>([]);
  const [lessons, setLessons] = useState<KodlandLesson[]>([]);
  const [extraLessons, setExtraLessons] = useState<KodlandExtraLesson[]>([]);
  const [availability, setAvailability] = useState<KodlandAvailability[]>([]);
  const [customHolidays, setCustomHolidays] = useState<CustomHoliday[]>([]);
  const [manualClasses, setManualClasses] = useState<ManualClass[]>([]);
  const [manualStudents, setManualStudents] = useState<ManualStudent[]>([]);
  const [manualPendingCount, setManualPendingCount] = useState(0);
  const [localOnly, setLocalOnly] = useState(false);
  const [financialFailed, setFinancialFailed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshingSchedule, setRefreshingSchedule] = useState(false);
  const [refreshNotice, setRefreshNotice] = useState("");
  const [scheduleLastUpdatedAt, setScheduleLastUpdatedAt] = useState<string | null>(null);
  const [kodlandEnabled, setKodlandEnabled] = useState(false);
  const [timeZone, setTimeZone] = useState(DEFAULT_SYNC_TIME_ZONE);

  useEffect(() => {
    if (!refreshNotice) return;
    const timeout = window.setTimeout(() => setRefreshNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [refreshNotice]);
  const financialEntry = useRef<Promise<boolean> | null>(null);
  const financialReady = useRef(false);
  const [financialNotice, setFinancialNotice] = useState("");
  const notifications = useStudentNotifications();
  const readFinancial = useCallback(async (local: boolean) => {
    const read = () => readKodlandLocal(() => dashboardApi.get({ useLocalKodland: local }), crypto.randomUUID(), "Resumo financeiro", 8000);
    const awaitingEntry = !financialReady.current;
    const initial = await read();
    if (!financialEntry.current) financialEntry.current = (async () => {
      try {
        const result = await syncPaymentsOnEntry(initial.payments, { timeZone: DEFAULT_SYNC_TIME_ZONE, refreshOnEntry: true });
        if (["pending", "auth_required", "credentials_required"].includes(result.status)) setFinancialNotice("Pagamentos: não foi possível atualizar a Kodland. Exibindo a última consulta salva.");
        return result.updated > 0;
      } catch { setFinancialNotice("Pagamentos: não foi possível atualizar a Kodland. Exibindo a última consulta salva."); }
      return false;
    })();
    const changed = await financialEntry.current;
    const result = changed && awaitingEntry ? await read() : initial;
    financialReady.current = true;
    return result;
  }, []);
  const loadLocalFinance = useCallback(async () => {
    setFinancialFailed(false);
    setDashboard(null);
    try {
      const financial = await readFinancial(true);
      setDashboard(financial);
    } catch { setFinancialFailed(true); }
  }, [readFinancial]);
  const load = useCallback(async (keepContent = false) => {
    setFailed(false);
    if (!keepContent) setDashboard(null);
    try {
      const browser = await kodlandApi.browserState();
      setLocalOnly(Boolean(browser?.active));
      if (browser?.active) {
        const [groups, students, lessons, reviews, extras, availability] = await Promise.all([kodlandApi.groups(), kodlandApi.students(), kodlandApi.lessons(), kodlandApi.reviews(), kodlandApi.extraLessons(), kodlandApi.availability()]);
        setKodlandEnabled(true); setGroups(groups.items); setStudents(students.items); setLessons(lessons.items); setReviews(reviews.items); setExtraLessons(extras.items); setAvailability(availability.items); setScheduleLastUpdatedAt(browser.coreAt);
        void loadLocalFinance();
        return true;
      }
      const [preferences, notificationSettings] = await Promise.all([tutorPreferencesApi.get(), createStudentNotificationStore(uid).settings().catch(() => ({ time_zone: DEFAULT_SYNC_TIME_ZONE }))]);
      setTimeZone(syncTimeZone(notificationSettings.time_zone));
      setKodlandEnabled(preferences.kodland_enabled);
      const empty = Promise.resolve({ items: [] });
      const [
        financial,
        kodlandGroups,
        kodlandStudents,
        kodlandReviews,
        kodlandLessons,
        kodlandExtras,
        kodlandAvailability,
        savedHolidays,
        scheduleUpdatedAt,
        ownClasses,
        ownStudents,
        ownActivities,
      ] = await Promise.all([
        readFinancial(false),
        preferences.kodland_enabled ? kodlandApi.groups() : empty,
        preferences.kodland_enabled ? kodlandApi.students() : empty,
        preferences.kodland_enabled ? kodlandApi.reviews() : empty,
        preferences.kodland_enabled ? kodlandApi.lessons() : empty,
        preferences.kodland_enabled ? kodlandApi.extraLessons() : empty,
        preferences.kodland_enabled ? kodlandApi.availability() : empty,
        holidaysApi.list(),
        preferences.kodland_enabled ? kodlandApi.scheduleLastUpdatedAt() : Promise.resolve(null),
        manualTeachingApi.classes(),
        manualTeachingApi.students(),
        manualPedagogyApi.activities(),
      ]);
      setDashboard(financial);
      setGroups(kodlandGroups.items);
      setStudents(kodlandStudents.items);
      setReviews(kodlandReviews.items);
      setLessons(kodlandLessons.items);
      setExtraLessons(kodlandExtras.items);
      setAvailability(kodlandAvailability.items);
      setCustomHolidays(savedHolidays);
      setScheduleLastUpdatedAt(scheduleUpdatedAt);
      setManualClasses(ownClasses);
      setManualStudents(ownStudents);
      setManualPendingCount(pendingManualActivities(ownActivities).length);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }, [uid, loadLocalFinance, readFinancial]);
  useEffect(() => {
    let active = true;
    const unsubscribe = subscribeSyncDataChanged(uid, event => {
      const domains = new Set(event.domains);
      // These APIs read saved application data, never the external platform.
      const updates: Promise<void>[] = [];
      if (domains.has("agenda") || domains.has("recordings") || domains.has("call_link")) {
        const roster = ["essential", "schedule", "classroom", "corrections"].includes(event.resourceId);
        updates.push(Promise.all([kodlandApi.lessons(), kodlandApi.extraLessons(), kodlandApi.scheduleLastUpdatedAt(), roster ? kodlandApi.groups() : null, ["essential", "schedule"].includes(event.resourceId) ? kodlandApi.availability() : null]).then(([nextLessons, nextExtras, updatedAt, groups, availability]) => { if (active) { setLessons(current => reuseSyncedRows(current, nextLessons.items)); setExtraLessons(current => reuseSyncedRows(current, nextExtras.items)); setScheduleLastUpdatedAt(updatedAt); if (groups) setGroups(current => reuseSyncedRows(current, groups.items)); if (availability) setAvailability(current => reuseSyncedRows(current, availability.items)); } }));
      }
      if (domains.has("ranking")) updates.push(kodlandApi.students().then(result => { if (active) setStudents(current => reuseSyncedRows(current, result.items)); }));
      if (domains.has("activities")) updates.push(kodlandApi.reviews().then(result => { if (active) setReviews(current => reuseSyncedRows(current, result.items)); }));
      if (domains.has("payments") && financialReady.current) updates.push(dashboardApi.get({ useLocalKodland: localOnly }).then(result => { if (active) setDashboard(result); }));
      void Promise.all(updates).catch(() => { if (active) setRefreshNotice("Os dados foram atualizados. Não foi possível recarregar esta área; tente atualizar a página."); });
    });
    return () => { active = false; unsubscribe(); };
  }, [uid, localOnly]);
  useEffect(() => {
    const reloadHolidays = () => void holidaysApi.list().then(setCustomHolidays).catch(() => undefined);
    window.addEventListener("nexusclass:holidays-changed", reloadHolidays);
    return () => window.removeEventListener("nexusclass:holidays-changed", reloadHolidays);
  }, []);
  useEffect(() => {
    const reload = () => { void load(true); };
    window.addEventListener("nexusclass:manual-teaching-changed", reload);
    return () => window.removeEventListener("nexusclass:manual-teaching-changed", reload);
  }, [load]);
  const refreshSchedule = useCallback(async () => {
    if (refreshingSchedule) return;
    const credentials = await restoreKodlandCredentials();
    if (!credentials) {
      setRefreshNotice("Salve as credenciais em Dados e backup antes de atualizar a grade.");
      return;
    }
    const username = credentials.username.trim();
    const password = credentials.password;

    setRefreshingSchedule(true);
    setRefreshNotice("");
    let synced = false;
    try {
      const result = await kodlandApi.sync(
        username,
        password,
        "schedule",
      );
      synced = true;
      if (!(await load(true))) {
        throw new Error(
          "A sincronização foi concluída, mas não foi possível recarregar a grade.",
        );
      }
      setRefreshNotice(
        `Grade atualizada. ${result.extra_lesson_count ?? 0} aula(s) extra encontrada(s); somente as concluídas entram no extrato.`,
      );
    } catch (reason) {
      setRefreshNotice(
        synced
          ? "A sincronização foi concluída, mas não foi possível atualizar a grade. Recarregue a página."
          : reason instanceof ApiError || reason instanceof KodlandSyncResponseError || reason instanceof KodlandSyncPersistenceError
          ? reason.message
            : "Não foi possível atualizar a grade. Tente novamente.",
      );
    } finally {
      setRefreshingSchedule(false);
    }
  }, [
    load,
    refreshingSchedule,
  ]);
  const updateExtraStatus = useCallback(
    async (id: string, status: KodlandExtraManualStatus) => {
      const updated = await kodlandApi.updateExtraStatus(id, status);
      if (!(await load(true))) {
        throw new Error("O status foi salvo, mas não foi possível atualizar o extrato.");
      }
      return updated;
    },
    [load],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const scheduleNotice = refreshNotice || (notifications?.autoSync.phase === "error" ? (notifications.autoSync.message ?? "Não foi possível atualizar a grade.") : "");
  if (failed) return <DashboardContent state="error" onRetry={load} />;
  if (localOnly) return <><KodlandSummary groups={groups} students={students} reviews={reviews} lessons={lessons} extraLessons={extraLessons} availability={availability} onRefresh={() => void refreshSchedule()} refreshing={refreshingSchedule || notifications?.autoSync.phase === "syncing"} refreshNotice={scheduleNotice} scheduleLastUpdatedAt={scheduleLastUpdatedAt} onUpdateExtraStatus={updateExtraStatus} onMaterialsLoaded={updated => setLessons(items => items.map(item => item.id === updated.id ? updated : item))} customHolidays={[]} manualClasses={[]} manualStudents={[]} manualPendingCount={0} />{financialNotice && <p className="muted" role="status">{financialNotice}</p>}{dashboard ? <DashboardContent state="ready" dashboard={dashboard} onRefresh={loadLocalFinance} /> : financialFailed ? <section className="panel" role="alert"><h2>Competências mensais</h2><p>Não foi possível carregar os dados financeiros.</p><button className="button button-ghost" type="button" onClick={() => void loadLocalFinance()}>Tentar novamente</button></section> : <DashboardContent state="loading" />}</>;
  if (!dashboard) return <DashboardContent state="loading" />;
  return (
    <>
      <KodlandSummary
        groups={groups}
        students={students}
        reviews={reviews}
        lessons={lessons}
        extraLessons={extraLessons}
        availability={availability}
        onRefresh={() => void refreshSchedule()}
        refreshing={refreshingSchedule || notifications?.autoSync.phase === "syncing"}
        refreshNotice={scheduleNotice}
        scheduleLastUpdatedAt={scheduleLastUpdatedAt}
        onUpdateExtraStatus={updateExtraStatus}
        onMaterialsLoaded={(updated) => {
          setLessons((items) => items.map((item) => item.id === updated.id ? updated : item));
        }}
        customHolidays={customHolidays}
        manualClasses={manualClasses}
        manualStudents={manualStudents}
        manualPendingCount={manualPendingCount}
        externalSyncEnabled={kodlandEnabled}
        timeZone={timeZone}
      />
      {financialNotice && <p className="muted" role="status">{financialNotice}</p>}
      <DashboardContent
        state="ready"
        dashboard={dashboard}
        onRefresh={() => void load()}
      />
    </>
  );
}

export default function DashboardPage() {
  return (
    <AuthGuard>
      {(user) => (
        <Shell user={user}>
          <DashboardPageContent key={user.id} uid={user.id} />
        </Shell>
      )}
    </AuthGuard>
  );
}
