"use client";

import { type FormEvent, useEffect, useState } from "react";
import { Button, Input, StatusBadge } from "@/components/ui";
import { manualCoursesApi, manualOperationsApi, manualPedagogyApi, manualTeachingApi } from "@/lib/api";
import type { ManualAdapters } from "@/lib/manual-adapters";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import type { ManualActivity, ManualLessonContent } from "@/lib/manual-pedagogy";
import type { ManualOccurrence } from "@/lib/manual-operations";
import { manualCourseLessons, type ManualCourse } from "@/lib/manual-courses";

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const emptyLesson = { title: "", content: "", guide: "", linksText: "" };
const emptyActivity = { title: "", description: "", submission_text: "", submission_url: "", feedback: "", status: "assigned" as ManualActivity["status"] };

export function ManualLessonsSection({ adapter }: { adapter?: ManualAdapters } = {}) {
  const teaching = adapter?.teaching ?? manualTeachingApi;
  const pedagogy = adapter?.pedagogy ?? manualPedagogyApi;
  const operations = adapter?.operations ?? manualOperationsApi;
  const courseStore = adapter?.courses ?? manualCoursesApi;
  const [classes, setClasses] = useState<ManualClass[]>([]);
  const [students, setStudents] = useState<ManualStudent[]>([]);
  const [lessons, setLessons] = useState<ManualLessonContent[]>([]);
  const [activities, setActivities] = useState<ManualActivity[]>([]);
  const [storedOccurrences, setStoredOccurrences] = useState<ManualOccurrence[]>([]);
  const [courses, setCourses] = useState<ManualCourse[]>([]);
  const [classId, setClassId] = useState("");
  const [date, setDate] = useState(today);
  const [occurrenceId, setOccurrenceId] = useState("");
  const [studentId, setStudentId] = useState("");
  const [studentIds, setStudentIds] = useState<string[]>([]);
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
    Promise.all([teaching.classes(), teaching.students(), pedagogy.lessons(), pedagogy.activities(), courseStore.list()])
      .then(async ([classRows, studentRows, lessonRows, activityRows, courseRows]) => {
        if (!active) return;
        const occurrenceRows = (await Promise.all(classRows.filter((item) => item.active).map((item) => operations.ensureOccurrences(item.id)))).flat();
        if (!active) return;
        setClasses(classRows); setStudents(studentRows); setLessons(lessonRows); setActivities(activityRows); setCourses(courseRows);
        setStoredOccurrences(occurrenceRows);
        setClassId((old) => old || classRows.find((item) => item.active)?.id || classRows[0]?.id || "");
      })
      .catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar as aulas próprias."); });
    return () => { active = false; };
  }, [teaching, pedagogy, operations, courseStore]);

  const selectedClass = classes.find((item) => item.id === classId);
  const selectedCourse = courses.find((item) => item.id === selectedClass?.course_id);
  const curriculumLessons = selectedCourse ? manualCourseLessons(selectedCourse) : [];
  const classStudents = students.filter((item) => selectedClass?.student_ids.includes(item.id));
  const occurrences = storedOccurrences.filter((item) => item.class_id === selectedClass?.id && item.lesson_date === date);
  const selectedOccurrence = occurrences.find((item) => item.id === occurrenceId) ?? occurrences[0];
  const selectedStudent = classStudents.find((item) => item.id === studentId) ?? classStudents[0];
  const classLessons = lessons.filter((item) => item.class_id === classId &&
    (!item.occurrence_id || item.occurrence_id === selectedOccurrence?.id));
  const classActivities = activities.filter((item) => item.class_id === classId &&
    item.occurrence_id === selectedOccurrence?.id);
  const updateOccurrence = (patch: Partial<ManualOccurrence>) => {
    if (!selectedOccurrence) return;
    setStoredOccurrences((current) => current.map((item) => item.id === selectedOccurrence.id ? { ...item, ...patch } : item));
  };
  const saveOccurrence = async () => {
    if (!selectedOccurrence) return;
    setSaving(true); setError("");
    try {
      await operations.saveOccurrence(selectedOccurrence);
      const replanned = await operations.ensureOccurrences(selectedOccurrence.class_id);
      setStoredOccurrences((current) => [...current.filter((item) => item.class_id !== selectedOccurrence.class_id), ...replanned]);
      setNotice("Ocorrência atualizada.");
    }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar a ocorrência."); }
    finally { setSaving(false); }
  };

  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedClass || (lessonScope === "occurrence" && !selectedOccurrence)) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const record = await pedagogy.saveLesson({
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
    if (!selectedClass || !selectedOccurrence) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const targets = editingActivityId ? [selectedStudent?.id ?? studentId] : studentIds.length ? studentIds : classStudents.filter((item) => item.active).map((item) => item.id);
      if (!targets.length) throw new Error("Selecione ao menos um aluno.");
      const records = await Promise.all(targets.map((target) => pedagogy.saveActivity({ id: editingActivityId || undefined, class_id: selectedClass.id, student_id: target, occurrence_id: selectedOccurrence.id, ...activityDraft })));
      setActivities((current) => [...current.filter((item) => !records.some((record) => record.id === item.id)), ...records]);
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
        <label className="field">Turma<select className="input" data-tour="lessons-manual-class" value={classId} onChange={(event) => { setClassId(event.target.value); setOccurrenceId(""); setEditingLessonId(""); setEditingActivityId(""); }}>{classes.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field">Data da aula<Input type="date" data-tour="lessons-manual-date" value={date} onChange={(event) => { setDate(event.target.value); setOccurrenceId(""); }} /></label>
        {occurrences.length > 0 && <label className="field">Horário<select className="input" value={selectedOccurrence?.id || ""} onChange={(event) => setOccurrenceId(event.target.value)}>{occurrences.map((item) => <option key={item.id} value={item.id}>{item.start_time} · {item.course_code || item.title_snapshot}</option>)}</select></label>}
      </div>
      {occurrences.length === 0 && <p className="muted">Nenhum encontro previsto nessa data. Escolha um dia com aula no horário da turma.</p>}
      {selectedOccurrence && <div className="form management-form manual-occurrence-form"><h3>{selectedOccurrence.course_code || "Aula sem código"} · {selectedOccurrence.title_snapshot}</h3><label className="field">Estado<select className="input" value={selectedOccurrence.status} onChange={(event) => updateOccurrence({ status: event.target.value as ManualOccurrence["status"] })}><option value="planned">Planejada</option><option value="held">Realizada</option><option value="cancelled">Cancelada</option><option value="rescheduled">Remarcada</option></select></label>{selectedCourse && <label className="field">Aula do curso<select className="input" value={selectedOccurrence.curriculum_mode === "skip" ? "skip" : selectedOccurrence.curriculum_mode === "override" ? selectedOccurrence.course_lesson_id ?? "automatic" : "automatic"} onChange={(event) => { const value = event.target.value; if (value === "automatic") updateOccurrence({ curriculum_mode: "automatic" }); else if (value === "skip") updateOccurrence({ curriculum_mode: "skip", course_lesson_id: null, course_code: "", title_snapshot: "Aula do curso pulada" }); else { const selected = curriculumLessons.find((item) => item.lesson.id === value); if (selected) updateOccurrence({ curriculum_mode: "override", course_lesson_id: selected.lesson.id, course_code: selected.code, title_snapshot: selected.lesson.title, guide: selectedOccurrence.guide || selected.lesson.guide, slides_url: selectedOccurrence.slides_url || selected.lesson.slides, homework: selectedOccurrence.homework || selected.lesson.homework }); } }}><option value="automatic">Sequência automática</option>{curriculumLessons.map((item) => <option value={item.lesson.id} key={item.lesson.id}>{item.code} · {item.lesson.title}</option>)}<option value="skip">Pular esta aula do curso</option></select></label>}<label className="field">Gravação<Input type="url" placeholder="https://..." value={selectedOccurrence.recording_url} onChange={(event) => updateOccurrence({ recording_url: event.target.value })} /></label><label className="field">Slides<Input type="url" placeholder="https://..." value={selectedOccurrence.slides_url} onChange={(event) => updateOccurrence({ slides_url: event.target.value })} /></label><label className="field field-wide">Observações<textarea className="input" value={selectedOccurrence.notes} onChange={(event) => updateOccurrence({ notes: event.target.value })} /></label><div className="form-actions"><Button type="button" disabled={saving} onClick={() => void saveOccurrence()}>Salvar ocorrência</Button></div></div>}
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
        <div className="form-actions"><Button type="submit" data-tour="lessons-manual-content" disabled={saving || !selectedClass || (lessonScope === "occurrence" && !selectedOccurrence)}>{editingLessonId ? "Salvar conteúdo" : "Adicionar conteúdo"}</Button></div>
      </form>
      <div className="course-list">
        {classActivities.map((item) => <article className="entity-card" key={item.id}>
          <strong>{item.title}</strong> · {students.find((student) => student.id === item.student_id)?.name || "Aluno"}
          <StatusBadge tone={item.status === "corrected" || item.status === "completed" ? "success" : "warning"}>{{ assigned: "Atribuída", submitted: "Entregue", corrected: "Corrigida", pending: "Entregue", completed: "Corrigida" }[item.status]}</StatusBadge>
          {item.description && <p>{item.description}</p>}
          <div className="card-actions"><button type="button" className="button button-ghost button-small" onClick={() => { setStudentId(item.student_id); setActivityDraft({ title: item.title, description: item.description, submission_text: item.submission_text, submission_url: item.submission_url, feedback: item.feedback, status: item.status }); setEditingActivityId(item.id); }}>Editar atividade</button></div>
        </article>)}
      </div>
      <form className="form management-form" onSubmit={(event) => void saveActivity(event)}>
        <h3>{editingActivityId ? "Editar atividade" : "Adicionar atividade para aluno"}</h3>
        {editingActivityId ? <label className="field">Aluno<select className="input" value={selectedStudent?.id || ""} onChange={(event) => setStudentId(event.target.value)}>{classStudents.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label> : <fieldset className="field field-wide"><legend>Destinatários</legend><label className="checkbox-row"><input type="checkbox" checked={studentIds.length === 0} onChange={() => setStudentIds([])} />Todos os alunos ativos</label>{classStudents.filter((item) => item.active).map((item) => <label className="checkbox-row" key={item.id}><input type="checkbox" checked={studentIds.includes(item.id)} onChange={(event) => setStudentIds((current) => event.target.checked ? [...new Set([...current, item.id])] : current.filter((id) => id !== item.id))} />{item.name}</label>)}</fieldset>}
        <label className="field">Atividade<Input required value={activityDraft.title} onChange={(event) => setActivityDraft({ ...activityDraft, title: event.target.value })} /></label>
        <label className="field">Instruções<textarea className="input" value={activityDraft.description} onChange={(event) => setActivityDraft({ ...activityDraft, description: event.target.value })} /></label>
        <label className="field">Entrega em texto<textarea className="input" value={activityDraft.submission_text} onChange={(event) => setActivityDraft({ ...activityDraft, submission_text: event.target.value })} /></label>
        <label className="field">Link da entrega<Input type="url" placeholder="https://" value={activityDraft.submission_url} onChange={(event) => setActivityDraft({ ...activityDraft, submission_url: event.target.value })} /></label>
        <label className="field">Situação<select className="input" value={activityDraft.status} onChange={(event) => setActivityDraft({ ...activityDraft, status: event.target.value as ManualActivity["status"] })}><option value="assigned">Atribuída</option><option value="submitted">Entregue</option><option value="corrected">Corrigida</option></select></label>
        <div className="form-actions"><Button type="submit" data-tour="lessons-manual-activity" disabled={saving || !selectedOccurrence || (editingActivityId ? !selectedStudent : !classStudents.length)}>{editingActivityId ? "Salvar atividade" : "Atribuir atividade"}</Button></div>
      </form>
    </>}
  </section>;
}
