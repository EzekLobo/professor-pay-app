"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardContent } from "@/components/dashboard-content";
import {
  LessonMaterialModal,
  type LessonMaterialDetails,
} from "@/components/lesson-material-modal";
import { Shell } from "@/components/shell";
import {
  dashboardApi,
  kodlandApi,
  type KodlandExtraLesson,
  type KodlandAvailability,
  type KodlandGroup,
  type KodlandLesson,
  type KodlandReview,
  type KodlandStudent,
  type DashboardResponse,
} from "@/lib/api";
import { kodlandLessonLocation } from "@/lib/kodland-lessons";

const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
type ScheduleEntry = {
  id: string;
  day: number;
  start: string;
  end: string;
  title: string;
  detail: string;
  extra: boolean;
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
  lessons,
  extraLessons,
  availability,
}: {
  groups: KodlandGroup[];
  lessons: KodlandLesson[];
  extraLessons: KodlandExtraLesson[];
  availability: KodlandAvailability[];
}) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<ScheduleEntry | null>(null);
  const [selectedCatalogLessonId, setSelectedCatalogLessonId] = useState("");
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
      detail: `Aula ${(lesson.course_index ?? lesson.lesson_number) || "—"}${lesson.title ? ` · ${lesson.title}` : ""}`,
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
      detail: nearestLesson
        ? `Aula ${nearestLesson.course_index ?? nearestLesson.lesson_number} · ${nearestLesson.title}`
        : "Turma semanal",
      extra: false,
      lesson: nearestLesson,
      group,
    });
  });
  extraLessons
    .filter((lesson) => range.has(dateOnly(lesson.lesson_date)))
    .forEach((lesson) =>
      entries.push({
        id: `extra-${lesson.id}`,
        day: weekDay(lesson.lesson_date),
        start: timeOnly(lesson.start_time) || "—",
        end:
          timeOnly(lesson.end_time) ||
          addMinutes(timeOnly(lesson.start_time), 60),
        title: lesson.student_name || "Aula extra",
        detail: lesson.completed ? "Extra concluída" : "Aula extra",
        extra: true,
      }),
    );
  availability.forEach((slot) => {
    entries.push({
      id: slot.id,
      day: slot.weekday,
      start: timeOnly(slot.start_time),
      end: timeOnly(slot.end_time),
      title: "Disponível",
      detail: "Horário cadastrado",
      extra: false,
      availability: true,
    });
  });

  return (
    <section className="panel weekly-schedule">
      <div className="section-heading">
        <h2>Grade de horários</h2>
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
      <div
        className="week-grid"
        role="grid"
        aria-label="Grade de horários semanal"
      >
        {days.map((date, day) => {
          const dayEntries = entries
            .filter((entry) => entry.day === day)
            .sort((a, b) => a.start.localeCompare(b.start));
          return (
            <section className="week-day" role="gridcell" key={isoDate(date)}>
              <header>
                <strong>{dayLabels[day]}</strong>
                <span>
                  {date.toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                  })}
                </span>
              </header>
              {dayEntries.length ? (
                dayEntries.map((entry) => {
                  const className = `week-slot${entry.extra ? " week-slot-extra" : ""}${entry.availability ? " week-slot-availability" : ""}`;
                  const contents = <>
                    <time>{entry.start} – {entry.end}</time>
                    <strong>{entry.title}</strong>
                    <span>{entry.detail}</span>
                  </>;
                  return entry.group ? (
                    <button
                      type="button"
                      className={`${className} week-slot-action`}
                      key={entry.id}
                      onClick={() => {
                        setSelectedCatalogLessonId("");
                        setSelectedEntry(entry);
                      }}
                      aria-label={`Abrir detalhes de ${entry.title}, ${entry.detail}`}
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
        const selectedLesson =
          selectedEntry?.lesson ??
          groupLessons.find((lesson) => lesson.id === selectedCatalogLessonId);
        const materialDetails: LessonMaterialDetails | null = selectedLesson
          ? {
              ...selectedLesson,
              classroom_tasks: selectedLesson.classroom_tasks ?? [],
              location: lessonLocation(selectedLesson),
              source: selectedEntry?.group?.title ?? selectedLesson.external_class_name,
            }
          : null;
        const title = selectedEntry
          ? `${selectedEntry.group?.title ?? selectedEntry.title} · ${selectedLesson ? lessonLocation(selectedLesson) : "Escolha a aula"}`
          : "Materiais da aula";
        return (
          <LessonMaterialModal
            open={Boolean(selectedEntry)}
            title={title}
            lesson={materialDetails}
            onClose={() => {
              setSelectedEntry(null);
              setSelectedCatalogLessonId("");
            }}
          >
            {selectedEntry && !selectedLesson && (
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
}: {
  groups: KodlandGroup[];
  students: KodlandStudent[];
  reviews: KodlandReview[];
  lessons: KodlandLesson[];
  extraLessons: KodlandExtraLesson[];
  availability: KodlandAvailability[];
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
          <span>Alunos</span>
          <strong>{students.length}</strong>
        </article>
        <article className="metric-card">
          <span>Correções pendentes</span>
          <strong>{reviews.length}</strong>
        </article>
      </section>
      <WeekSchedule
        groups={groups}
        lessons={lessons}
        extraLessons={extraLessons}
        availability={availability}
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
  const load = useCallback(() => {
    setFailed(false);
    setDashboard(null);
    Promise.all([
      dashboardApi.get(),
      kodlandApi.groups(),
      kodlandApi.students(),
      kodlandApi.reviews(),
      kodlandApi.lessons(),
      kodlandApi.extraLessons(),
      kodlandApi.availability(),
    ])
      .then(
        ([
          financial,
          kodlandGroups,
          kodlandStudents,
          kodlandReviews,
          kodlandLessons,
          kodlandExtras,
          kodlandAvailability,
        ]) => {
          setDashboard(financial);
          setGroups(kodlandGroups.items);
          setStudents(kodlandStudents.items);
          setReviews(kodlandReviews.items);
          setLessons(kodlandLessons.items);
          setExtraLessons(kodlandExtras.items);
          setAvailability(kodlandAvailability.items);
        },
      )
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  if (failed) return <DashboardContent state="error" onRetry={load} />;
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
      />
      <DashboardContent state="ready" dashboard={dashboard} />
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
