"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { DashboardContent } from "@/components/dashboard-content";
import { Shell } from "@/components/shell";
import { dashboardApi, kodlandApi, type DashboardResponse, type KodlandGroup, type KodlandReview, type KodlandStudent } from "@/lib/api";

function DashboardPageContent() {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [reviews, setReviews] = useState<KodlandReview[]>([]);
  const [failed, setFailed] = useState(false);
  const load = useCallback(() => {
    setFailed(false);
    setDashboard(null);
    Promise.all([dashboardApi.get(), kodlandApi.groups(), kodlandApi.students(), kodlandApi.reviews()])
      .then(([financial, kodlandGroups, kodlandStudents, kodlandReviews]) => { setDashboard(financial); setGroups(kodlandGroups.items); setStudents(kodlandStudents.items); setReviews(kodlandReviews.items); })
      .catch(() => setFailed(true));
  }, []);
  useEffect(() => {
    let mounted = true;
    Promise.all([dashboardApi.get(), kodlandApi.groups(), kodlandApi.students(), kodlandApi.reviews()])
      .then(([financial, kodlandGroups, kodlandStudents, kodlandReviews]) => {
        if (mounted) { setDashboard(financial); setGroups(kodlandGroups.items); setStudents(kodlandStudents.items); setReviews(kodlandReviews.items); }
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
    <>{dashboard.total_lessons > 0 ? <DashboardContent state="ready" dashboard={dashboard} /> : null}<KodlandSummary groups={groups} students={students} reviews={reviews} /></>
  ) : (
    <DashboardContent state="loading" />
  );
}

function KodlandSummary({ groups, students, reviews }: { groups: KodlandGroup[]; students: KodlandStudent[]; reviews: KodlandReview[] }) {
  const active = groups.filter((group) => !group.archived);
  const next = active.filter((group) => group.next_lesson_date).sort((a, b) => a.next_lesson_date.localeCompare(b.next_lesson_date))[0];
  if (!groups.length) return <DashboardContent state="ready" dashboard={{ today: "", earned_cents: 0, received_cents: 0, normal_lessons: 0, extra_lessons: 0, normal_earned_cents: 0, extra_earned_cents: 0, planned_cents: 0, future_lessons: 0, total_planned_cents: 0, total_lessons: 0, last_payment: null, next_payment: null, payments: [], progress: [] }} />;
  return <div className="dashboard-grid"><section className="dashboard-heading"><div><p className="eyebrow">RESUMO PEDAGÓGICO</p><h1>Sua rotina Kodland</h1><p className="muted">Dados da última sincronização.</p></div></section><section className="metric-grid"><article className="metric-card"><span>Turmas ativas</span><strong>{active.length}</strong><small>{groups.length} no total</small></article><article className="metric-card metric-success"><span>Alunos</span><strong>{students.length}</strong><small>Em suas turmas</small></article><article className="metric-card"><span>Correções pendentes</span><strong>{reviews.length}</strong><small>Atividades entregues</small></article><article className="metric-card"><span>Próxima aula</span><strong>{next?.title ?? "—"}</strong><small>{next?.next_lesson_date || "Sem agenda informada"}</small></article></section><section className="panel"><div className="section-heading"><h2>Próximas turmas</h2><a className="button button-ghost" href="/kodland">Abrir Kodland</a></div><div className="entity-list">{active.slice(0, 5).map((group) => <article className="entity-card" key={group.id}><div><h3>{group.title}</h3><p className="entity-details">{group.course_name || "Curso não informado"} · {group.student_count} aluno(s)</p><p className="muted">Próxima aula: {group.next_lesson_date || "não informada"}</p></div></article>)}</div></section></div>;
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
