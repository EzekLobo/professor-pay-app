"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import { ApiError, kodlandApi, type KodlandLesson, type KodlandReview } from "@/lib/api";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import {
  rememberKodlandCredentials,
  restoreKodlandCredentials,
} from "@/lib/browser-credentials";

const absoluteUrl = (value: string) => value.startsWith("/") ? `https://bo.kodland.org${value}` : value;

const lessonForReview = (review: KodlandReview, lessons: KodlandLesson[]) => lessons.find((lesson) => {
  if (lesson.external_class_id !== review.external_class_id) return false;
  if (lesson.id === review.lesson_id) return true;
  return review.lesson_number > 0 && lesson.lesson_number === review.lesson_number;
});
type ReviewGrouping = "class" | "student" | "lesson";
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
      {links.map(([label, href]) => <a className="button button-ghost button-small" href={absoluteUrl(href)} target="_blank" rel="noreferrer" key={label}>{label}</a>)}
      {!hasMaterial && <a className="button button-ghost button-small" href={absoluteUrl(lesson.external_url)} target="_blank" rel="noreferrer">Abrir aula</a>}
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
      <div className="correction-card-copy">
        <div className="entity-title">
          <h4>{review.student_name}</h4>
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
        <a
          className="button button-primary correction-action"
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
  const [grouping, setGrouping] = useState<ReviewGrouping>("class");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncUsername, setSyncUsername] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("aulapay.kodland.username") ?? "",
  );
  const [syncPassword, setSyncPassword] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openSync() {
    setSyncError("");
    setNotice("");
    setSyncOpen(true);
    void restoreKodlandCredentials().then((credentials) => {
      if (!credentials) return;
      setSyncUsername((current) => current || credentials.username);
      setSyncPassword((current) => current || credentials.password);
    });
  }

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

  async function syncCorrections(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const username = syncUsername.trim();
    if (!username || !syncPassword || syncing) return;
    setSyncing(true);
    setSyncError("");
    setNotice("");
    const password = syncPassword;
    try {
      const result = await kodlandApi.sync(username, password, "corrections");
      try {
        window.localStorage.setItem("aulapay.kodland.username", username);
        await rememberKodlandCredentials(form);
      } catch {
        // Browser credential storage is optional after a successful sync.
      }
      setSyncPassword("");
      await load();
      setSyncOpen(false);
      setNotice(
        `${result.review_count ?? 0} atividade(s) pendente(s) foram atualizadas.`,
      );
    } catch (reason) {
      setSyncError(
        reason instanceof ApiError || reason instanceof KodlandSyncResponseError || reason instanceof KodlandSyncPersistenceError
          ? reason.message
          : "Não foi possível atualizar as correções.",
      );
    } finally {
      setSyncing(false);
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

  return (
    <div className="management-grid">
      <Modal
        open={syncOpen}
        title="Atualizar correções"
        className="schedule-sync-modal"
        onClose={() => !syncing && setSyncOpen(false)}
      >
        <form className="form management-form" autoComplete="on" onSubmit={syncCorrections}>
          <p className="muted">
            O navegador pode salvar suas credenciais com segurança após a
            primeira atualização. O NexusClass não armazena sua senha.
          </p>
          <label className="field">
            Usuário ou e-mail
            <Input
              name="username"
              type="text"
              autoComplete="username"
              required
              disabled={syncing}
              value={syncUsername}
              onChange={(event) => setSyncUsername(event.target.value)}
            />
          </label>
          <label className="field">
            Senha
            <Input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              disabled={syncing}
              value={syncPassword}
              onChange={(event) => setSyncPassword(event.target.value)}
            />
          </label>
          {syncError && <p className="form-error" role="alert">{syncError}</p>}
          <div className="form-actions">
            <Button type="submit" disabled={syncing}>
              {syncing ? "Atualizando correções…" : "Atualizar correções"}
            </Button>
          </div>
        </form>
      </Modal>
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
            <Button type="button" data-tour="corrections-sync" onClick={openSync}>
              Atualizar correções
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
            return <details className="correction-class-group" key={className}>
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
              </div>
            </details>;
          })}
        </div>}
      </section>
    </div>
  );
}

export default function CorrectionsPage() {
  return <AuthGuard>{(user) => <Shell user={user}><Content /></Shell>}</AuthGuard>;
}
