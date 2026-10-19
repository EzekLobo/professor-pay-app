"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Link2, MessageCircle, RefreshCw } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ApiError, kodlandApi, manualPedagogyApi, manualTeachingApi, type KodlandAttendance, type KodlandLesson, type KodlandReview, type KodlandStudent } from "@/lib/api";
import type { ManualActivity } from "@/lib/manual-pedagogy";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import { pendingManualActivities } from "@/lib/manual-pedagogy";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { whatsappUrl } from "@/lib/whatsapp";

const absoluteUrl = (value: string) => value.startsWith("/") ? `https://bo.kodland.org${value}` : value;
const lessonForReview = (review: KodlandReview, lessons: KodlandLesson[]) => lessons.find((lesson) => {
  if (lesson.external_class_id !== review.external_class_id) return false;
  if (lesson.id === review.lesson_id) return true;
  return review.lesson_number > 0 && lesson.lesson_number === review.lesson_number;
});
type ReviewGrouping = "class" | "student" | "lesson";
type AttendanceFilter = "ABSENT" | "ALL" | "PRESENT";
const ATTENDANCE_RECORDINGS_KEY = "nexusclass.attendance-recordings";
const readRecordingDrafts = (): Record<string, string> => {
  if (typeof window === "undefined") return {};
  try {
    const value = JSON.parse(window.localStorage.getItem(ATTENDANCE_RECORDINGS_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string"))
      : {};
  } catch { return {}; }
};
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
  attendance?: KodlandAttendance[];
  students?: KodlandStudent[];
}

const attendanceStatusLabel = (status: KodlandAttendance["status"]) => ({
  ABSENT: "Faltou",
  PRESENT: "Presente",
  LATE: "Atrasado",
  EXCUSED: "Justificado",
  UNKNOWN: "Sem confirmação",
}[status]);
const attendanceDateLabel = (value: string) => {
  if (!value) return "Data não informada";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};

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

function AttendanceCard({
  item,
  student,
  recordingUrl,
  onRecordingUrlChange,
}: {
  item: KodlandAttendance;
  student?: KodlandStudent;
  recordingUrl: string;
  onRecordingUrlChange: (value: string) => void;
}) {
  const phone = student?.guardian_phone || student?.phone || "";
  const finalRecordingUrl = recordingUrl.trim() || item.recording_url || "";
  const message = `Olá, ${item.student_name}! Notamos que você faltou à aula ${item.lesson_title || "da turma"} em ${attendanceDateLabel(item.lesson_date)}.${finalRecordingUrl ? ` Você pode assistir à gravação aqui: ${finalRecordingUrl}` : " Se precisar do conteúdo da aula, me avise."}`;
  const href = phone ? whatsappUrl(phone, message) : "";
  return (
    <article className="entity-card attendance-card">
      <div className="correction-card-copy">
        <div className="correction-card-top">
          <h4>{item.student_name}</h4>
          <StatusBadge tone={item.status === "ABSENT" ? "warning" : item.status === "PRESENT" ? "success" : "neutral"}>{attendanceStatusLabel(item.status)}</StatusBadge>
        </div>
        <p className="correction-card-lesson">{item.lesson_title || "Aula"} · {attendanceDateLabel(item.lesson_date)}{item.start_time ? ` · ${item.start_time}` : ""}</p>
        <p className="correction-card-task"><span>Turma</span>{item.external_class_name || "Turma não informada"}</p>
      </div>
      <div className="attendance-card-actions">
        <label className="attendance-recording-field">
          <span><Link2 size={14} aria-hidden="true" /> Gravação da aula</span>
          <input className="input" type="url" placeholder="Cole o link (opcional)" value={recordingUrl || item.recording_url} onChange={(event) => onRecordingUrlChange(event.target.value)} />
        </label>
        {finalRecordingUrl && <a className="button button-ghost button-small" href={finalRecordingUrl} target="_blank" rel="noreferrer">Abrir gravação</a>}
        {href ? <a className="button button-primary button-small" href={href} target="_blank" rel="noreferrer"><MessageCircle size={15} aria-hidden="true" /> Avisar no WhatsApp</a> : <span className="muted attendance-no-phone">Sem telefone cadastrado</span>}
      </div>
    </article>
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
  const [storedAttendance, setAttendance] = useState<KodlandAttendance[]>([]);
  const [storedStudents, setStudents] = useState<KodlandStudent[]>([]);
  const reviews = demo?.reviews ?? storedReviews;
  const lessons = demo?.lessons ?? storedLessons;
  const attendance = demo?.attendance ?? storedAttendance;
  const attendanceStudents = demo?.students ?? storedStudents;
  const [query, setQuery] = useState("");
  const [grouping, setGrouping] = useState<ReviewGrouping>("class");
  const [viewMode, setViewMode] = useState<"attendance" | "activities">("attendance");
  const [attendanceFilter, setAttendanceFilter] = useState<AttendanceFilter>("ABSENT");
  const [recordingDrafts, setRecordingDrafts] = useState<Record<string, string>>(readRecordingDrafts);
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

  useEffect(() => {
    try { window.localStorage.setItem(ATTENDANCE_RECORDINGS_KEY, JSON.stringify(recordingDrafts)); } catch { /* Storage is optional. */ }
  }, [recordingDrafts]);

  const load = useCallback(async () => {
    if (demo) return;
    setLoading(true);
    setError("");
    try {
      const [reviewResult, lessonResult, groupResult, attendanceResult, studentResult, ownActivities, ownClasses, ownStudents] = await Promise.all([
        kodlandApi.reviews(), kodlandApi.lessons(), kodlandApi.groups(), kodlandApi.attendance(), kodlandApi.students(),
        manualPedagogyApi.activities(), manualTeachingApi.classes(), manualTeachingApi.students(),
      ]);
      setReviews(reviewResult.items);
      setLessons(lessonResult.items);
      setAttendance(attendanceResult.items);
      setHasKodlandGroups(groupResult.items.length > 0);
      setManualActivities(ownActivities);
      setManualClasses(ownClasses);
      setManualStudents(ownStudents);
      setStudents(studentResult.items);
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
  const visibleAttendance = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return attendance.filter((item) => {
      const matchesFilter = attendanceFilter === "ALL"
        ? true
        : attendanceFilter === "PRESENT"
          ? ["PRESENT", "LATE", "EXCUSED"].includes(item.status)
          : item.status === "ABSENT";
      const matchesQuery = !normalized || `${item.student_name} ${item.external_class_name} ${item.lesson_title}`.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [attendance, attendanceFilter, query]);
  const studentsByExternalId = useMemo(() => new Map(attendanceStudents.map((student) => [student.external_id, student])), [attendanceStudents]);
  const attendanceByClass = useMemo(() => groupBy(visibleAttendance, (item) => item.external_class_name || "Turma não informada"), [visibleAttendance]);

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
          <p className="eyebrow">Presença e atividades</p>
          <h1>Acompanhamento</h1>
        </div>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <section className="panel corrections-panel">
        <div className="section-heading">
          <div>
            <h2>{viewMode === "attendance" ? "Lista de presença" : "Atividades entregues"}</h2>
            <span className="correction-result-count">{viewMode === "attendance" ? `${visibleAttendance.length} registro${visibleAttendance.length === 1 ? "" : "s"}` : `${visibleReviews.length + visibleOwn.length} de ${reviews.length + pendingOwn.length} pendentes`}</span>
          </div>
          <div className="correction-heading-actions">
            <Input aria-label="Buscar correção" placeholder="Buscar aluno, turma ou atividade" value={query} onChange={(event) => setQuery(event.target.value)} />
            {(demo || hasKodlandGroups) && <Button className="button-ghost sync-icon-button" type="button" data-tour="corrections-sync" aria-label="Atualizar correções" title={syncing ? "Atualizando correções" : "Atualizar correções"} aria-busy={syncing} onClick={() => void syncCorrections()} disabled={syncing}>
              <RefreshCw size={18} aria-hidden="true" className={syncing ? "sync-icon-spinning" : undefined} />
            </Button>}
          </div>
        </div>
        <div className="correction-view-switch" role="tablist" aria-label="Tipo de acompanhamento">
          <button type="button" role="tab" aria-selected={viewMode === "attendance"} className={viewMode === "attendance" ? "active" : ""} onClick={() => setViewMode("attendance")}>Presença</button>
          <button type="button" role="tab" aria-selected={viewMode === "activities"} className={viewMode === "activities" ? "active" : ""} onClick={() => setViewMode("activities")}>Atividades</button>
        </div>
        {viewMode === "attendance" ? <>
        <div className="correction-filters attendance-filters" role="group" aria-label="Filtrar presença">
          <span>Mostrar</span>
          {([ ["ABSENT", "Alunos que faltaram"], ["ALL", "Todos"], ["PRESENT", "Presentes"] ] as const).map(([value, label]) => (
            <button className={attendanceFilter === value ? "correction-filter active" : "correction-filter"} type="button" key={value} aria-pressed={attendanceFilter === value} onClick={() => setAttendanceFilter(value)}>{label}</button>
          ))}
        </div>
        {loading ? <p className="muted">Carregando presença…</p> : visibleAttendance.length === 0 ? <p className="muted">Nenhum registro de presença para este filtro. Atualize a sincronização da Kodland.</p> : <div className="correction-class-list attendance-list">
          {attendanceByClass.map(([className, items]) => <details className="correction-class-group" key={className} open>
            <summary className="correction-class-heading"><div><h3>{className}</h3><span>{items.length} registro{items.length === 1 ? "" : "s"}</span></div><span className="correction-disclosure" aria-hidden="true">⌄</span></summary>
            <div className="correction-class-body"><div className="entity-list">{items.map((item) => <AttendanceCard key={item.id} item={item} student={studentsByExternalId.get(item.external_student_id)} recordingUrl={recordingDrafts[item.id] ?? ""} onRecordingUrlChange={(value) => setRecordingDrafts((current) => ({ ...current, [item.id]: value }))} />)}</div></div>
          </details>)}
        </div>}
        </> : <>
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
        </>}
      </section>
    </div>
  );
}

export default function CorrectionsPage() {
  return <AuthGuard>{(user) => <Shell user={user}><CorrectionsContent /></Shell>}</AuthGuard>;
}
