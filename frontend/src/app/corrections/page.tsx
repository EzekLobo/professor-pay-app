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
type ReviewGrouping = "all" | "student" | "lesson";
const lessonLabel = (review: KodlandReview) =>
  `Aula ${review.lesson_number || "–"}: ${review.lesson_title || "Sem título"}`;
const groupBy = <T,>(items: T[], keyFor: (item: T) => string) =>
  [...items.reduce((groups, item) => {
    const key = keyFor(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
    return groups;
  }, new Map<string, T[]>())].sort(([first], [second]) =>
    first.localeCompare(second, "pt-BR"),
  );

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

function ReviewCard({
  review,
  lessons,
}: {
  review: KodlandReview;
  lessons: KodlandLesson[];
}) {
  const lesson = lessonForReview(review, lessons);
  return (
    <article className="entity-card correction-card" key={review.id}>
      <div>
        <div className="entity-title">
          <h4>{review.student_name}</h4>
          <StatusBadge tone="warning">{review.status_label}</StatusBadge>
        </div>
        <p className="entity-details">{lessonLabel(review)}</p>
        <p className="muted">
          {review.task_number ? `${review.task_number}. ` : ""}
          {review.task_title || "Atividade"}
        </p>
        {lesson && <p className="muted">Materiais da aula disponíveis abaixo.</p>}
      </div>
      <div className="card-actions">
        <LessonLinks lesson={lesson} />
        <a
          className="button button-primary"
          target="_blank"
          rel="noreferrer"
          href={review.correction_url}
        >
          Corrigir
        </a>
      </div>
    </article>
  );
}

function Content() {
  const [reviews, setReviews] = useState<KodlandReview[]>([]);
  const [lessons, setLessons] = useState<KodlandLesson[]>([]);
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<ReviewGrouping>("all");
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
  const reviewsByClass = useMemo(
    () => groupBy(visibleReviews, (review) => review.external_class_name || "Turma não informada"),
    [visibleReviews],
  );

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
        <div className="correction-filters" aria-label="Organizar correções">
          <span>Organizar por</span>
          {([
            ["all", "Todos"],
            ["student", "Alunos"],
            ["lesson", "Aulas"],
          ] as const).map(([value, label]) => (
            <button
              className={grouping === value ? "correction-filter active" : "correction-filter"}
              type="button"
              key={value}
              aria-pressed={grouping === value}
              onClick={() => setGrouping(value)}
            >
              {label}
            </button>
          ))}
        </div>
        {loading ? <p className="muted">Carregando correções…</p> : visibleReviews.length === 0 ? <p className="muted">Sem pendências para os filtros atuais.</p> : <div className="correction-class-list">
          {reviewsByClass.map(([className, classReviews]) => {
            const internalGroups = grouping === "all"
              ? []
              : groupBy(
                  classReviews,
                  grouping === "student"
                    ? (review) => review.student_name || "Aluno não informado"
                    : lessonLabel,
                );
            return <section className="correction-class-group" key={className}>
              <div className="correction-class-heading">
                <h3>{className}</h3>
                <span>{classReviews.length} pendência{classReviews.length === 1 ? "" : "s"}</span>
              </div>
              {grouping === "all" ? (
                <div className="entity-list">
                  {classReviews.map((review) => <ReviewCard review={review} lessons={lessons} key={review.id} />)}
                </div>
              ) : (
                <div className="correction-subgroup-list">
                  {internalGroups.map(([label, groupedReviews]) => (
                    <section className="correction-subgroup" key={label}>
                      <h4>{label}</h4>
                      <div className="entity-list">
                        {groupedReviews.map((review) => <ReviewCard review={review} lessons={lessons} key={review.id} />)}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </section>;
          })}
        </div>}
      </section>
    </div>
  );
}

export default function CorrectionsPage() {
  return <AuthGuard>{(user) => <Shell user={user}><Content /></Shell>}</AuthGuard>;
}
