"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Modal } from "@/components/modal";
import { Button, Input } from "@/components/ui";
import { kodlandApi, manualCoursesApi, type KodlandGroup, type KodlandLesson } from "@/lib/api";
import type { ManualCourse, ManualCourseLesson, ManualCourseModule } from "@/lib/manual-courses";
import { formatDate } from "@/lib/finance";
import { kodlandLessonLocation } from "@/lib/kodland-lessons";
import { LessonMaterialModal, type LessonMaterialDetails } from "@/components/lesson-material-modal";
import { groupKodlandLessonsByCourse, groupLessonsByModule } from "@/lib/kodland-course-groups";

const LOCAL_COURSES_KEY = "nexusclass.manual-courses.v1";
const now = () => new Date().toISOString();
const newId = () => `manual-course-${crypto.randomUUID()}`;
const emptyLesson = (moduleNumber: number, lessonNumber: number): ManualCourseLesson => ({ id: newId(), title: `Aula ${moduleNumber}.${lessonNumber}`, activities: "", guide: "", slides: "", homework: "" });
const makeModules = (moduleCount: number, lessonsPerModule: number): ManualCourseModule[] => Array.from({ length: Math.max(1, moduleCount) }, (_, moduleIndex) => ({ id: newId(), title: `Módulo ${moduleIndex + 1}`, lessons: Array.from({ length: Math.max(1, lessonsPerModule) }, (_, lessonIndex) => emptyLesson(moduleIndex + 1, lessonIndex + 1)) }));
const readLocalCourses = (): ManualCourse[] => {
  if (typeof window === "undefined") return [];
  try { const value = JSON.parse(window.localStorage.getItem(LOCAL_COURSES_KEY) ?? "[]"); return Array.isArray(value) ? value as ManualCourse[] : []; }
  catch { return []; }
};
const writeLocalCourses = (courses: ManualCourse[]) => { try { window.localStorage.setItem(LOCAL_COURSES_KEY, JSON.stringify(courses)); } catch { /* storage can be unavailable */ } };
type ManualLessonSelection = { course: ManualCourse; module: ManualCourseModule; lesson: ManualCourseLesson };

export function LessonsContent({ demoData }: { demoData?: { groups: KodlandGroup[]; lessons: KodlandLesson[] }; onDemoAction?: () => void; manualAdapter?: unknown } = {}) {
  const [courseGroups, setCourseGroups] = useState<KodlandGroup[]>([]);
  const [courseLessons, setCourseLessons] = useState<KodlandLesson[]>([]);
  const [manualCourses, setManualCourses] = useState<ManualCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [builderOpen, setBuilderOpen] = useState(false);
  const [courseName, setCourseName] = useState("");
  const [moduleCount, setModuleCount] = useState(1);
  const [lessonsPerModule, setLessonsPerModule] = useState(4);
  const [draftModules, setDraftModules] = useState<ManualCourseModule[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<LessonMaterialDetails | null>(null);
  const [selectedManualLesson, setSelectedManualLesson] = useState<ManualLessonSelection | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      if (demoData) { setCourseGroups(demoData.groups); setCourseLessons(demoData.lessons); setManualCourses(readLocalCourses()); }
      else { const [groups, lessons, courses] = await Promise.all([kodlandApi.groups(), kodlandApi.lessons(), manualCoursesApi.list()]); setCourseGroups(groups.items.filter((group) => !group.archived)); setCourseLessons(lessons.items); setManualCourses(courses); }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os cursos."); }
    finally { setLoading(false); }
  }, [demoData]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const courseCatalog = useMemo(() => groupKodlandLessonsByCourse(courseGroups, courseLessons), [courseGroups, courseLessons]);
  const openBuilder = () => { setCourseName(""); setModuleCount(1); setLessonsPerModule(4); setDraftModules([]); setBuilderOpen(true); };
  const generateStructure = () => setDraftModules(makeModules(moduleCount, lessonsPerModule));
  const updateLesson = (moduleId: string, lessonId: string, patch: Partial<ManualCourseLesson>) => setDraftModules((modules) => modules.map((module) => module.id !== moduleId ? module : { ...module, lessons: module.lessons.map((lesson) => lesson.id === lessonId ? { ...lesson, ...patch } : lesson) }));
  const updateModuleTitle = (moduleId: string, title: string) => setDraftModules((modules) => modules.map((module) => module.id === moduleId ? { ...module, title } : module));
  const saveCourse = async () => {
    if (!courseName.trim() || !draftModules.length) return;
    setSaving(true); setError("");
    const course: ManualCourse = { id: newId(), name: courseName.trim(), modules: draftModules, created_at: now(), updated_at: now() };
    try { if (demoData) { const next = [...manualCourses, course]; writeLocalCourses(next); setManualCourses(next); } else { const saved = await manualCoursesApi.save(course); setManualCourses((items) => [...items, saved]); } setBuilderOpen(false); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o curso."); }
    finally { setSaving(false); }
  };
  const openKodlandLesson = (courseNameValue: string, lesson: KodlandLesson) => setSelectedMaterial({ ...lesson, classroom_tasks: lesson.classroom_tasks ?? [], location: kodlandLessonLocation(lesson), source: courseNameValue, note_key: `kodland:${lesson.external_class_id}:${lesson.id}` });

  return <div className="management-grid">
    {error && <p className="form-error" role="alert">{error}</p>}
    <section className="panel lessons-catalog-panel">
      <div className="section-heading"><div><h2>Cursos</h2><p className="muted">Turmas sincronizadas e cursos próprios no mesmo catálogo.</p></div><Button type="button" onClick={openBuilder}>Criar novo curso</Button></div>
      {loading ? <p className="muted">Carregando cursos…</p> : !courseCatalog.length && !manualCourses.length ? <p className="muted">Nenhum curso cadastrado.</p> : <div className="course-list" data-tour="lessons-courses">
        {manualCourses.map((course) => <details className="course-card manual-course-card" key={course.id}><summary><span><strong>{course.name}</strong><small>Curso próprio · {course.modules.length} módulo{course.modules.length === 1 ? "" : "s"}</small></span><b>{course.modules.reduce((total, module) => total + module.lessons.length, 0)} aulas</b></summary><div className="course-lessons">{course.modules.map((module) => <section className="course-module" key={module.id}><div className="course-module-heading"><h3>{module.title}</h3><span>{module.lessons.length} aulas</span></div><div className="course-module-lessons">{module.lessons.map((lesson) => <button className="course-lesson course-lesson-action" type="button" key={lesson.id} onClick={() => setSelectedManualLesson({ course, module, lesson })}><div><strong>{lesson.title}</strong><span>{[lesson.activities && "Atividades", lesson.guide && "Roteiro", lesson.slides && "Slides", lesson.homework && "Lição de casa"].filter(Boolean).join(" · ") || "Sem materiais cadastrados"}</span></div><span className="course-lesson-hint">Ver detalhes</span></button>)}</div></section>)}</div></details>)}
        {courseCatalog.map((course) => <details className="course-card" key={course.id}><summary><span><strong>{course.name}</strong><small>{course.groups.length} turma{course.groups.length === 1 ? "" : "s"}: {course.groups.map((group) => group.title || group.external_id).join(", ")}</small></span><b>{course.lessons.length} aulas</b></summary><div className="course-lessons">{course.lessons.length ? groupLessonsByModule(course.lessons).map((module) => <section className="course-module" key={module.id}><div className="course-module-heading"><h3>{module.label}</h3><span>{module.lessons.length} aulas</span></div><div className="course-module-lessons">{module.lessons.map((lesson) => <button className="course-lesson course-lesson-action" type="button" key={lesson.id} onClick={() => openKodlandLesson(course.name, lesson)}><div><strong>Aula {(module.number ? lesson.lesson_number : lesson.course_index ?? lesson.lesson_number) || "—"}: {lesson.title || lesson.theme || "Aula"}</strong><span>{lesson.lesson_date ? formatDate(lesson.lesson_date) : "Data a confirmar"}</span></div><span className="course-lesson-hint">{lesson.materials_status === "pending" || lesson.materials_status === "error" ? "Carregar materiais" : "Ver materiais"}</span></button>)}</div></section>) : <p className="muted">Ainda não há aulas desta turma.</p>}</div></details>)}
      </div>}
    </section>

    <Modal open={builderOpen} title="Criar novo curso" onClose={() => { if (!saving) setBuilderOpen(false); }} className="manual-course-builder-modal"><div className="manual-course-builder"><div className="manual-course-builder-grid"><label className="field">Nome do curso<Input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="Ex.: Introdução à programação" /></label><label className="field">Quantidade de módulos<input className="input" type="number" min="1" max="30" value={moduleCount} onChange={(event) => setModuleCount(Number(event.target.value))} /></label><label className="field">Aulas por módulo<input className="input" type="number" min="1" max="30" value={lessonsPerModule} onChange={(event) => setLessonsPerModule(Number(event.target.value))} /></label></div><Button type="button" className="button-ghost" onClick={generateStructure}>Gerar estrutura</Button>{draftModules.length > 0 && <div className="manual-course-draft">{draftModules.map((module, moduleIndex) => <fieldset className="manual-course-module" key={module.id}><legend>Módulo {moduleIndex + 1}</legend><label className="field">Nome do módulo<Input value={module.title} onChange={(event) => updateModuleTitle(module.id, event.target.value)} /></label>{module.lessons.map((lesson, lessonIndex) => <fieldset className="manual-course-lesson" key={lesson.id}><legend>Aula {moduleIndex + 1}.{lessonIndex + 1}</legend><label className="field">Título<Input value={lesson.title} onChange={(event) => updateLesson(module.id, lesson.id, { title: event.target.value })} /></label><label className="field">Atividades<textarea className="input" rows={3} value={lesson.activities} onChange={(event) => updateLesson(module.id, lesson.id, { activities: event.target.value })} placeholder="Descreva as atividades da aula" /></label><label className="field">Roteiro<textarea className="input" rows={3} value={lesson.guide} onChange={(event) => updateLesson(module.id, lesson.id, { guide: event.target.value })} /></label><label className="field">Slides (link)<Input type="url" value={lesson.slides} onChange={(event) => updateLesson(module.id, lesson.id, { slides: event.target.value })} placeholder="https://..." /></label><label className="field">Lição de casa<textarea className="input" rows={3} value={lesson.homework} onChange={(event) => updateLesson(module.id, lesson.id, { homework: event.target.value })} /></label></fieldset>)}</fieldset>)}</div>}<div className="form-actions"><Button type="button" className="button-ghost" onClick={() => setBuilderOpen(false)}>Cancelar</Button><Button type="button" disabled={saving || !courseName.trim() || !draftModules.length} onClick={() => void saveCourse()}>{saving ? "Salvando…" : "Salvar curso"}</Button></div></div></Modal>
    <Modal open={Boolean(selectedManualLesson)} title={selectedManualLesson?.lesson.title ?? "Aula"} onClose={() => setSelectedManualLesson(null)}>{selectedManualLesson && <div className="manual-course-lesson-details"><p className="muted">{selectedManualLesson.course.name} · {selectedManualLesson.module.title}</p>{([ ["Atividades", selectedManualLesson.lesson.activities], ["Roteiro", selectedManualLesson.lesson.guide], ["Slides", selectedManualLesson.lesson.slides], ["Lição de casa", selectedManualLesson.lesson.homework] ] as Array<[string, string]>).map(([label, value]) => value && <section key={label}><h3>{label}</h3>{/^https?:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer">Abrir material</a> : <p>{value}</p>}</section>)}</div>}</Modal>
    <LessonMaterialModal demoMode={Boolean(demoData)} open={Boolean(selectedMaterial)} title={selectedMaterial ? `${selectedMaterial.source} · ${selectedMaterial.location}` : "Materiais da aula"} lesson={selectedMaterial} onClose={() => setSelectedMaterial(null)} onMaterialsLoaded={(updated) => setCourseLessons((items) => items.map((item) => item.id === updated.id ? updated : item))} />
  </div>;
}

export default function LessonsPage() { return <AuthGuard>{(user) => <Shell user={user}><LessonsContent /></Shell>}</AuthGuard>; }
