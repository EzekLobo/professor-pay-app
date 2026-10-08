"use client";

import { type FormEvent, useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardContent } from "@/components/dashboard-content";
import {
  LessonMaterialModal,
  type LessonMaterialDetails,
} from "@/components/lesson-material-modal";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button, Input } from "@/components/ui";
import {
  rememberKodlandCredentials,
  restoreKodlandCredentials,
} from "@/lib/browser-credentials";
import {
  ApiError,
  dashboardApi,
  kodlandApi,
  type KodlandExtraLesson,
  type KodlandExtraManualStatus,
  type KodlandAvailability,
  type KodlandGroup,
  type KodlandLesson,
  type KodlandReview,
  type KodlandStudent,
  type DashboardResponse,
} from "@/lib/api";
import { kodlandLessonLocation } from "@/lib/kodland-lessons";
import { freeAvailabilityWindows } from "@/lib/availability-windows";
import {
  kodlandExtraSchedulePresentation,
  type KodlandExtraScheduleState,
} from "@/lib/kodland-extra-status";
import { activeStudentsRankedByPoints, kodlandStudentPoints } from "@/lib/student-ranking";

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
const currentWeek = (offset = 0) => {
  const start = new Date();
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

function WeekSchedule({
  groups,
  students,
  lessons,
  extraLessons,
  availability,
  onRefresh,
  refreshing,
  refreshNotice,
  onUpdateExtraStatus,
}: {
  groups: KodlandGroup[];
  students: KodlandStudent[];
  lessons: KodlandLesson[];
  extraLessons: KodlandExtraLesson[];
  availability: KodlandAvailability[];
  onRefresh: () => void;
  refreshing: boolean;
  refreshNotice: string;
  onUpdateExtraStatus: (
    id: string,
    status: KodlandExtraManualStatus,
  ) => Promise<KodlandExtraLesson>;
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [selectedCatalogLessonId, setSelectedCatalogLessonId] = useState("");
  const [modalTab, setModalTab] = useState<"lesson" | "students">("lesson");
  const [selectedExtra, setSelectedExtra] = useState<KodlandExtraLesson | null>(null);
  const [savingExtraStatus, setSavingExtraStatus] = useState(false);
  const [extraStatusError, setExtraStatusError] = useState("");
  const days = currentWeek(weekOffset);
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
        .filter((lesson) => dateOnly(lesson.lesson_date) >= isoDate(new Date()))
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
    });
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
    <section className="panel weekly-schedule">
      <div className="section-heading">
        <h2>Grade de horários</h2>
        <div className="week-actions">
          <button
            className="button button-ghost button-small"
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? "Atualizando…" : "Atualizar grade"}
          </button>
          <div className="week-navigation" aria-label="Navegação semanal">
            <button
              className="button secondary compact"
              type="button"
              onClick={() => setWeekOffset((value) => value - 1)}
              aria-label="Semana anterior"
            >
              ←
            </button>
            <span className="week-state">{weekState}</span>
            <button
              className="button secondary compact"
              type="button"
              onClick={() => setWeekOffset((value) => value + 1)}
              aria-label="Próxima semana"
            >
              →
            </button>
          </div>
        </div>
      </div>
      <div className="week-schedule-legend" aria-label="Legenda da grade">
        <span className="week-legend-class">Turma</span>
        <span className="week-legend-extra">Extra pendente</span>
        <span className="week-legend-done">Extra realizada</span>
        <span className="week-legend-availability">Disponível</span>
      </div>
      <div
        className="week-grid"
        role="grid"
        aria-label="Grade de horários semanal"
      >
        {days.map((date, day) => {
          const dayEntries = entries
            .filter((entry) => entry.day === day)
            .sort((a, b) => a.start.localeCompare(b.start));
          const isToday = isoDate(date) === isoDate(new Date());
          return (
            <section
              className={isToday ? "week-day is-today" : "week-day"}
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
                  return entry.group || entry.availability || entry.extra ? (
                    <button
                      type="button"
                      className={`${className} week-slot-action`}
                      key={entry.id}
                      onClick={() => {
                        if (entry.extraLesson) {
                          setExtraStatusError("");
                          setSelectedExtra(entry.extraLesson);
                          return;
                        }
                        setSelectedCatalogLessonId("");
                        setModalTab("lesson");
                        setSelectedEntry(entry);
                      }}
                      aria-label={`Abrir detalhes de ${entry.title}${entry.detail ? `, ${entry.detail}` : ""}`}
                    >
                      {contents}
                    </button>
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
        const studentsPlatformUrl = selectedEntry?.group
          ? `https://bo.kodland.org/groups/${encodeURIComponent(selectedEntry.group.external_id)}`
          : "";
        return (
          <LessonMaterialModal
            key={selectedLesson?.id ?? selectedEntry?.id ?? "schedule"}
            open={Boolean(selectedEntry)}
            title={modalTitle}
            lesson={modalTab === "lesson" ? materialDetails : null}
            className="class-schedule-modal"
            titleNotice={
              modalTab === "lesson" && viewingDifferentLesson ? (
                <div className="class-lesson-notice" role="status">
                  <p>
                    Você está vendo o conteúdo da semana {viewingEarlierLesson ? "anterior" : "seguinte"}.
                  </p>
                  <button
                    type="button"
                    className="class-lesson-return"
                    onClick={() => {
                      setSelectedCatalogLessonId("");
                      setModalTab("lesson");
                    }}
                  >
                    Voltar para a aula atual
                  </button>
                </div>
              ) : undefined
            }
            onClose={() => {
              setSelectedEntry(null);
              setSelectedCatalogLessonId("");
              setModalTab("lesson");
            }}
          >
            {selectedEntry?.group && (
              <>
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

function KodlandSummary({
  groups,
  students,
  reviews,
  lessons,
  extraLessons,
  availability,
  onRefresh,
  refreshing,
  refreshNotice,
  onUpdateExtraStatus,
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
  onUpdateExtraStatus: (
    id: string,
    status: KodlandExtraManualStatus,
  ) => Promise<KodlandExtraLesson>;
}) {
  const active = groups.filter((group) => !group.archived);
  return (
    <div className="dashboard-grid">
      <section className="metric-grid kodland-metrics">
        <article className="metric-card">
          <span>Turmas</span>
          <strong>{active.length}</strong>
        </article>
        <article className="metric-card metric-success">
          <span>Alunos ativos</span>
          <strong>{activeStudentsRankedByPoints(students).length}</strong>
        </article>
        <article className="metric-card">
          <span>Correções pendentes</span>
          <strong>{reviews.length}</strong>
        </article>
      </section>
      <WeekSchedule
        groups={groups}
        students={students}
        lessons={lessons}
        extraLessons={extraLessons}
        availability={availability}
        onRefresh={onRefresh}
        refreshing={refreshing}
        refreshNotice={refreshNotice}
        onUpdateExtraStatus={onUpdateExtraStatus}
      />
    </div>
  );
}

function DashboardPageContent() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [reviews, setReviews] = useState<KodlandReview[]>([]);
  const [lessons, setLessons] = useState<KodlandLesson[]>([]);
  const [extraLessons, setExtraLessons] = useState<KodlandExtraLesson[]>([]);
  const [availability, setAvailability] = useState<KodlandAvailability[]>([]);
  const [failed, setFailed] = useState(false);
  const [refreshingSchedule, setRefreshingSchedule] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [refreshNotice, setRefreshNotice] = useState("");
  const [syncUsername, setSyncUsername] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("aulapay.kodland.username") ?? "",
  );

  useEffect(() => {
    if (!refreshNotice) return;
    const timeout = window.setTimeout(() => setRefreshNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [refreshNotice]);
  const [syncPassword, setSyncPassword] = useState("");
  const openSync = useCallback(() => {
    setSyncError("");
    setSyncOpen(true);
    void restoreKodlandCredentials().then((credentials) => {
      if (!credentials) return;
      setSyncUsername((current) => current || credentials.username);
      setSyncPassword((current) => current || credentials.password);
    });
  }, []);
  const load = useCallback(async (keepContent = false) => {
    setFailed(false);
    if (!keepContent) setDashboard(null);
    try {
      const [
        financial,
        kodlandGroups,
        kodlandStudents,
        kodlandReviews,
        kodlandLessons,
        kodlandExtras,
        kodlandAvailability,
      ] = await Promise.all([
        dashboardApi.get(),
        kodlandApi.groups(),
        kodlandApi.students(),
        kodlandApi.reviews(),
        kodlandApi.lessons(),
        kodlandApi.extraLessons(),
        kodlandApi.availability(),
      ]);
      setDashboard(financial);
      setGroups(kodlandGroups.items);
      setStudents(kodlandStudents.items);
      setReviews(kodlandReviews.items);
      setLessons(kodlandLessons.items);
      setExtraLessons(kodlandExtras.items);
      setAvailability(kodlandAvailability.items);
      return true;
    } catch {
      setFailed(true);
      return false;
    }
  }, []);
  const syncSchedule = useCallback(async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (refreshingSchedule) return;
    const username = syncUsername.trim();
    const password = syncPassword;
    if (!username || !password) return;

    setRefreshingSchedule(true);
    setSyncError("");
    setRefreshNotice("");
    try {
      const result = await kodlandApi.sync(username, password);
      window.localStorage.setItem("aulapay.kodland.username", username);
      await rememberKodlandCredentials(form);
      setSyncPassword("");
      if (!(await load(true))) {
        throw new Error(
          "A sincronização foi concluída, mas não foi possível recarregar a grade.",
        );
      }
      setSyncOpen(false);
      setRefreshNotice(
        `Grade atualizada. ${result.extra_lesson_count ?? 0} aula(s) extra encontrada(s); somente as concluídas entram no extrato.`,
      );
    } catch (reason) {
      setSyncError(
        reason instanceof ApiError
          ? reason.message
          : reason instanceof Error
            ? reason.message
            : "Não foi possível atualizar a grade. Tente novamente.",
      );
    } finally {
      setRefreshingSchedule(false);
    }
  }, [load, refreshingSchedule, syncPassword, syncUsername]);
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
  if (failed) return <DashboardContent state="error" onRetry={load} />;
  if (!dashboard) return <DashboardContent state="loading" />;
  return (
    <>
      <Modal
        open={syncOpen}
        title="Atualizar grade"
        onClose={() => !refreshingSchedule && setSyncOpen(false)}
        className="schedule-sync-modal"
      >
        <form className="form management-form" autoComplete="on" onSubmit={syncSchedule}>
          <p className="muted">
            O navegador pode salvar suas credenciais com segurança após a
            primeira atualização. O AulaPay não armazena sua senha.
          </p>
          <label className="field">
            Usuário ou e-mail
            <Input
              name="username"
              type="text"
              required
              autoComplete="username"
              disabled={refreshingSchedule}
              value={syncUsername}
              onChange={(event) => setSyncUsername(event.target.value)}
            />
          </label>
          <label className="field">
            Senha
            <Input
              name="password"
              type="password"
              required
              autoComplete="current-password"
              disabled={refreshingSchedule}
              value={syncPassword}
              onChange={(event) => setSyncPassword(event.target.value)}
            />
          </label>
          {syncError && (
            <p className="form-error" role="alert">
              {syncError}
            </p>
          )}
          <div className="form-actions">
            <Button type="submit" disabled={refreshingSchedule}>
              {refreshingSchedule ? "Atualizando grade…" : "Atualizar grade"}
            </Button>
          </div>
        </form>
      </Modal>
      <KodlandSummary
        groups={groups}
        students={students}
        reviews={reviews}
        lessons={lessons}
        extraLessons={extraLessons}
        availability={availability}
        onRefresh={openSync}
        refreshing={refreshingSchedule}
        refreshNotice={refreshNotice}
        onUpdateExtraStatus={updateExtraStatus}
      />
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
          <DashboardPageContent />
        </Shell>
      )}
    </AuthGuard>
  );
}
