"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardContent } from "@/components/dashboard-content";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import {
  dashboardApi,
  kodlandApi,
  type DashboardResponse,
  type KodlandExtraLesson,
  type KodlandAvailability,
  type KodlandGroup,
  type KodlandLesson,
  type KodlandReview,
  type KodlandStudent,
} from "@/lib/api";

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
const lessonLocation = (lesson?: KodlandLesson) => {
  const match = lesson?.title.match(/[M\u041c]\s*(\d+)\s*\.?\s*L\s*(\d+)/i);
  if (match) return `M${match[1]}L${match[2]}`;
  const moduleNumber = lesson?.module_number?.match(/\d+/)?.[0];
  return moduleNumber && lesson?.lesson_number
    ? `M${moduleNumber}L${lesson.lesson_number}`
    : lesson?.lesson_number
      ? `Aula ${lesson.lesson_number}`
      : "Aula não informada";
};

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
      detail: `Aula ${lesson.lesson_number || "—"}${lesson.title ? ` · ${lesson.title}` : ""}`,
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
    const nearestLesson = lessons
      .filter(
        (lesson) =>
          lesson.external_class_id === group.external_id &&
          Boolean(dateOnly(lesson.lesson_date)),
      )
      .sort(
        (a, b) =>
          Math.abs(Date.parse(dateOnly(a.lesson_date)) - Date.parse(referenceDate)) -
          Math.abs(Date.parse(dateOnly(b.lesson_date)) - Date.parse(referenceDate)),
      )[0];
    entries.push({
      id: `recurring-${group.id}`,
      day,
      start,
      end: addMinutes(start, courseDuration(group)),
      title: group.title,
      detail: "Turma semanal",
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
                      onClick={() => setSelectedEntry(entry)}
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
      <Modal
        open={Boolean(selectedEntry)}
        title={selectedEntry ? `${selectedEntry.group?.title ?? selectedEntry.lesson?.external_class_name ?? "Detalhes da turma"} · ${selectedEntry.start} – ${selectedEntry.end}` : "Detalhes da turma"}
        onClose={() => setSelectedEntry(null)}
      >
        {selectedEntry && (() => {
          const selectedLesson = selectedEntry.lesson;
          const group = selectedEntry.group;
          const courseUrl = selectedLesson?.external_url || (group?.course_id ? `https://bo.kodland.org/courses/${group.course_id}` : "");
          const location = lessonLocation(selectedLesson);
          return (
          <div className="lesson-details">
            <div className="lesson-overview">
              <span className="lesson-location">{lessonLocation(selectedLesson)}</span>
              <strong>{selectedLesson?.title || selectedLesson?.theme || "Aula semanal"}</strong>
            </div>
            {selectedLesson?.theme && selectedLesson.theme !== selectedLesson.title && (
              <p className="muted">{selectedLesson.theme}</p>
            )}
            <section className="lesson-material-section">
              <h3>Tarefas em sala</h3>
              {selectedLesson?.classroom_tasks?.length ? <ul className="lesson-resource-list">
                {selectedLesson.classroom_tasks.map((task) => <li key={task.url}><a href={task.url} target="_blank" rel="noreferrer">{task.title || `Tarefa em sala ${location}`}</a></li>)}
              </ul> : courseUrl ? <ul className="lesson-resource-list"><li><a href={courseUrl} target="_blank" rel="noreferrer">Tarefas em sala {location}</a></li></ul> : <p className="muted">Material não disponível.</p>}
            </section>
            <section className="lesson-material-section">
              <h3>Lição de casa</h3>
              {selectedLesson?.homework_url ? <ul className="lesson-resource-list"><li><a href={selectedLesson.homework_url} target="_blank" rel="noreferrer">{selectedLesson.homework_title || `Lição de casa ${location}`}</a></li></ul> : <p className="muted">Nenhuma lição de casa sincronizada.</p>}
            </section>
            <section className="lesson-material-section">
              <h3>Guias de estudo</h3>
              {selectedLesson?.slides_url || selectedLesson?.guide_url ? <ul className="lesson-resource-list">
                {selectedLesson?.slides_url && <li><a href={selectedLesson.slides_url} target="_blank" rel="noreferrer">Slides {location}</a></li>}
                {selectedLesson?.guide_url && <li><a href={selectedLesson.guide_url} target="_blank" rel="noreferrer">Roteiro {location}</a></li>}
              </ul> : <p className="muted">Slides e roteiro não foram encontrados.</p>}
            </section>
          </div>
          );
        })()}
      </Modal>
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
