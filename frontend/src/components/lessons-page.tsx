"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Archive, BookPlus, Copy, Download, Pencil, Plus, Trash2 } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { isHttpUrl } from "@/lib/manual-pedagogy";
import { Modal } from "@/components/modal";
import { Button, Input } from "@/components/ui";
import { kodlandApi, manualCoursesApi, tutorPreferencesApi, type KodlandGroup, type KodlandLesson } from "@/lib/api";
import { manualCourseLessons, type ManualCourse, type ManualCourseLesson, type ManualCourseModule } from "@/lib/manual-courses";
import type { ManualAdapters } from "@/lib/manual-adapters";
import { formatDate } from "@/lib/finance";
import { kodlandLessonLocation } from "@/lib/kodland-lessons";
import { LessonMaterialModal, type LessonMaterialDetails } from "@/components/lesson-material-modal";
import { groupKodlandLessonsByCourse, groupLessonsByModule } from "@/lib/kodland-course-groups";

const now = () => new Date().toISOString();
const newId = () => `manual-course-${crypto.randomUUID()}`;
const emptyLesson = (moduleNumber: number, lessonNumber: number): ManualCourseLesson => ({ id: newId(), title: `Aula ${moduleNumber}.${lessonNumber}`, activities: "", guide: "", slides: "", homework: "" });
const makeModules = (moduleCount: number, lessonsPerModule: number): ManualCourseModule[] => Array.from({ length: Math.max(1, moduleCount) }, (_, moduleIndex) => ({ id: newId(), title: `Módulo ${moduleIndex + 1}`, lessons: Array.from({ length: Math.max(1, lessonsPerModule) }, (_, lessonIndex) => emptyLesson(moduleIndex + 1, lessonIndex + 1)) }));
type ManualLessonSelection = { course: ManualCourse; module: ManualCourseModule; lesson: ManualCourseLesson; code: string };

const move = <T,>(items: T[], index: number, direction: -1 | 1) => {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
};

export function LessonsContent({ demoData, manualAdapter }: { demoData?: { groups: KodlandGroup[]; lessons: KodlandLesson[] }; onDemoAction?: () => void; manualAdapter?: ManualAdapters } = {}) {
  const coursesApi = manualAdapter?.courses ?? manualCoursesApi;
  const preferencesApi = manualAdapter?.preferences ?? tutorPreferencesApi;
  const [courseGroups, setCourseGroups] = useState<KodlandGroup[]>([]);
  const [courseLessons, setCourseLessons] = useState<KodlandLesson[]>([]);
  const [manualCourses, setManualCourses] = useState<ManualCourse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [replacingStructure, setReplacingStructure] = useState(false);
  const [deletingCourse, setDeletingCourse] = useState<ManualCourse | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState("");
  const [courseName, setCourseName] = useState("");
  const [moduleCount, setModuleCount] = useState(1);
  const [lessonsPerModule, setLessonsPerModule] = useState(4);
  const [draftModules, setDraftModules] = useState<ManualCourseModule[]>([]);
  const [selectedMaterial, setSelectedMaterial] = useState<LessonMaterialDetails | null>(null);
  const [selectedManualLesson, setSelectedManualLesson] = useState<ManualLessonSelection | null>(null);
  const [saving, setSaving] = useState(false);
  const [kodlandEnabled, setKodlandEnabled] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const preferences = await preferencesApi.get();
      setKodlandEnabled(preferences.kodland_enabled);
      if (demoData && preferences.kodland_enabled) {
        setCourseGroups(demoData.groups); setCourseLessons(demoData.lessons); setManualCourses(await coursesApi.list());
      } else if (demoData || !preferences.kodland_enabled) {
        setCourseGroups([]); setCourseLessons([]); setManualCourses(await coursesApi.list());
      } else {
        const [groups, lessons, courses] = await Promise.all([kodlandApi.groups(), kodlandApi.lessons(), coursesApi.list()]);
        setCourseGroups(groups.items.filter((group) => !group.archived)); setCourseLessons(lessons.items); setManualCourses(courses);
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os cursos."); }
    finally { setLoading(false); }
  }, [coursesApi, demoData, preferencesApi]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const courseCatalog = useMemo(() => kodlandEnabled ? groupKodlandLessonsByCourse(courseGroups, courseLessons) : [], [courseGroups, courseLessons, kodlandEnabled]);
  const openBuilder = (course?: ManualCourse) => {
    setError(""); setEditingCourseId(course?.id ?? ""); setCourseName(course?.name ?? ""); setModuleCount(course?.modules.length ?? 1);
    setLessonsPerModule(course?.modules[0]?.lessons.length ?? 4); setDraftModules(course ? structuredClone(course.modules) : []); setBuilderOpen(true);
  };
  const generateStructure = () => {
    if (!Number.isInteger(moduleCount) || moduleCount < 1 || moduleCount > 30 || !Number.isInteger(lessonsPerModule) || lessonsPerModule < 1 || lessonsPerModule > 30) { setError("Use entre 1 e 30 módulos e aulas por módulo."); return; }
    if (draftModules.length) { setReplacingStructure(true); return; }
    setDraftModules(makeModules(moduleCount, lessonsPerModule));
  };
  const updateLesson = (moduleId: string, lessonId: string, lessonPatch: Partial<ManualCourseLesson>) => setDraftModules((modules) => modules.map((module) => module.id !== moduleId ? module : { ...module, lessons: module.lessons.map((lesson) => lesson.id === lessonId ? { ...lesson, ...lessonPatch } : lesson) }));
  const updateModule = (moduleId: string, modulePatch: Partial<ManualCourseModule>) => setDraftModules((modules) => modules.map((module) => module.id === moduleId ? { ...module, ...modulePatch } : module));
  const saveCourse = async () => {
    if (!courseName.trim() || !draftModules.length || draftModules.some((module) => !module.title.trim() || !module.lessons.length || module.lessons.some((lesson) => !lesson.title.trim()))) {
      setError("Informe o nome do curso, dos módulos e de todas as aulas."); return;
    }
    const invalidSlide = draftModules.flatMap((module) => module.lessons).find((lesson) => lesson.slides.trim() && !isHttpUrl(lesson.slides.trim()));
    if (invalidSlide) { setError(`Informe um link http(s) válido para os slides de “${invalidSlide.title}”.`); return; }
    setSaving(true); setError("");
    const previous = manualCourses.find((item) => item.id === editingCourseId);
    const course: ManualCourse = { id: previous?.id ?? newId(), name: courseName.trim(), modules: draftModules, archived: previous?.archived ?? false, created_at: previous?.created_at ?? now(), updated_at: now() };
    try { const saved = await coursesApi.save(course); setManualCourses((items) => [...items.filter((item) => item.id !== saved.id), saved]); setBuilderOpen(false); setNotice(previous ? "Curso atualizado." : "Curso criado."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o curso."); }
    finally { setSaving(false); }
  };
  const duplicateCourse = async (course: ManualCourse) => {
    const copy: ManualCourse = { ...structuredClone(course), id: newId(), name: `${course.name} — cópia`, archived: false, modules: course.modules.map((module) => ({ ...module, id: newId(), lessons: module.lessons.map((lesson) => ({ ...lesson, id: newId() })) })), created_at: now(), updated_at: now() };
    try { const saved = await coursesApi.save(copy); setManualCourses((items) => [...items, saved]); setNotice("Curso duplicado."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível duplicar o curso."); }
  };
  const toggleArchived = async (course: ManualCourse) => {
    try { const saved = await coursesApi.save({ ...course, archived: !course.archived }); setManualCourses((items) => items.map((item) => item.id === saved.id ? saved : item)); setNotice(saved.archived ? "Curso arquivado." : "Curso reativado."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível atualizar o curso."); }
  };
  const deleteCourse = async (course: ManualCourse) => {
    try { await coursesApi.delete(course.id); setManualCourses((items) => items.filter((item) => item.id !== course.id)); setNotice("Curso excluído."); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível excluir o curso."); throw reason; }
  };
  const openKodlandLesson = (source: string, lesson: KodlandLesson) => setSelectedMaterial({ ...lesson, classroom_tasks: lesson.classroom_tasks ?? [], location: kodlandLessonLocation(lesson), source, note_key: `kodland:${lesson.external_class_id}:${lesson.id}` });

  return <div className="management-grid page-fill-grid">
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <section className="panel lessons-catalog-panel page-fill-panel">
      <div className="section-heading"><div><h2>Cursos</h2><p className="muted">Crie seus cursos e reutilize a sequência em qualquer turma.</p></div><Button type="button" className="create-course-button" onClick={() => openBuilder()}><BookPlus size={19} aria-hidden="true" /><span>Criar novo curso</span></Button></div>
      {loading ? <p className="muted">Carregando cursos…</p> : !courseCatalog.length && !manualCourses.length ? <p className="muted">Nenhum curso cadastrado. Crie o primeiro para organizar módulos, aulas e materiais.</p> : <div className="course-list" data-tour="lessons-courses">
        {manualCourses.map((course) => <details className={`course-card manual-course-card${course.archived ? " manual-course-archived" : ""}`} key={course.id}><summary><span><strong>{course.name}</strong><small>Curso próprio · {course.modules.length} módulo{course.modules.length === 1 ? "" : "s"}{course.archived ? " · Arquivado" : ""}</small></span><b>{manualCourseLessons(course).length} aulas</b></summary><div className="course-card-actions"><button className="button button-ghost button-small" type="button" onClick={() => openBuilder(course)}><Pencil size={15} aria-hidden="true" /> Editar curso</button><button className="button button-ghost button-small" type="button" onClick={() => void duplicateCourse(course)}><Copy size={15} /> Duplicar</button><button className="button button-ghost button-small" type="button" onClick={() => void toggleArchived(course)}><Archive size={15} /> {course.archived ? "Reativar" : "Arquivar"}</button><button className="button button-ghost button-small" type="button" onClick={() => { setError(""); setDeletingCourse(course); }}><Trash2 size={15} aria-hidden="true" /> Excluir curso</button></div><div className="course-lessons">{course.modules.map((module, moduleIndex) => <section className="course-module" key={module.id}><div className="course-module-heading"><h3>{module.title}</h3><span>{module.lessons.filter((lesson) => !lesson.archived).length} aulas</span></div><div className="course-module-lessons">{module.lessons.filter((lesson) => !lesson.archived).map((lesson, lessonIndex) => <button className="course-lesson course-lesson-action" type="button" key={lesson.id} onClick={() => setSelectedManualLesson({ course, module, lesson, code: `M${moduleIndex + 1}L${lessonIndex + 1}` })}><div><strong>{`M${moduleIndex + 1}L${lessonIndex + 1}`} · {lesson.title}</strong><span>{[lesson.activities && "Atividades", lesson.guide && "Roteiro", lesson.slides && "Slides", lesson.homework && "Lição de casa"].filter(Boolean).join(" · ") || "Sem materiais cadastrados"}</span></div><span className="course-lesson-hint">Ver detalhes</span></button>)}</div></section>)}</div></details>)}
        {courseCatalog.map((course) => <details className="course-card" key={course.id}><summary><span><strong>{course.name}</strong><small>{course.groups.length} turma{course.groups.length === 1 ? "" : "s"}: {course.groups.map((group) => group.title || group.external_id).join(", ")}</small></span><b>{course.lessons.length} aulas</b></summary><div className="course-lessons">{course.lessons.length ? groupLessonsByModule(course.lessons).map((module) => <section className="course-module" key={module.id}><div className="course-module-heading"><h3>{module.label}</h3><span>{module.lessons.length} aulas</span></div><div className="course-module-lessons">{module.lessons.map((lesson) => <button className="course-lesson course-lesson-action" type="button" key={lesson.id} onClick={() => openKodlandLesson(course.name, lesson)}><div><strong>Aula {(module.number ? lesson.lesson_number : lesson.course_index ?? lesson.lesson_number) || "—"}: {lesson.title || lesson.theme || "Aula"}</strong><span>{lesson.lesson_date ? formatDate(lesson.lesson_date) : "Data a confirmar"}</span></div><span className="course-lesson-hint">Ver materiais</span></button>)}</div></section>) : <p className="muted">Ainda não há aulas desta turma.</p>}</div></details>)}
      </div>}
    </section>



    <ConfirmDialog open={replacingStructure} title="Substituir estrutura" confirmLabel="Substituir estrutura" danger onClose={() => setReplacingStructure(false)} onConfirm={() => setDraftModules(makeModules(moduleCount, lessonsPerModule))}><p>A estrutura e os materiais em edição serão substituídos. Esta ação não pode ser desfeita.</p></ConfirmDialog>
    <ConfirmDialog open={Boolean(deletingCourse)} title="Excluir curso" confirmLabel="Confirmar exclusão" danger onClose={() => setDeletingCourse(null)} onConfirm={() => deletingCourse ? deleteCourse(deletingCourse) : undefined}><p>Excluir o curso “{deletingCourse?.name}” e seus materiais? Esta ação não pode ser desfeita.</p></ConfirmDialog>
    <Modal open={builderOpen} title={editingCourseId ? "Editar curso" : "Criar novo curso"} onClose={() => { if (!saving) setBuilderOpen(false); }} className="manual-course-builder-modal"><div className="manual-course-builder">{error && <p className="form-error" role="alert">{error}</p>}<div className="manual-course-builder-grid"><label className="field">Nome do curso<Input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="Ex.: Introdução à programação" /></label>{!editingCourseId && <><label className="field">Quantidade de módulos<input className="input" type="number" min="1" max="30" value={moduleCount} onChange={(event) => setModuleCount(Number(event.target.value))} /></label><label className="field">Aulas por módulo<input className="input" type="number" min="1" max="30" value={lessonsPerModule} onChange={(event) => setLessonsPerModule(Number(event.target.value))} /></label></>}</div>{!editingCourseId && <Button type="button" className="button-ghost" onClick={generateStructure}>Gerar estrutura</Button>}{draftModules.length > 0 && <div className="manual-course-draft">{draftModules.map((module, moduleIndex) => <fieldset className="manual-course-module" key={module.id}><legend>Módulo {moduleIndex + 1}</legend><div className="card-actions"><button type="button" className="button button-ghost button-small" disabled={moduleIndex === 0} onClick={() => setDraftModules((items) => move(items, moduleIndex, -1))}>↑</button><button type="button" className="button button-ghost button-small" disabled={moduleIndex === draftModules.length - 1} onClick={() => setDraftModules((items) => move(items, moduleIndex, 1))}>↓</button><button type="button" className="button button-ghost button-small" disabled={draftModules.length === 1} onClick={() => setDraftModules((items) => items.filter((item) => item.id !== module.id))}>Remover módulo</button></div><label className="field">Nome do módulo<Input value={module.title} onChange={(event) => updateModule(module.id, { title: event.target.value })} /></label>{module.lessons.map((lesson, lessonIndex) => <fieldset className="manual-course-lesson" key={lesson.id}><legend>{`M${moduleIndex + 1}L${lessonIndex + 1}`}</legend><div className="card-actions"><button type="button" className="button button-ghost button-small" disabled={lessonIndex === 0} onClick={() => updateModule(module.id, { lessons: move(module.lessons, lessonIndex, -1) })}>↑</button><button type="button" className="button button-ghost button-small" disabled={lessonIndex === module.lessons.length - 1} onClick={() => updateModule(module.id, { lessons: move(module.lessons, lessonIndex, 1) })}>↓</button><button type="button" className="button button-ghost button-small" disabled={module.lessons.length === 1} onClick={() => updateModule(module.id, { lessons: module.lessons.filter((item) => item.id !== lesson.id) })}>Remover</button></div><label className="field">Título<Input value={lesson.title} onChange={(event) => updateLesson(module.id, lesson.id, { title: event.target.value })} /></label><label className="field">Atividades<textarea className="input" rows={3} value={lesson.activities} onChange={(event) => updateLesson(module.id, lesson.id, { activities: event.target.value })} /></label><label className="field">Roteiro<textarea className="input" rows={3} value={lesson.guide} onChange={(event) => updateLesson(module.id, lesson.id, { guide: event.target.value })} /></label><label className="field">Slides (link)<Input type="url" value={lesson.slides} onChange={(event) => updateLesson(module.id, lesson.id, { slides: event.target.value })} placeholder="https://..." /></label><label className="field">Lição de casa<textarea className="input" rows={3} value={lesson.homework} onChange={(event) => updateLesson(module.id, lesson.id, { homework: event.target.value })} /></label></fieldset>)}<Button type="button" className="button-ghost" onClick={() => updateModule(module.id, { lessons: [...module.lessons, emptyLesson(moduleIndex + 1, module.lessons.length + 1)] })}><Plus size={15} /> Adicionar aula</Button></fieldset>)}<Button type="button" className="button-ghost" onClick={() => setDraftModules((items) => [...items, { id: newId(), title: `Módulo ${items.length + 1}`, lessons: [emptyLesson(items.length + 1, 1)] }])}><Plus size={15} /> Adicionar módulo</Button></div>}<div className="form-actions"><Button type="button" className="button-ghost" onClick={() => setBuilderOpen(false)}>Cancelar</Button><Button type="button" disabled={saving || !courseName.trim() || !draftModules.length} onClick={() => void saveCourse()}>{saving ? "Salvando…" : "Salvar curso"}</Button></div></div></Modal>
    <Modal open={Boolean(selectedManualLesson)} title={selectedManualLesson ? `${selectedManualLesson.code} · ${selectedManualLesson.lesson.title}` : "Aula"} onClose={() => setSelectedManualLesson(null)}>{selectedManualLesson && <div className="manual-course-lesson-details"><p className="muted">{selectedManualLesson.course.name} · {selectedManualLesson.module.title}</p>{([ ["Atividades", selectedManualLesson.lesson.activities], ["Roteiro", selectedManualLesson.lesson.guide], ["Slides", selectedManualLesson.lesson.slides], ["Lição de casa", selectedManualLesson.lesson.homework] ] as Array<[string, string]>).map(([label, value]) => value && <section key={label}><h3>{label}</h3>{/^https?:\/\//.test(value) ? <a href={value} target="_blank" rel="noreferrer"><Download size={16} aria-hidden="true" /> Abrir ou baixar material</a> : <p>{value}</p>}</section>)}</div>}</Modal>
    <LessonMaterialModal demoMode={Boolean(demoData)} open={Boolean(selectedMaterial)} title={selectedMaterial ? `${selectedMaterial.source} · ${selectedMaterial.location}` : "Materiais da aula"} lesson={selectedMaterial} onClose={() => setSelectedMaterial(null)} onMaterialsLoaded={(updated) => setCourseLessons((items) => items.map((item) => item.id === updated.id ? updated : item))} />
  </div>;
}

export default function LessonsPage() { return <AuthGuard>{(user) => <Shell user={user}><LessonsContent /></Shell>}</AuthGuard>; }
