"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { MessageCircle, RefreshCw } from "lucide-react";
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
import { isActiveKodlandStudent } from "@/lib/student-ranking";
import { whatsappUrl } from "@/lib/whatsapp";

const absoluteUrl = (value: string) => value.startsWith("/") ? `https://bo.kodland.org${value}` : value;
const lessonForReview = (review: KodlandReview, lessons: KodlandLesson[]) => lessons.find((lesson) => {
  if (lesson.external_class_id !== review.external_class_id) return false;
  if (lesson.id === review.lesson_id) return true;
  return review.lesson_number > 0 && lesson.lesson_number === review.lesson_number;
});
type ReviewGrouping = "class" | "student" | "lesson";
type AttendanceFilter = "ABSENT" | "ALL" | "PRESENT";
type AttendanceStudentHistory = {
  id: string;
  name: string;
  student?: KodlandStudent;
  records: KodlandAttendance[];
};
type AttendanceColumn = {
  key: string;
  module: string;
  lesson: string;
  date: string;
  moduleStart: boolean;
};
type WhatsAppDraft = { studentName: string; phone: string; message: string };
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
  ABSENT: "Falta sem justificativa",
  PRESENT: "Presente",
  LATE: "Atrasado",
  EXCUSED: "Falta justificada",
  UNKNOWN: "Sem confirmação",
}[status]);
const attendanceDateLabel = (value: string) => {
  if (!value) return "Data não informada";
  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
};
const attendanceSortKey = (item: KodlandAttendance) => `${item.lesson_date || "0000-00-00"} ${item.start_time || "00:00"} ${item.lesson_title}`;
const attendanceColumnKey = (item: KodlandAttendance) => item.lesson_id || `${item.lesson_date}:${item.lesson_title}`;
const moduleLessonCode = (value: string) => value.match(/M(\d+)(?:\s*[.·-]\s*)?L(\d+)/i);
const lessonForAttendance = (item: KodlandAttendance, lessons: KodlandLesson[]) => {
  const code = moduleLessonCode(item.lesson_title);
  const sameClass = lessons.filter((lesson) => lesson.external_class_id === item.external_class_id);
  return sameClass.find((lesson) =>
    lesson.id === item.lesson_id
    || lesson.source_lesson_id === item.lesson_id
  ) ?? (code ? sameClass.find((lesson) =>
    lesson.module_number?.match(/\d+/)?.[0] === code[1]
    && (lesson.course_index === Number(code[2]) || lesson.lesson_number === Number(code[2]))
  ) : undefined) ?? sameClass.find((lesson) =>
    Boolean(item.lesson_date && lesson.lesson_date === item.lesson_date && (!item.start_time || lesson.start_time === item.start_time))
  );
};
const attendanceLessonParts = (item: KodlandAttendance, lessons: KodlandLesson[]) => {
  const lessonRecord = lessonForAttendance(item, lessons);
  const localizedCode = moduleLessonCode(lessonRecord?.title ?? "");
  if (localizedCode && lessonRecord) return { module: `M${localizedCode[1]}`, lesson: `L${localizedCode[2]}` };
  const moduleNumber = lessonRecord?.module_number?.match(/\d+/)?.[0];
  if (moduleNumber && lessonRecord?.lesson_number) return { module: `M${moduleNumber}`, lesson: `L${lessonRecord.lesson_number}` };
  return { module: "", lesson: "Aula" };
};
const attendanceLessonDate = (item: KodlandAttendance, lessons: KodlandLesson[]) =>
  item.lesson_date || lessonForAttendance(item, lessons)?.lesson_date || "";
const attendanceMessage = (history: AttendanceStudentHistory, item: KodlandAttendance, lessons: KodlandLesson[]) => {
  const parts = attendanceLessonParts(item, lessons);
  const lessonLabel = parts.module ? `${parts.module}${parts.lesson}` : item.lesson_title || parts.lesson;
  const recordingUrl = item.recording_url?.trim() || "https://learn.kodland.org/";
  return `Olá, ${history.name}! Sentimos sua falta na aula ${lessonLabel}, em ${attendanceDateLabel(attendanceLessonDate(item, lessons))}. Aconteceu alguma coisa? Para ficar por dentro do assunto, você pode acessar a aula gravada aqui: ${recordingUrl}. Se precisar de ajuda, me avise.`;
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

function AttendanceClassGrid({
  histories,
  lessons,
  classOpen,
  onWhatsApp,
}: {
  histories: AttendanceStudentHistory[];
  lessons: KodlandLesson[];
  classOpen: boolean;
  onWhatsApp: (draft: WhatsAppDraft) => void;
}) {
  const gridRef = useRef<HTMLDivElement>(null);
  const columns = useMemo(() => {
    const samples = new Map<string, KodlandAttendance>();
    for (const history of histories) {
      for (const item of history.records) samples.set(attendanceColumnKey(item), item);
    }
    const orderedColumns = [...samples.values()]
      .map((item) => {
        const parts = attendanceLessonParts(item, lessons);
        return { key: attendanceColumnKey(item), module: parts.module, lesson: parts.lesson, date: attendanceLessonDate(item, lessons), startTime: item.start_time };
      })
      .sort((first, second) => `${first.date} ${first.startTime} ${first.module}${first.lesson}`.localeCompare(`${second.date} ${second.startTime} ${second.module}${second.lesson}`, "pt-BR"));
    return orderedColumns.map((column, index): AttendanceColumn => ({
      ...column,
      moduleStart: Boolean(column.module && column.module !== orderedColumns[index - 1]?.module),
    }));
  }, [histories, lessons]);
  const gridStyle = { "--attendance-columns": columns.length } as CSSProperties;

  useEffect(() => {
    if (!classOpen) return;
    const frame = window.requestAnimationFrame(() => {
      const element = gridRef.current;
      if (element) element.scrollLeft = element.scrollWidth;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [classOpen, columns.length]);

  return (
    <div className="attendance-grid-scroll" ref={gridRef} tabIndex={0} aria-label="Grade de histórico de presença">
      <div className="attendance-grid-header" style={gridStyle} role="row">
        <div className="attendance-grid-corner" role="columnheader">Aluno</div>
        {columns.map((column) => <div className={`attendance-column-heading${column.moduleStart ? " attendance-module-start" : ""}`} role="columnheader" key={column.key}>
          <strong>{column.date ? attendanceDateLabel(column.date).slice(0, 5) : "Sem data"}</strong>
        </div>)}
      </div>
      {histories.map((history) => {
        const phone = history.student?.guardian_phone || history.student?.phone || "";
        const recordsByColumn = new Map(history.records.map((item) => [attendanceColumnKey(item), item]));
        return <div className="attendance-grid-row" style={gridStyle} role="row" key={history.id}>
          <div className="attendance-student-summary" role="rowheader">
            <div className="attendance-student-copy"><h4>{history.name}</h4>{history.student?.email && <span>{history.student.email}</span>}</div>
          </div>
          {columns.map((column) => {
            const item = recordsByColumn.get(column.key);
            const className = `attendance-grid-status${item ? ` attendance-status-${item.status.toLowerCase()}` : " attendance-status-empty"}${column.moduleStart ? " attendance-module-start" : ""}`;
            const lessonCode = column.module ? `${column.module}${column.lesson}` : column.lesson;
            const title = item ? `${lessonCode} · ${attendanceDateLabel(column.date)} · ${attendanceStatusLabel(item.status)}` : `${lessonCode} · Sem registro`;
            if (item?.status === "ABSENT") return <button
              className={`${className} attendance-absence-action`}
              type="button"
              aria-label={`Preparar mensagem sobre ${lessonCode} de ${history.name} no WhatsApp`}
              key={column.key}
              title={phone ? `${title} · Preparar mensagem` : `${title} · Telefone não cadastrado`}
              disabled={!phone}
              onClick={() => onWhatsApp({ studentName: history.name, phone, message: attendanceMessage(history, item, lessons) })}
            >{lessonCode}</button>;
            return <div className={className} role="cell" aria-label={item ? `${lessonCode}: ${attendanceStatusLabel(item.status)}` : `${lessonCode}: sem registro`} key={column.key} title={title}>{lessonCode}</div>;
          })}
        </div>;
      })}
    </div>
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
  const [openAttendanceClasses, setOpenAttendanceClasses] = useState<Set<string>>(() => new Set());
  const [whatsAppDraft, setWhatsAppDraft] = useState<WhatsAppDraft | null>(null);
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
  const attendanceHistories = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const studentsByExternalId = new Map(attendanceStudents.map((student) => [student.external_id, student]));
    const histories = new Map<string, AttendanceStudentHistory>();
    for (const item of attendance) {
      const id = `${item.external_class_id}:${item.external_student_id || item.student_name}`;
      const current = histories.get(id) ?? { id, name: item.student_name || "Aluno", student: studentsByExternalId.get(item.external_student_id), records: [] };
      current.records.push(item);
      histories.set(id, current);
    }
    return [...histories.values()].map((history) => ({
      ...history,
      records: [...history.records].sort((first, second) => attendanceSortKey(first).localeCompare(attendanceSortKey(second), "pt-BR")),
    })).filter((history) => {
      const matchesFilter = attendanceFilter === "ALL"
        || (attendanceFilter === "ABSENT" && history.records.some((item) => item.status === "ABSENT"))
        || (attendanceFilter === "PRESENT" && history.records.some((item) => item.status === "PRESENT"));
      const matchesQuery = !normalized || `${history.name} ${history.student?.email ?? ""} ${history.records.map((item) => `${item.external_class_name} ${item.lesson_title}`).join(" ")}`.toLowerCase().includes(normalized);
      return isActiveKodlandStudent(history.student?.status) && matchesFilter && matchesQuery;
    });
  }, [attendance, attendanceFilter, attendanceStudents, query]);
  const attendanceByClass = useMemo(() => groupBy(attendanceHistories, (history) => history.records[0]?.external_class_name || "Turma não informada"), [attendanceHistories]);

  return (
    <div className="management-grid">
      <Modal open={Boolean(whatsAppDraft)} title="Mensagem pelo WhatsApp" onClose={() => setWhatsAppDraft(null)} className="attendance-whatsapp-modal">
        {whatsAppDraft && <div className="form management-form attendance-whatsapp-form">
          <p className="muted">Revise a mensagem para {whatsAppDraft.studentName} antes de enviar.</p>
          <label className="field">Mensagem
            <textarea className="input" rows={7} value={whatsAppDraft.message} onChange={(event) => setWhatsAppDraft((current) => current ? { ...current, message: event.target.value } : current)} />
          </label>
          <div className="form-actions">
            <Button type="button" className="button-ghost" onClick={() => setWhatsAppDraft(null)}>Cancelar</Button>
            <a className="button button-primary" href={whatsappUrl(whatsAppDraft.phone, whatsAppDraft.message)} target="_blank" rel="noreferrer" onClick={() => setWhatsAppDraft(null)}>
              <MessageCircle size={17} aria-hidden="true" /> Enviar no WhatsApp
            </a>
          </div>
        </div>}
      </Modal>
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
            <span className="correction-result-count">{viewMode === "attendance" ? `${attendanceHistories.length} aluno${attendanceHistories.length === 1 ? "" : "s"}` : `${visibleReviews.length + visibleOwn.length} de ${reviews.length + pendingOwn.length} pendentes`}</span>
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
        <div className="attendance-legend" aria-label="Legenda das cores de presença">
          {([
            ["present", "Presente"],
            ["absent", "Falta sem justificativa"],
            ["excused", "Falta justificada"],
            ["late", "Atraso"],
            ["unknown", "Sem confirmação"],
          ] as const).map(([status, label]) => <span key={status}><i className={`attendance-legend-swatch attendance-status-${status}`} aria-hidden="true" />{label}</span>)}
        </div>
        {loading ? <p className="muted">Carregando presença…</p> : attendanceHistories.length === 0 ? <p className="muted">Nenhum registro de presença para este filtro. Atualize a sincronização da Kodland.</p> : <div className="correction-class-list attendance-list">
          {attendanceByClass.map(([className, histories]) => <details
            className="correction-class-group attendance-class-group"
            key={className}
            open={openAttendanceClasses.has(className)}
            onToggle={(event) => {
              const isOpen = event.currentTarget.open;
              setOpenAttendanceClasses((current) => {
                const next = new Set(current);
                if (isOpen) next.add(className); else next.delete(className);
                return next;
              });
            }}
          >
            <summary className="correction-class-heading"><div><h3>{className}</h3><span>{histories.length} aluno{histories.length === 1 ? "" : "s"}</span></div><span className="correction-disclosure" aria-hidden="true">⌄</span></summary>
            <div className="correction-class-body attendance-class-body"><AttendanceClassGrid histories={histories} lessons={lessons} classOpen={openAttendanceClasses.has(className)} onWhatsApp={setWhatsAppDraft} /></div>
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
