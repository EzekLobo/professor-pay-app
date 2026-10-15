"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Button, Input, StatusBadge } from "@/components/ui";
import { manualPedagogyApi, manualTeachingApi } from "@/lib/api";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import type { ManualActivity, ManualLessonContent } from "@/lib/manual-pedagogy";
import { generateRecurringOccurrences, type RecurringOccurrence } from "@/lib/teaching-finance";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const emptyLesson = { title: "", content: "", guide: "", linksText: "" };
const emptyActivity = { title: "", description: "", submission_text: "", submission_url: "", feedback: "", status: "pending" as "pending" | "completed" };

export function ManualLessonsSection() {
  const [classes, setClasses] = useState<ManualClass[]>([]);
  const [students, setStudents] = useState<ManualStudent[]>([]);
  const [lessons, setLessons] = useState<ManualLessonContent[]>([]);
  const [activities, setActivities] = useState<ManualActivity[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today);
  const [occurrenceId, setOccurrenceId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [lessonScope, setLessonScope] = useState<"class" | "occurrence">("occurrence");
  const [lessonDraft, setLessonDraft] = useState(emptyLesson);
  const [activityDraft, setActivityDraft] = useState(emptyActivity);
  const [editingLessonId, setEditingLessonId] = useState("");
  const [editingActivityId, setEditingActivityId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([manualTeachingApi.classes(), manualTeachingApi.students(), manualPedagogyApi.lessons(), manualPedagogyApi.activities()])
      .then(([classRows, studentRows, lessonRows, activityRows]) => {
        if (!active) return;
        setClasses(classRows); setStudents(studentRows); setLessons(lessonRows); setActivities(activityRows);
        setClassId((old) => old || classRows.find((item) => item.active)?.id || classRows[0]?.id || "");
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar as aulas próprias."); });
    return () => { active = false; };
  }, []);

  const selectedClass = classes.find((item) => item.id === classId);
  const classStudents = students.filter((item) => selectedClass?.student_ids.includes(item.id));
  const occurrences = (() => {
    if (!selectedClass || !date) return [];
    try { return generateRecurringOccurrences(selectedClass, date, date); }
    catch { return []; }
  })();
  const selectedOccurrence = occurrences.find((item) => item.id === occurrenceId) ?? occurrences[0];
  const selectedStudent = classStudents.find((item) => item.id === studentId) ?? classStudents[0];
  const classLessons = lessons.filter((item) => item.class_id === classId &&
    (!item.occurrence_id || item.occurrence_id === selectedOccurrence?.id));
  const classActivities = activities.filter((item) => item.class_id === classId &&
    item.occurrence_id === selectedOccurrence?.id);

  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClass || (lessonScope === "occurrence" && !selectedOccurrence)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const record = await manualPedagogyApi.saveLesson({
        id: editingLessonId || undefined, class_id: selectedClass.id,
        occurrence_id: lessonScope === "class" ? null : selectedOccurrence?.id,
        title: lessonDraft.title, content: lessonDraft.content, guide: lessonDraft.guide,
        links: lessonDraft.linksText.split("\n").map((line) => line.trim()).filter(Boolean)
          .map((line) => { const separator = line.indexOf("|"); return { label: separator < 0 ? "" : line.slice(0, separator).trim(), url: separator < 0 ? line : line.slice(separator + 1).trim() }; }),
      });
      setLessons((current) => [...current.filter((item) => item.id !== record.id), record]);
      setLessonDraft(emptyLesson); setEditingLessonId(""); setNotice("Aula própria salva.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a aula."); }
    finally { setSaving(false); }
  }
  async function saveActivity(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClass || !selectedStudent || !selectedOccurrence) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const record = await manualPedagogyApi.saveActivity({
        id: editingActivityId || undefined, class_id: selectedClass.id,
        student_id: selectedStudent.id, occurrence_id: selectedOccurrence.id,
        ...activityDraft,
      });
      setActivities((current) => [...current.filter((item) => item.id !== record.id), record]);
      setActivityDraft(emptyActivity); setEditingActivityId(""); setNotice("Atividade salva.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar a atividade."); }
    finally { setSaving(false); }
  }

  return <section className="panel">
    <div className="section-heading"><div><h2>Aulas próprias</h2><p className="muted">Conteúdo e atividades das turmas cadastradas por você.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!classes.length ? <p className="muted">Cadastre uma turma em Turmas para planejar suas aulas.</p> : <>
      <div className="form management-form">
        <label className="field">Turma<select className="input" value={classId} onChange={(event) => { setClassId(event.target.value); setOccurrenceId(""); setEditingLessonId(""); setEditingActivityId(""); }}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field">Data da aula<Input type="date" value={date} onChange={(event) => { setDate(event.target.value); setOccurrenceId(""); }} /></label>
        {occurrences.length > 0 && <label className="field">Horário<select className="input" value={selectedOccurrence?.id || ""} onChange={(event) => setOccurrenceId(event.target.value)}>{occurrences.map((item: RecurringOccurrence) => <option key={item.id} value={item.id}>{item.start_time}</option>)}</select></label>}
      </div>
      {occurrences.length === 0 && <p className="muted">Nenhum encontro previsto nessa data. Escolha um dia com aula no horário da turma.</p>}
      <div className="course-list">
        {classLessons.map((item) => <article className="entity-card" key={item.id}>
          <strong>{item.title}</strong><small>{item.occurrence_id ? "Apenas esta aula" : "Todas as aulas da turma"}</small>
          {item.content && <p>{item.content}</p>}{item.guide && <p>Roteiro: {item.guide}</p>}
          {item.links.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}
          <div className="card-actions"><button type="button" className="button button-ghost button-small" onClick={() => { setLessonScope(item.occurrence_id ? "occurrence" : "class"); setLessonDraft({ title: item.title, content: item.content, guide: item.guide, linksText: item.links.map((link) => `${link.label} | ${link.url}`).join("\n") }); setEditingLessonId(item.id); }}>Editar</button></div>
        </article>)}
      </div>
      <form className="form management-form" onSubmit={(event) => void saveLesson(event)}>
        <h3>{editingLessonId ? "Editar conteúdo" : "Adicionar conteúdo"}</h3>
        <label className="field">Aplicação<select className="input" value={lessonScope} onChange={(event) => setLessonScope(event.target.value as "class" | "occurrence")}><option value="occurrence">Só neste encontro</option><option value="class">Toda a turma</option></select></label>
        <label className="field">Título<Input required value={lessonDraft.title} onChange={(event) => setLessonDraft({ ...lessonDraft, title: event.target.value })} /></label>
        <label className="field">Conteúdo<textarea className="input" value={lessonDraft.content} onChange={(event) => setLessonDraft({ ...lessonDraft, content: event.target.value })} /></label>
        <label className="field">Roteiro<textarea className="input" value={lessonDraft.guide} onChange={(event) => setLessonDraft({ ...lessonDraft, guide: event.target.value })} /></label>
        <label className="field">Links de materiais (um por linha: Nome | https://endereço)<textarea className="input" placeholder="Slides | https://..." value={lessonDraft.linksText} onChange={(event) => setLessonDraft({ ...lessonDraft, linksText: event.target.value })} /></label>
        <div className="form-actions"><Button type="submit" disabled={saving || !selectedClass || (lessonScope === "occurrence" && !selectedOccurrence)}>{editingLessonId ? "Salvar conteúdo" : "Adicionar conteúdo"}</Button></div>
      </form>
      <div className="course-list">
        {classActivities.map((item) => <article className="entity-card" key={item.id}>
          <strong>{item.title}</strong> · {students.find((student) => student.id === item.student_id)?.name || "Aluno"}
          <StatusBadge tone={item.status === "completed" ? "success" : "warning"}>{item.status === "completed" ? "Concluída" : "Pendente"}</StatusBadge>
          {item.description && <p>{item.description}</p>}
          <div className="card-actions"><button type="button" className="button button-ghost button-small" onClick={() => { setStudentId(item.student_id); setActivityDraft({ title: item.title, description: item.description, submission_text: item.submission_text, submission_url: item.submission_url, feedback: item.feedback, status: item.status }); setEditingActivityId(item.id); }}>Editar atividade</button></div>
        </article>)}
      </div>
      <form className="form management-form" onSubmit={(event) => void saveActivity(event)}>
        <h3>{editingActivityId ? "Editar atividade" : "Adicionar atividade para aluno"}</h3>
        <label className="field">Aluno<select className="input" value={selectedStudent?.id || ""} onChange={(event) => setStudentId(event.target.value)}>{classStudents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field">Atividade<Input required value={activityDraft.title} onChange={(event) => setActivityDraft({ ...activityDraft, title: event.target.value })} /></label>
        <label className="field">Instruções<textarea className="input" value={activityDraft.description} onChange={(event) => setActivityDraft({ ...activityDraft, description: event.target.value })} /></label>
        <label className="field">Entrega em texto<textarea className="input" value={activityDraft.submission_text} onChange={(event) => setActivityDraft({ ...activityDraft, submission_text: event.target.value })} /></label>
        <label className="field">Link da entrega<Input type="url" placeholder="https://" value={activityDraft.submission_url} onChange={(event) => setActivityDraft({ ...activityDraft, submission_url: event.target.value })} /></label>
        <label className="field">Situação<select className="input" value={activityDraft.status} onChange={(event) => setActivityDraft({ ...activityDraft, status: event.target.value as "pending" | "completed" })}><option value="pending">Pendente</option><option value="completed">Concluída</option></select></label>
        <div className="form-actions"><Button type="submit" disabled={saving || !selectedOccurrence || !selectedStudent}>{editingActivityId ? "Salvar atividade" : "Adicionar atividade"}</Button></div>
      </form>
    </>}
  </section>;
}
