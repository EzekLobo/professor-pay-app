"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardContent } from "@/components/dashboard-content";
import { Shell } from "@/components/shell";
import { dashboardApi, kodlandApi, type DashboardResponse, type KodlandGroup, type KodlandLesson, type KodlandReview, type KodlandStudent } from "@/lib/api";

function DashboardPageContent() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [reviews, setReviews] = useState<KodlandReview[]>([]);
  const [lessons, setLessons] = useState<KodlandLesson[]>([]);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    setDashboard(null);
    Promise.all([dashboardApi.get(), kodlandApi.groups(), kodlandApi.students(), kodlandApi.reviews(), kodlandApi.lessons()])
      .then(([financial, kodlandGroups, kodlandStudents, kodlandReviews, kodlandLessons]) => { setDashboard(financial); setGroups(kodlandGroups.items); setStudents(kodlandStudents.items); setReviews(kodlandReviews.items); setLessons(kodlandLessons.items); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    let mounted = true;
    Promise.all([dashboardApi.get(), kodlandApi.groups(), kodlandApi.students(), kodlandApi.reviews(), kodlandApi.lessons()])
      .then(([financial, kodlandGroups, kodlandStudents, kodlandReviews, kodlandLessons]) => {
        if (mounted) { setDashboard(financial); setGroups(kodlandGroups.items); setStudents(kodlandStudents.items); setReviews(kodlandReviews.items); setLessons(kodlandLessons.items); }
      })
      .catch(() => {
        if (mounted) setFailed(true);
      });
    return () => {
      mounted = false;
    };
  }, []);
  if (failed) return <DashboardContent state="error" onRetry={load} />;
  return dashboard ? (
    <>{dashboard.total_lessons > 0 ? <DashboardContent state="ready" dashboard={dashboard} /> : null}<KodlandSummary groups={groups} students={students} reviews={reviews} lessons={lessons} /></>
  ) : (
    <DashboardContent state="loading" />
  );
}

function KodlandSummary({ groups, students, reviews, lessons }: { groups: KodlandGroup[]; students: KodlandStudent[]; reviews: KodlandReview[]; lessons: KodlandLesson[] }) {
  const active = groups.filter((group) => !group.archived);
  const next = active.filter((group) => group.next_lesson_date).sort((a, b) => a.next_lesson_date.localeCompare(b.next_lesson_date))[0];
  const today = new Date().toISOString().slice(0, 10);
  const ordered = [...lessons].sort((a, b) => `${a.lesson_date} ${a.start_time}`.localeCompare(`${b.lesson_date} ${b.start_time}`));
  const nextLesson = ordered.find((lesson) => lesson.lesson_date >= today) ?? null;
  const previousLessons = ordered.filter((lesson) => lesson.lesson_date < today).slice(-3).reverse();
  if (!groups.length) return <DashboardContent state="ready" dashboard={{ today: "", earned_cents: 0, received_cents: 0, normal_lessons: 0, extra_lessons: 0, normal_earned_cents: 0, extra_earned_cents: 0, planned_cents: 0, future_lessons: 0, total_planned_cents: 0, total_lessons: 0, last_payment: null, next_payment: null, payments: [], progress: [] }} />;
  return <div className="dashboard-grid"><section className="metric-grid kodland-metrics"><article className="metric-card"><span>Turmas ativas</span><strong>{active.length}</strong><small>{groups.length} no total</small></article><article className="metric-card metric-success"><span>Alunos</span><strong>{students.length}</strong><small>Em suas turmas</small></article><article className="metric-card"><span>Correções pendentes</span><strong>{reviews.length}</strong><small>Atividades entregues</small></article><article className="metric-card"><span>Próxima aula</span><strong>{nextLesson?.title ?? next?.title ?? "—"}</strong><small>{nextLesson?.lesson_date || next?.next_lesson_date || "Sem agenda informada"}</small></article></section><section className="panel"><div className="section-heading"><h2>Agenda recente</h2><a className="button button-ghost" href="/kodland">Abrir central</a></div>{nextLesson && <article className="entity-card"><div><h3>Próxima aula · {nextLesson.title}</h3><p className="entity-details">{nextLesson.external_class_name} · {nextLesson.lesson_date}{nextLesson.start_time ? ` às ${nextLesson.start_time}` : ""}</p><p className="muted">{nextLesson.homework_title ? `Atividade: ${nextLesson.homework_title}` : "Materiais disponíveis no detalhe da aula."}</p></div><LessonLinks lesson={nextLesson} /></article>}{previousLessons.length > 0 && <div className="entity-list">{previousLessons.map((lesson) => <article className="entity-card" key={lesson.id}><div><h3>Aula anterior · {lesson.title}</h3><p className="entity-details">{lesson.external_class_name} · {lesson.lesson_date}</p></div><LessonLinks lesson={lesson} /></article>)}</div>}{!nextLesson && previousLessons.length === 0 && <p className="muted">Sincronize a agenda para visualizar aulas anteriores e próximas.</p>}</section><section className="panel"><div className="section-heading"><h2>Próximas turmas</h2><a className="button button-ghost" href="/kodland">Abrir central</a></div><div className="entity-list">{active.slice(0, 5).map((group) => <article className="entity-card" key={group.id}><div><h3>{group.title}</h3><p className="entity-details">{group.course_name || "Curso não informado"} · {group.student_count} aluno(s)</p><p className="muted">Próxima aula: {group.next_lesson_date || "não informada"}</p></div></article>)}</div></section></div>;
}

function LessonLinks({ lesson }: { lesson: KodlandLesson }) {
  const links = [["Slides", lesson.slides_url], ["Roteiro", lesson.guide_url], ["Atividade", lesson.homework_url], ["Abrir aula", lesson.external_url]].filter((item): item is [string, string] => Boolean(item[1]));
  return <div className="form-actions">{links.slice(0, 3).map(([label, href]) => <a className="button button-ghost" href={href.startsWith("/") ? `https://bo.kodland.org${href}` : href} target="_blank" rel="noreferrer" key={label}>{label}</a>)}{!lesson.slides_url && !lesson.guide_url && !lesson.homework_url && <a className="button button-primary" href={lesson.external_url} target="_blank" rel="noreferrer">Abrir aula</a>}</div>;
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
