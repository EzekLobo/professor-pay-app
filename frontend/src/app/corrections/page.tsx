"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Input, StatusBadge } from "@/components/ui";
import { kodlandApi, type KodlandLesson, type KodlandReview } from "@/lib/api";

const absoluteUrl = (value: string) => value.startsWith("/") ? `https://bo.kodland.org${value}` : value;

const lessonForReview = (review: KodlandReview, lessons: KodlandLesson[]) => lessons.find((lesson) => {
  if (lesson.external_class_id !== review.external_class_id) return false;
  if (lesson.id === review.lesson_id) return true;
  return review.lesson_number > 0 && lesson.lesson_number === review.lesson_number;
});

function LessonLinks({ lesson }: { lesson: KodlandLesson | undefined }) {
  if (!lesson) return null;
  const links = [
    ["Slides", lesson.slides_url],
    ["Roteiro", lesson.guide_url],
    ["Atividade", lesson.homework_url],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const hasMaterial = links.length > 0;
  return (
    <>
      {links.map(([label, href]) => <a className="button button-ghost" href={absoluteUrl(href)} target="_blank" rel="noreferrer" key={label}>{label}</a>)}
      {!hasMaterial && <a className="button button-ghost" href={absoluteUrl(lesson.external_url)} target="_blank" rel="noreferrer">Abrir aula</a>}
    </>
  );
}

function Content() {
  const [reviews, setReviews] = useState<KodlandReview[]>([]);
  const [lessons, setLessons] = useState<KodlandLesson[]>([]);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [reviewResult, lessonResult] = await Promise.all([kodlandApi.reviews(), kodlandApi.lessons()]);
      setReviews(reviewResult.items);
      setLessons(lessonResult.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as correções.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleReviews = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return reviews;
    return reviews.filter((review) => `${review.student_name} ${review.external_class_name} ${review.lesson_title} ${review.task_title}`.toLowerCase().includes(normalized));
  }, [query, reviews]);

  return (
    <div className="management-grid">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Pendências</p>
          <h1>Correções</h1>
        </div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Atividades entregues</h2>
            <span className="muted">{visibleReviews.length} de {reviews.length}</span>
          </div>
          <Input aria-label="Buscar correção" placeholder="Buscar aluno, turma ou atividade" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        {loading ? <p className="muted">Carregando correções…</p> : visibleReviews.length === 0 ? <p className="muted">Sem pendências para os filtros atuais.</p> : <div className="entity-list">
          {visibleReviews.map((review) => {
            const lesson = lessonForReview(review, lessons);
            return <article className="entity-card" key={review.id}>
              <div>
                <div className="entity-title"><h3>{review.student_name}</h3><StatusBadge tone="warning">{review.status_label}</StatusBadge></div>
                <p className="entity-details">{review.external_class_name} · Aula {review.lesson_number || "–"}: {review.lesson_title || "Sem título"}</p>
                <p className="muted">{review.task_number ? `${review.task_number}. ` : ""}{review.task_title || "Atividade"}</p>
                {lesson && <p className="muted">Materiais da aula disponíveis abaixo.</p>}
              </div>
              <div className="card-actions">
                <LessonLinks lesson={lesson} />
                <a className="button button-primary" target="_blank" rel="noreferrer" href={review.correction_url}>Corrigir</a>
              </div>
            </article>;
          })}
        </div>}
      </section>
    </div>
  );
}

export default function CorrectionsPage() {
  return <AuthGuard>{(user) => <Shell user={user}><Content /></Shell>}</AuthGuard>;
}
