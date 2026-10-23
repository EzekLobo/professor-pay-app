"use client";

import { MessageCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent } from "react";
import { Modal } from "@/components/modal";
import type { ManualAdapters } from "@/lib/manual-adapters";
import { manualAdapter as productionAdapter } from "@/lib/manual-adapters-runtime";
import { renderAbsenceMessage, type ManualAttendance, type ManualAttendanceStatus, type ManualOccurrence, type TutorPreferences } from "@/lib/manual-operations";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import { whatsappUrl } from "@/lib/whatsapp";

const statuses: ManualAttendanceStatus[] = ["UNMARKED", "PRESENT", "EXCUSED", "ABSENT"];
const labels: Record<ManualAttendanceStatus, string> = { UNMARKED: "Não informada", PRESENT: "Presente", EXCUSED: "Falta justificada", ABSENT: "Falta sem justificativa" };
const cssStatus: Record<ManualAttendanceStatus, string> = { UNMARKED: "empty", PRESENT: "present", EXCUSED: "excused", ABSENT: "absent" };
const dateLabel = (date: string) => date.split("-").reverse().slice(0, 2).join("/");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
type Draft = { name: string; phone: string; message: string };

function ClassGrid({ classroom, students, occurrences, records, preferences, adapter, onSaved, onMessage }: { classroom: ManualClass; students: ManualStudent[]; occurrences: ManualOccurrence[]; records: ManualAttendance[]; preferences: TutorPreferences; adapter: ManualAdapters; onSaved: (record: ManualAttendance) => void; onMessage: (draft: Draft) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const activeStudents = students.filter((student) => student.active && classroom.student_ids.includes(student.id));
  const ordered = useMemo(() => [...occurrences].sort((a, b) => `${a.lesson_date} ${a.start_time}`.localeCompare(`${b.lesson_date} ${b.start_time}`)), [occurrences]);
  const style = { "--attendance-columns": ordered.length } as CSSProperties;
  useEffect(() => {
    const element = ref.current; if (!element || !ordered.length) return;
    const past = ordered.map((item, index) => item.lesson_date <= today() ? index : -1).filter((index) => index >= 0).at(-1) ?? 0;
    requestAnimationFrame(() => { const target = element.querySelector<HTMLElement>(`[data-manual-column="${past}"]`); if (target) element.scrollLeft = Math.max(0, target.offsetLeft - 260); });
  }, [ordered]);
  const wheel = (event: WheelEvent<HTMLDivElement>) => { if (Math.abs(event.deltaY) > Math.abs(event.deltaX) && ref.current?.scrollWidth && ref.current.scrollWidth > ref.current.clientWidth) { ref.current.scrollLeft += event.deltaY; event.preventDefault(); } };
  const byKey = new Map(records.map((item) => [`${item.occurrence_id}:${item.student_id}`, item]));
  const change = async (occurrence: ManualOccurrence, student: ManualStudent, status: ManualAttendanceStatus) => {
    const previous = byKey.get(`${occurrence.id}:${student.id}`);
    const saved = await adapter.operations.saveAttendance({ id: previous?.id, occurrence_id: occurrence.id, class_id: classroom.id, student_id: student.id, status, note: previous?.note ?? "" }); onSaved(saved);
  };
  return <div className="attendance-grid-scroll" ref={ref} tabIndex={0} onWheel={wheel} aria-label={`Presença da turma ${classroom.name}`}>
    <div className="attendance-grid-header" style={style} role="row"><div className="attendance-grid-corner" role="columnheader">Aluno</div>{ordered.map((item, index) => <div className="attendance-column-heading" role="columnheader" data-manual-column={index} key={item.id}><strong>{dateLabel(item.lesson_date)}</strong><small>{item.start_time}</small></div>)}</div>
    {activeStudents.map((student) => <div className="attendance-grid-row" style={style} role="row" key={student.id}><div className="attendance-student-summary" role="rowheader"><div className="attendance-student-copy"><h4>{student.name}</h4>{student.email && <span>{student.email}</span>}</div></div>{ordered.map((occurrence) => {
      const record = byKey.get(`${occurrence.id}:${student.id}`); const status = record?.status ?? "UNMARKED"; const code = occurrence.course_code || "Sem código";
      return <div className={`attendance-grid-status attendance-status-${cssStatus[status]} manual-attendance-cell`} role="cell" title={`${code} · ${dateLabel(occurrence.lesson_date)} · ${labels[status]}`} key={occurrence.id}>
        <button type="button" className="manual-attendance-code" aria-label={`${student.name}, ${code}: ${labels[status]}. Alterar presença`} onClick={() => void change(occurrence, student, statuses[(statuses.indexOf(status) + 1) % statuses.length])}>{code}</button>
        {status === "ABSENT" && <button type="button" className="manual-attendance-whatsapp" aria-label={`Enviar mensagem para ${student.name}`} onClick={() => onMessage({ name: student.name, phone: student.phone || student.guardian_phone || "", message: renderAbsenceMessage({ template: preferences.absence_message_template, studentName: student.name, lessonCode: code, date: new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC" }).format(new Date(`${occurrence.lesson_date}T12:00:00Z`)), recordingUrl: occurrence.recording_url }) })}><MessageCircle size={15} aria-hidden="true" /></button>}
      </div>;
    })}</div>)}
  </div>;
}

export function ManualAttendanceGrid({ adapter = productionAdapter }: { adapter?: ManualAdapters }) {
  const [classes, setClasses] = useState<ManualClass[]>([]); const [students, setStudents] = useState<ManualStudent[]>([]); const [occurrences, setOccurrences] = useState<ManualOccurrence[]>([]); const [records, setRecords] = useState<ManualAttendance[]>([]); const [preferences, setPreferences] = useState<TutorPreferences | null>(null); const [draft, setDraft] = useState<Draft | null>(null); const [error, setError] = useState("");
  useEffect(() => { void Promise.all([adapter.teaching.classes(), adapter.teaching.students(), adapter.preferences.get()]).then(async ([classRows, studentRows, prefs]) => {
    const active = classRows.filter((item) => item.active); const ensured = (await Promise.all(active.map((item) => adapter.operations.ensureOccurrences(item.id)))).flat(); const attendance = await adapter.operations.attendance(); setClasses(active); setStudents(studentRows); setPreferences(prefs); setOccurrences(ensured); setRecords(attendance);
  }).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar a presença manual.")); }, [adapter]);
  const classRows = useMemo(() => classes.filter((item) => item.student_ids.some((id) => students.some((student) => student.id === id && student.active))), [classes, students]);
  if (!preferences) return error ? <p className="form-error" role="alert">{error}</p> : <p className="muted">Carregando turmas próprias…</p>;
  return <><div className="correction-class-list attendance-list manual-attendance-list">{classRows.map((classroom) => <details className="correction-class-group attendance-class-group" key={classroom.id}><summary className="correction-class-heading"><div><h3>{classroom.name}</h3><span>{classroom.student_ids.filter((id) => students.some((item) => item.id === id && item.active)).length} alunos</span></div><span className="correction-disclosure" aria-hidden="true">⌄</span></summary><div className="correction-class-body attendance-class-body"><ClassGrid classroom={classroom} students={students} occurrences={occurrences.filter((item) => item.class_id === classroom.id)} records={records.filter((item) => item.class_id === classroom.id)} preferences={preferences} adapter={adapter} onSaved={(saved) => setRecords((current) => [...current.filter((item) => item.id !== saved.id), saved])} onMessage={setDraft} /></div></details>)}</div>
    <Modal open={Boolean(draft)} title="Mensagem pelo WhatsApp" onClose={() => setDraft(null)}>{draft && <div className="form management-form attendance-whatsapp-form"><p className="muted">Revise a mensagem para {draft.name} antes de enviar.</p><label className="field">Mensagem<textarea className="input" rows={10} value={draft.message} onChange={(event) => setDraft({ ...draft, message: event.target.value })} /></label><div className="form-actions"><button className="button button-ghost" type="button" onClick={() => setDraft(null)}>Cancelar</button><a className="button button-primary" href={whatsappUrl(draft.phone, draft.message)} target="_blank" rel="noreferrer" onClick={() => setDraft(null)}><MessageCircle size={17} aria-hidden="true" /> Enviar no WhatsApp</a></div></div>}</Modal></>;
}
