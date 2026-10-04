"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardContent } from "@/components/dashboard-content";
import { Shell } from "@/components/shell";
import {
  dashboardApi,
  kodlandApi,
  type DashboardResponse,
  type KodlandExtraLesson,
  type KodlandGroup,
  type KodlandLesson,
  type KodlandReview,
  type KodlandStudent,
} from "@/lib/api";

const dayLabels = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
type ScheduleEntry = {
  id: string;
  day: number;
  time: string;
  title: string;
  detail: string;
  extra: boolean;
};
const dateOnly = (value: string) =>
  value.match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
const timeOnly = (value: string) =>
  value.match(/\b\d{1,2}:\d{2}/)?.[0]?.padStart(5, "0") ?? "";
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
const currentWeek = () => {
  const start = new Date();
  start.setHours(12, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
};
const isoDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function WeekSchedule({
  groups,
  lessons,
  extraLessons,
}: {
  groups: KodlandGroup[];
  lessons: KodlandLesson[];
  extraLessons: KodlandExtraLesson[];
}) {
  const days = currentWeek();
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
      time: timeOnly(lesson.start_time) || "—",
      title: lesson.external_class_name,
      detail: lesson.title || "Aula",
      extra: false,
    }));
  const groupsWithEvent = new Set(entries.map((entry) => entry.title));
  active.forEach((group) => {
    const day = weekDay(group.start_date || group.next_lesson_date);
    const time = groupTime(group);
    if (day < 0 || groupsWithEvent.has(group.title)) return;
    entries.push({
      id: `recurring-${group.id}`,
      day,
      time,
      title: group.title,
      detail: "Turma semanal",
      extra: false,
    });
  });
  extraLessons
    .filter((lesson) => range.has(dateOnly(lesson.lesson_date)))
    .forEach((lesson) =>
      entries.push({
        id: `extra-${lesson.id}`,
        day: weekDay(lesson.lesson_date),
        time: timeOnly(lesson.start_time) || "—",
        title: lesson.student_name || "Aula extra",
        detail: lesson.completed ? "Extra concluída" : "Aula extra",
        extra: true,
      }),
    );

  return (
    <section className="panel weekly-schedule">
      <div className="section-heading">
        <div>
          <p className="eyebrow">AGENDA DA SEMANA</p>
          <h2>Grade de horários</h2>
        </div>
        <span className="muted">Turmas e extras sincronizadas</span>
      </div>
      <div
        className="week-grid"
        role="grid"
        aria-label="Grade de horários semanal"
      >
        {days.map((date, day) => {
          const dayEntries = entries
            .filter((entry) => entry.day === day)
            .sort((a, b) => a.time.localeCompare(b.time));
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
                dayEntries.map((entry) => (
                  <article
                    className={`week-slot${entry.extra ? " week-slot-extra" : ""}`}
                    key={entry.id}
                  >
                    <time>{entry.time}</time>
                    <strong>{entry.title}</strong>
                    <span>{entry.detail}</span>
                  </article>
                ))
              ) : (
                <p className="week-empty">Sem aula</p>
              )}
            </section>
          );
        })}
      </div>
    </section>
  );
}

function KodlandSummary({
  groups,
  students,
  reviews,
  lessons,
  extraLessons,
}: {
  groups: KodlandGroup[];
  students: KodlandStudent[];
  reviews: KodlandReview[];
  lessons: KodlandLesson[];
  extraLessons: KodlandExtraLesson[];
}) {
  const active = groups.filter((group) => !group.archived);
  const next = active
    .filter((group) => group.next_lesson_date)
    .sort((a, b) => a.next_lesson_date.localeCompare(b.next_lesson_date))[0];
  const today = new Date().toISOString().slice(0, 10);
  const nextLesson = [...lessons]
    .sort((a, b) =>
      `${a.lesson_date} ${a.start_time}`.localeCompare(
        `${b.lesson_date} ${b.start_time}`,
      ),
    )
    .find((lesson) => lesson.lesson_date >= today);
  return (
    <div className="dashboard-grid">
      <section className="metric-grid kodland-metrics">
        <article className="metric-card">
          <span>Turmas ativas</span>
          <strong>{active.length}</strong>
          <small>{groups.length} no total</small>
        </article>
        <article className="metric-card metric-success">
          <span>Alunos</span>
          <strong>{students.length}</strong>
          <small>Em suas turmas</small>
        </article>
        <article className="metric-card">
          <span>Correções pendentes</span>
          <strong>{reviews.length}</strong>
          <small>Atividades entregues</small>
        </article>
        <article className="metric-card">
          <span>Próxima aula</span>
          <strong>{nextLesson?.title ?? next?.title ?? "—"}</strong>
          <small>
            {nextLesson?.lesson_date ||
              next?.next_lesson_date ||
              "Sem agenda informada"}
          </small>
        </article>
      </section>
      <WeekSchedule
        groups={groups}
        lessons={lessons}
        extraLessons={extraLessons}
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
    ])
      .then(
        ([
          financial,
          kodlandGroups,
          kodlandStudents,
          kodlandReviews,
          kodlandLessons,
          kodlandExtras,
        ]) => {
          setDashboard(financial);
          setGroups(kodlandGroups.items);
          setStudents(kodlandStudents.items);
          setReviews(kodlandReviews.items);
          setLessons(kodlandLessons.items);
          setExtraLessons(kodlandExtras.items);
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
      <DashboardContent state="ready" dashboard={dashboard} />
      <KodlandSummary
        groups={groups}
        students={students}
        reviews={reviews}
        lessons={lessons}
        extraLessons={extraLessons}
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
