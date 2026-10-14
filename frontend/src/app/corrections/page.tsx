"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import { ApiError, kodlandApi, type KodlandLesson, type KodlandReview } from "@/lib/api";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { CorrectionModal } from "@/components/correction-modal";
import { groupReviews as groupBy, lessonLabel, orderedReviews, type ReviewGrouping } from "@/lib/correction-navigation";

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
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const hasMaterial = links.length > 0;
  return (
    <>
      {links.map(([label, href]) => <a className="button button-ghost button-small" href={absoluteUrl(href)} target="_blank" rel="noreferrer" key={label}>{label}</a>)}
      {!hasMaterial && <a className="button button-ghost button-small" href={absoluteUrl(lesson.external_url)} target="_blank" rel="noreferrer">Abrir aula</a>}
    </>
  );
}

function ReviewCard({
  review,
  lessons,
  showStudent = true,
  onCorrect,
}: {
  review: KodlandReview;
  lessons: KodlandLesson[];
  showStudent?: boolean;
  onCorrect: (review: KodlandReview) => void;
}) {
  const lesson = lessonForReview(review, lessons);
  return (
    <article className="entity-card correction-card" key={review.id}>
      <div className="correction-card-copy">
        <div className="correction-card-top">
          {showStudent && <h4>{review.student_name}</h4>}
          <StatusBadge tone="warning">{review.status_label}</StatusBadge>
        </div>
        <p className="correction-card-lesson">{lessonLabel(review)}</p>
        <p className="correction-card-task">
          <span>Atividade</span>
          {review.task_number ? `${review.task_number}. ` : ""}{review.task_title || "Sem título"}
        </p>
      </div>
      <div className="card-actions">
        <LessonLinks lesson={lesson} />
        <button
          className="button button-primary correction-action"
          type="button"
          onClick={() => onCorrect(review)}
        >
          Corrigir
        </button>
      </div>
    </article>
  );
}

function Content() {
  const [reviews, setReviews] = useState<KodlandReview[]>([]);
  const [lessons, setLessons] = useState<KodlandLesson[]>([]);
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<ReviewGrouping>("class");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const syncInProgress = useRef(false);
  const [correctionSession, setCorrectionSession] = useState<{ items: KodlandReview[]; position: number } | null>(null);
  const [openClasses, setOpenClasses] = useState<Record<string, boolean>>({});
  const pageScroll = useRef(0);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const load = useCallback(async (background = false) => {
    if (!background) setLoading(true);
    setError("");
    try {
      const [reviewResult, lessonResult] = await Promise.all([kodlandApi.reviews(), kodlandApi.lessons()]);
      setReviews(reviewResult.items);
      setLessons(lessonResult.items);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as correções.");
      return false;
    } finally {
      if (!background) setLoading(false);
    }
  }, []);

  async function syncCorrections() {
    if (syncInProgress.current) return;
    syncInProgress.current = true;
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const credentials = await restoreKodlandCredentials();
      if (!credentials) {
        setError("Salve as credenciais em Dados e backup antes de atualizar as correções.");
        return;
      }
      const scroll = window.scrollY;
      const result = await kodlandApi.sync(
        credentials.username.trim(),
        credentials.password,
        "corrections",
      );
      const refreshed = await load(true);
      window.requestAnimationFrame(() => window.scrollTo({ top: scroll, behavior: "instant" }));
      if (refreshed) setNotice(`${result.review_count ?? 0} atividade(s) pendente(s) foram atualizadas.`);
    } catch (reason) {
      setError(
        reason instanceof ApiError || reason instanceof KodlandSyncResponseError || reason instanceof KodlandSyncPersistenceError
          ? reason.message
          : "Não foi possível atualizar as correções.",
      );
    } finally {
      setSyncing(false);
      syncInProgress.current = false;
    }
  }

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
  const navigationReviews = useMemo(() => orderedReviews(visibleReviews, grouping), [visibleReviews, grouping]);
  const openCorrection = (review: KodlandReview) => {
    pageScroll.current = window.scrollY;
    setNotice("");
    setError("");
    setCorrectionSession({ items: navigationReviews, position: navigationReviews.findIndex((item) => item.id === review.id) });
  };
  const selectedReview = correctionSession?.items[correctionSession.position];
  const closeCorrection = () => {
    setCorrectionSession(null);
    window.requestAnimationFrame(() => window.scrollTo({ top: pageScroll.current, behavior: "instant" }));
  };

  return (
    <div className="management-grid">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Pendências</p>
          <h1>Correções</h1>
        </div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <section className="panel corrections-panel">
        <div className="section-heading">
          <div>
            <h2>Atividades entregues</h2>
            <span className="correction-result-count">{visibleReviews.length} de {reviews.length} pendentes</span>
          </div>
          <div className="correction-heading-actions">
            <Input aria-label="Buscar correção" placeholder="Buscar aluno, turma ou atividade" value={query} onChange={(event) => setQuery(event.target.value)} />
            <Button type="button" data-tour="corrections-sync" onClick={() => void syncCorrections()} disabled={syncing}>
              {syncing ? "Atualizando correções…" : "Atualizar correções"}
            </Button>
          </div>
        </div>
        <div className="correction-filters" data-tour="corrections-filters" role="group" aria-label="Organizar correções">
          <span>Organizar por</span>
          {([
            ["class", "Turmas"],
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
        {loading ? <p className="muted">Carregando correções…</p> : visibleReviews.length === 0 ? <p className="muted">Sem pendências para os filtros atuais.</p> : <div className="correction-class-list" data-tour="corrections-cards">
          {reviewsByClass.map(([className, classReviews]) => {
            const internalGroups = grouping === "class"
              ? []
              : groupBy(
                  classReviews,
                  grouping === "student"
                    ? (review) => review.student_name || "Aluno não informado"
                    : lessonLabel,
                );
            return <details className="correction-class-group" key={className} open={openClasses[className] ?? false} onToggle={(event) => {
              const open = event.currentTarget.open;
              setOpenClasses((current) => current[className] === open ? current : { ...current, [className]: open });
            }}>
              <summary className="correction-class-heading">
                <div>
                  <h3>{className}</h3>
                  <span>{classReviews.length} pendência{classReviews.length === 1 ? "" : "s"}</span>
                </div>
                <span className="correction-disclosure" aria-hidden="true">⌄</span>
              </summary>
              <div className="correction-class-body">
                {grouping === "class" ? (
                  <div className="entity-list">
                    {classReviews.map((review) => <ReviewCard review={review} lessons={lessons} onCorrect={openCorrection} key={review.id} />)}
                  </div>
                ) : (
                  <div className="correction-subgroup-list">
                    {internalGroups.map(([label, groupedReviews]) => (
                      <section className={`correction-subgroup${grouping === "student" ? " correction-subgroup-student" : ""}`} key={label}>
                        <div className="correction-subgroup-heading"><h4>{label}</h4><span>{groupedReviews.length} pendência{groupedReviews.length === 1 ? "" : "s"}</span></div>
                        <div className="entity-list">
                          {groupedReviews.map((review) => <ReviewCard review={review} lessons={lessons} showStudent={grouping !== "student"} onCorrect={openCorrection} key={review.id} />)}
                        </div>
                      </section>
                    ))}
                  </div>
                )}
              </div>
            </details>;
          })}
        </div>}
      </section>
      {selectedReview && correctionSession && <CorrectionModal
        key={selectedReview.id}
        review={selectedReview}
        position={correctionSession.position}
        count={correctionSession.items.length}
        pending={reviews.some((review) => review.id === selectedReview.id)}
        syncing={syncing}
        error={error}
        notice={notice}
        onClose={closeCorrection}
        onPrevious={() => setCorrectionSession((current) => current && ({ ...current, position: Math.max(0, current.position - 1) }))}
        onNext={() => setCorrectionSession((current) => current && ({ ...current, position: Math.min(current.items.length - 1, current.position + 1) }))}
        onSync={() => void syncCorrections()}
      />}
    </div>
  );
}

export default function CorrectionsPage() {
  return <AuthGuard>{(user) => <Shell user={user}><Content /></Shell>}</AuthGuard>;
}
