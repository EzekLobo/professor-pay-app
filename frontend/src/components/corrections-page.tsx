"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ApiError, kodlandApi, manualPedagogyApi, manualTeachingApi, type KodlandLesson, type KodlandReview } from "@/lib/api";
import type { ManualActivity } from "@/lib/manual-pedagogy";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import { pendingManualActivities } from "@/lib/manual-pedagogy";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";

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

export interface CorrectionsDemoAdapter {
  reviews: KodlandReview[];
  lessons: KodlandLesson[];
  onSync: () => void | Promise<void>;
  onCorrect: (review: KodlandReview) => void;
  onMaterial?: (lesson: KodlandLesson) => void;
  manualActivities?: ManualActivity[];
  manualClasses?: ManualClass[];
  manualStudents?: ManualStudent[];
  onSaveManualActivity?: (activity: ManualActivity) => Promise<ManualActivity>;
}

function LessonLinks({ lesson, demo }: { lesson: KodlandLesson | undefined; demo?: CorrectionsDemoAdapter }) {
  if (!lesson) return null;
  const links = [
    ["Slides", lesson.slides_url],
    ["Roteiro", lesson.guide_url],
  ].filter((item): item is [string, string] => Boolean(item[1]));
  const hasMaterial = links.length > 0;
  return (
    <>
      {links.map(([label, href]) => demo ? <button type="button" className="button button-ghost button-small" onClick={() => demo.onMaterial?.(lesson)} key={label}>{label}</button> : <a className="button button-ghost button-small" href={absoluteUrl(href)} target="_blank" rel="noreferrer" key={label}>{label}</a>)}
      {!hasMaterial && (demo ? <button type="button" className="button button-ghost button-small" onClick={() => demo.onMaterial?.(lesson)}>Abrir aula</button> : <a className="button button-ghost button-small" href={absoluteUrl(lesson.external_url)} target="_blank" rel="noreferrer">Abrir aula</a>)}
    </>
  );
}

function ReviewCard({
  review,
  lessons,
  showStudent = true,
  demo,
}: {
  review: KodlandReview;
  lessons: KodlandLesson[];
  showStudent?: boolean;
  demo?: CorrectionsDemoAdapter;
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
        <LessonLinks lesson={lesson} demo={demo} />
        {demo ? <button type="button" className="button button-primary correction-action" onClick={() => demo.onCorrect(review)}>Corrigir</button> : <a
          className="button button-primary correction-action"
          target="_blank"
          rel="noreferrer"
          href={review.correction_url}
        >
          Corrigir
        </a>}
      </div>
    </article>
  );
}

export function CorrectionsContent({ demo }: { demo?: CorrectionsDemoAdapter }) {
  const [storedReviews, setReviews] = useState<KodlandReview[]>([]);
  const [storedLessons, setLessons] = useState<KodlandLesson[]>([]);
  const reviews = demo?.reviews ?? storedReviews;
  const lessons = demo?.lessons ?? storedLessons;
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<ReviewGrouping>("class");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(!demo);
  const [syncing, setSyncing] = useState(false);
  const [storedManualActivities, setManualActivities] = useState<ManualActivity[]>([]);
  const [storedManualClasses, setManualClasses] = useState<ManualClass[]>([]);
  const [storedManualStudents, setManualStudents] = useState<ManualStudent[]>([]);
  const manualActivities = demo?.manualActivities ?? storedManualActivities;
  const manualClasses = demo?.manualClasses ?? storedManualClasses;
  const manualStudents = demo?.manualStudents ?? storedManualStudents;
  const [hasKodlandGroups, setHasKodlandGroups] = useState(false);
  const [editingManual, setEditingManual] = useState<ManualActivity | null>(null);
  const [feedback, setFeedback] = useState("");
  const [savingManual, setSavingManual] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    setError("");
    try {
      const [reviewResult, lessonResult, groupResult, ownActivities, ownClasses, ownStudents] = await Promise.all([
        kodlandApi.reviews(), kodlandApi.lessons(), kodlandApi.groups(),
        manualPedagogyApi.activities(), manualTeachingApi.classes(), manualTeachingApi.students(),
      ]);
      setReviews(reviewResult.items);
      setLessons(lessonResult.items);
      setHasKodlandGroups(groupResult.items.length > 0);
      setManualActivities(ownActivities);
      setManualClasses(ownClasses);
      setManualStudents(ownStudents);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar as correções.");
    } finally {
      setLoading(false);
    }
  }, [demo]);

  async function syncCorrections() {
    if (syncing) return;
    if (demo) {
      setSyncing(true);
      try {
        await demo.onSync();
        setNotice("Correções demonstrativas atualizadas. Nenhuma plataforma externa foi consultada.");
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a demonstração.");
      } finally {
        setSyncing(false);
      }
      return;
    }
    const credentials = await restoreKodlandCredentials();
    if (!credentials) {
      setError("Salve as credenciais em Dados e backup antes de atualizar as correções.");
      return;
    }
    setSyncing(true);
    setError("");
    setNotice("");
    try {
      const result = await kodlandApi.sync(
        credentials.username.trim(),
        credentials.password,
        "corrections",
      );
      await load();
      setNotice(
        `${result.review_count ?? 0} atividade(s) pendente(s) foram atualizadas.`,
      );
    } catch (reason) {
      setError(
        reason instanceof ApiError || reason instanceof KodlandSyncResponseError || reason instanceof KodlandSyncPersistenceError
          ? reason.message
          : "Não foi possível atualizar as correções.",
      );
    } finally {
      setSyncing(false);
    }
  }

  useEffect(() => {
    if (demo) return;
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load, demo]);

  const visibleReviews = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return reviews;
    return reviews.filter((review) => `${review.student_name} ${review.external_class_name} ${review.lesson_title} ${review.task_title}`.toLowerCase().includes(normalized));
  }, [query, reviews]);
  const pendingOwn = useMemo(() => pendingManualActivities(manualActivities), [manualActivities]);
  const visibleOwn = useMemo(() => pendingOwn.filter((item) => {
    const student = manualStudents.find((row) => row.id === item.student_id)?.name ?? "";
    const className = manualClasses.find((row) => row.id === item.class_id)?.name ?? "";
    return `${student} ${className} ${item.title} ${item.description}`.toLowerCase().includes(query.trim().toLowerCase());
  }), [pendingOwn, manualClasses, manualStudents, query]);
  const ownByClass = useMemo(() => groupBy(visibleOwn, (item) => manualClasses.find((row) => row.id === item.class_id)?.name || "Turma própria"), [visibleOwn, manualClasses]);
  const reviewsByClass = useMemo(
    () => groupBy(visibleReviews, (review) => review.external_class_name || "Turma não informada"),
    [visibleReviews],
  );

  return (
    <div className="management-grid">
      <Modal open={Boolean(editingManual)} title="Corrigir atividade própria" onClose={() => { if (!savingManual) setEditingManual(null); }}>
        {editingManual && <form className="form management-form" onSubmit={async (event) => {
          event.preventDefault(); setSavingManual(true); setError("");
          try {
            const updated = demo?.onSaveManualActivity
              ? await demo.onSaveManualActivity({ ...editingManual, feedback, status: "completed" })
              : await manualPedagogyApi.saveActivity({ ...editingManual, feedback, status: "completed" });
            if (!demo) setManualActivities((current) => current.map((item) => item.id === updated.id ? updated : item));
            setEditingManual(null); setNotice("Atividade corrigida.");
          } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a correção."); }
          finally { setSavingManual(false); }
        }}>
          {error && <p className="form-error" role="alert">{error}</p>}
          <p><strong>{editingManual.title}</strong></p>
          {editingManual.submission_text && <p>Entrega: {editingManual.submission_text}</p>}
          {editingManual.submission_url && <a href={editingManual.submission_url} target="_blank" rel="noreferrer">Abrir entrega</a>}
          <label className="field">Feedback<textarea className="input" value={feedback} onChange={(event) => setFeedback(event.target.value)} /></label>
          <div className="form-actions"><Button type="submit" disabled={savingManual}>{savingManual ? "Salvando…" : "Concluir correção"}</Button></div>
        </form>}
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
            <span className="correction-result-count">{visibleReviews.length + visibleOwn.length} de {reviews.length + pendingOwn.length} pendentes</span>
          </div>
          <div className="correction-heading-actions">
            <Input aria-label="Buscar correção" placeholder="Buscar aluno, turma ou atividade" value={query} onChange={(event) => setQuery(event.target.value)} />
            {(demo || hasKodlandGroups) && <Button className="button-ghost sync-icon-button" type="button" data-tour="corrections-sync" aria-label="Atualizar correções" title={syncing ? "Atualizando correções" : "Atualizar correções"} aria-busy={syncing} onClick={() => void syncCorrections()} disabled={syncing}>
              <RefreshCw size={18} aria-hidden="true" className={syncing ? "sync-icon-spinning" : undefined} />
            </Button>}
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
        {loading ? <p className="muted">Carregando correções…</p> : visibleReviews.length + visibleOwn.length === 0 ? <p className="muted">Sem pendências para os filtros atuais.</p> : <div className="correction-class-list" data-tour="corrections-cards">
          {ownByClass.map(([className, classActivities]) => {
            const ownGroups = grouping === "class" ? [] : groupBy(classActivities, (item) => grouping === "student"
              ? manualStudents.find((student) => student.id === item.student_id)?.name || "Aluno"
              : item.occurrence_id);
            const card = (item: ManualActivity, showStudent: boolean) => <article className="entity-card correction-card" key={item.id}>
              <div className="correction-card-copy"><div className="correction-card-top">
                {showStudent && <h4>{manualStudents.find((student) => student.id === item.student_id)?.name || "Aluno"}</h4>}
                <StatusBadge tone="warning">Entregue</StatusBadge>
              </div><p className="correction-card-lesson">Aula {item.occurrence_id.split(":").at(-1)}</p>
                <p className="correction-card-task"><span>Atividade</span>{item.title}</p></div>
              <div className="card-actions"><Button type="button" className="correction-action" onClick={() => { setEditingManual(item); setFeedback(item.feedback); }}>Corrigir</Button></div>
            </article>;
            return <details className="correction-class-group" key={`manual:${className}`}>
              <summary className="correction-class-heading"><div><h3>{className}</h3><span>{classActivities.length} pendência{classActivities.length === 1 ? "" : "s"}</span></div><span className="correction-disclosure" aria-hidden="true">⌄</span></summary>
              <div className="correction-class-body">{grouping === "class"
                ? <div className="entity-list">{classActivities.map((item) => card(item, true))}</div>
                : <div className="correction-subgroup-list">{ownGroups.map(([label, items]) => <section className={`correction-subgroup${grouping === "student" ? " correction-subgroup-student" : ""}`} key={label}>
                  <div className="correction-subgroup-heading"><h4>{label}</h4><span>{items.length} pendência{items.length === 1 ? "" : "s"}</span></div>
                  <div className="entity-list">{items.map((item) => card(item, grouping !== "student"))}</div>
                </section>)}</div>}</div>
            </details>;
          })}
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
                    {classReviews.map((review) => <ReviewCard review={review} lessons={lessons} demo={demo} key={review.id} />)}
                  </div>
                ) : (
                  <div className="correction-subgroup-list">
                    {internalGroups.map(([label, groupedReviews]) => (
                      <section className={`correction-subgroup${grouping === "student" ? " correction-subgroup-student" : ""}`} key={label}>
                        <div className="correction-subgroup-heading"><h4>{label}</h4><span>{groupedReviews.length} pendência{groupedReviews.length === 1 ? "" : "s"}</span></div>
                        <div className="entity-list">
                          {groupedReviews.map((review) => <ReviewCard review={review} lessons={lessons} showStudent={grouping !== "student"} demo={demo} key={review.id} />)}
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
  return <AuthGuard>{(user) => <Shell user={user}><CorrectionsContent /></Shell>}</AuthGuard>;
}
