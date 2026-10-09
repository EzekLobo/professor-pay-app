"use client";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Modal } from "@/components/modal";
import {
  LessonMaterialModal,
  type LessonMaterialDetails,
} from "@/components/lesson-material-modal";
import { Button, Input } from "@/components/ui";
import {
  courseImportApi,
  kodlandApi,
  type CourseImportInput,
  type CourseImportOption,
  type ImportedCourse,
  type ImportedCourseLesson,
  type KodlandGroup,
  type KodlandLesson,
} from "@/lib/api";
import { formatDate } from "@/lib/finance";
import { kodlandLessonLocation } from "@/lib/kodland-lessons";
import {
  groupKodlandLessonsByCourse,
  groupLessonsByModule,
} from "@/lib/kodland-course-groups";
const defaultCourseChoices: Array<CourseImportOption & {
  description: string;
}> = [
  { id: "roblox", name: "Roblox", description: "Curso oficial", available: true },
  { id: "scratch", name: "Scratch", description: "Curso oficial", available: true },
  {
    id: "python",
    name: "Python",
    description: "Disponível ao configurar o ID oficial do curso",
    available: false,
  },
];

function LessonsContent() {
  const [courseGroups, setCourseGroups] = useState<KodlandGroup[]>([]),
    [courseLessons, setCourseLessons] = useState<KodlandLesson[]>([]),
    [courseChoices, setCourseChoices] = useState(defaultCourseChoices),
    [importedCourses, setImportedCourses] = useState<ImportedCourse[]>([]),
    [importedLessons, setImportedLessons] = useState<ImportedCourseLesson[]>([]),
    [importOpen, setImportOpen] = useState(false),
    [selectedCourse, setSelectedCourse] = useState<CourseImportInput["courseId"]>("roblox"),
    [importUsername, setImportUsername] = useState(""),
    [importPassword, setImportPassword] = useState(""),
    [importing, setImporting] = useState(false),
    [importNotice, setImportNotice] = useState(""),
    [selectedMaterial, setSelectedMaterial] = useState<LessonMaterialDetails | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(
    async () => {
      setLoading(true);
      setError("");
      try {
        const [groups, syncedLessons, courses, imported, catalog] = await Promise.all([
          kodlandApi.groups(),
          kodlandApi.lessons(),
          courseImportApi.courses(),
          courseImportApi.lessons(),
          courseImportApi.catalog().catch(() => null),
        ]);
        setCourseGroups(groups.items.filter((group) => !group.archived));
        setCourseLessons(syncedLessons.items);
        setImportedCourses(courses.items);
        setImportedLessons(imported.items);
        if (catalog) {
          setCourseChoices(catalog.map((course) => ({
            ...course,
            description: course.available
              ? "Curso oficial"
              : "Configure o ID oficial deste curso no servidor",
          })));
        }
      } catch (reason) {
        setError(
          reason instanceof Error
            ? reason.message
            : "Não foi possível carregar as aulas.",
        );
      } finally {
        setLoading(false);
      }
    },
    [],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  function openImport() {
    setError("");
    setImportNotice("");
    setImportUsername("");
    setImportPassword("");
    setSelectedCourse("roblox");
    setImportOpen(true);
  }
  function closeImport() {
    if (importing) return;
    setImportOpen(false);
    // Never retain credentials after the dialog is closed.
    setImportUsername("");
    setImportPassword("");
    setError("");
  }
  async function importCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const choice = courseChoices.find((course) => course.id === selectedCourse);
    if (!choice?.available) {
      setError("Este curso ainda precisa ter o ID oficial configurado.");
      return;
    }
    if (!importUsername.trim() || !importPassword) {
      setError("Informe suas credenciais temporárias para importar o curso.");
      return;
    }
    setError("");
    setImportNotice("");
    setImporting(true);
    try {
      const result = await courseImportApi.import({
        courseId: selectedCourse,
        username: importUsername.trim(),
        password: importPassword,
      });
      setImportNotice(`${result.course.name}: ${result.lessons.length} aulas importadas.`);
      setImportUsername("");
      setImportPassword("");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível importar o curso.");
    } finally {
      // Password is deliberately cleared whether the provider accepted it or not.
      setImportPassword("");
      setImporting(false);
    }
  }
  const courseCatalog = useMemo(
    () => groupKodlandLessonsByCourse(courseGroups, courseLessons),
    [courseGroups, courseLessons],
  );
  return (
    <div className="management-grid">
      {error && !importOpen && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Modal open={importOpen} title="Importar curso" onClose={closeImport}>
        <p className="muted">Escolha um curso oficial. As credenciais são usadas apenas nesta importação e não são salvas.</p>
        {error && <p className="form-error" role="alert">{error}</p>}
        {importNotice && <p className="notice" role="status">{importNotice}</p>}
        <form className="form management-form" onSubmit={importCourse}>
          <fieldset className="course-import-options" disabled={importing}>
            <legend>Curso</legend>
            {courseChoices.map((course) => (
              <label className="course-import-option" key={course.id}>
                <input
                  type="radio"
                  name="course"
                  value={course.id}
                  checked={selectedCourse === course.id}
                  disabled={!course.available}
                  onChange={() => setSelectedCourse(course.id)}
                />
                <span><strong>{course.name}</strong><small>{course.description}</small></span>
              </label>
            ))}
          </fieldset>
          <label className="field">
            Usuário ou e-mail da plataforma
            <Input autoComplete="username" value={importUsername} onChange={(event) => setImportUsername(event.target.value)} required disabled={importing} />
          </label>
          <label className="field">
            Senha temporária
            <Input type="password" autoComplete="current-password" value={importPassword} onChange={(event) => setImportPassword(event.target.value)} required disabled={importing} />
          </label>
          <p className="muted">Por segurança, não é possível informar uma URL livre. Outros cursos precisam ser cadastrados com um ID oficial permitido.</p>
          <div className="form-actions"><Button type="submit" disabled={importing}>{importing ? "Importando…" : "Importar curso"}</Button></div>
        </form>
      </Modal>
      <LessonMaterialModal
        open={Boolean(selectedMaterial)}
        title={selectedMaterial ? `${selectedMaterial.source} · ${selectedMaterial.location}` : "Materiais da aula"}
        lesson={selectedMaterial}
        onClose={() => setSelectedMaterial(null)}
        onMaterialsLoaded={(updated) => {
          setCourseLessons((items) => items.map((item) => item.id === updated.id ? updated : item));
        }}
      />
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Cursos</h2>
          </div>
          <Button type="button" data-tour="lessons-import" onClick={openImport}>Importar curso</Button>
        </div>
        {loading ? (
          <p className="muted">Carregando cursos…</p>
        ) : courseGroups.length === 0 ? (
          <p className="muted">Nenhuma turma ativa foi sincronizada.</p>
        ) : (
          <div className="course-list" data-tour="lessons-courses">
            {courseCatalog.map((course) => {
              const groupNames = course.groups.map((group) => group.title || group.external_id);
              return (
                <details className="course-card" key={course.id}>
                  <summary>
                    <span><strong>{course.name}</strong><small>{course.groups.length} turma{course.groups.length === 1 ? "" : "s"}: {groupNames.join(", ")}</small></span>
                    <b>{course.lessons.length} aula{course.lessons.length === 1 ? "" : "s"}</b>
                  </summary>
                  <div className="course-lessons">
                    {course.lessons.length ? groupLessonsByModule(course.lessons).map((module) => (
                      <section className="course-module" key={module.id}>
                        <div className="course-module-heading">
                          <h3>{module.label}</h3>
                          <span>{module.lessons.length} aula{module.lessons.length === 1 ? "" : "s"}</span>
                        </div>
                        <div className="course-module-lessons">
                          {module.lessons.map((lesson) => (
                            <button className="course-lesson course-lesson-action" type="button" key={lesson.id} onClick={() => setSelectedMaterial({
                              ...lesson,
                              classroom_tasks: lesson.classroom_tasks ?? [],
                              location: kodlandLessonLocation(lesson),
                              source: course.name,
                              note_key: `kodland:${lesson.external_class_id}:${lesson.id}`,
                            })}>
                              <div>
                                <strong>Aula {(module.number ? lesson.lesson_number : lesson.course_index ?? lesson.lesson_number) || "—"}: {lesson.title || lesson.theme || "Aula"}</strong>
                                <span>{lesson.lesson_date ? formatDate(lesson.lesson_date) : "Data a confirmar"}</span>
                              </div>
                              <span className="course-lesson-hint">
                                {lesson.materials_status === "pending" || lesson.materials_status === "error"
                                  ? "Carregar materiais" : "Ver materiais"}
                              </span>
                            </button>
                          ))}
                        </div>
                      </section>
                    )) : <p className="muted">Ainda não há aulas desta turma no último snapshot.</p>}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
      {importedCourses.length > 0 && (
        <section className="panel">
          <div className="section-heading">
            <div><h2>Cursos importados</h2><p className="muted">Materiais importados sob demanda para sua conta.</p></div>
            <Button type="button" onClick={openImport}>Importar outro curso</Button>
          </div>
          <div className="course-list">
            {importedCourses.map((course) => {
              const lessonsForCourse = importedLessons
                .filter((lesson) => lesson.course_id === course.id)
                .sort((a, b) => a.lesson_number - b.lesson_number || a.title.localeCompare(b.title));
              return <details className="course-card" key={course.id}>
                <summary><span><strong>{course.name}</strong><small>Atualizado em {course.updated_at ? formatDate(course.updated_at) : "data não informada"}</small></span><b>{lessonsForCourse.length} aula{lessonsForCourse.length === 1 ? "" : "s"}</b></summary>
                <div className="course-lessons">
                  {groupLessonsByModule(lessonsForCourse).map((module) => (
                    <section className="course-module" key={module.id}>
                      <div className="course-module-heading">
                        <h3>{module.label}</h3>
                        <span>{module.lessons.length} aula{module.lessons.length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="course-module-lessons">
                        {module.lessons.map((lesson) => <button className="course-lesson course-lesson-action" type="button" key={lesson.id} onClick={() => setSelectedMaterial({
                          ...lesson,
                          classroom_tasks: lesson.classroom_tasks ?? [],
                          location: kodlandLessonLocation(lesson),
                          source: course.name,
                          note_key: `course:${course.id}:${lesson.source_lesson_id}`,
                        })}>
                          <div><strong>Aula {lesson.lesson_number || "—"}: {lesson.title}</strong></div>
                          <span className="course-lesson-hint">Ver materiais</span>
                        </button>)}
                      </div>
                    </section>
                  ))}
                </div>
              </details>;
            })}
          </div>
        </section>
      )}
    </div>
  );
}
export default function LessonsPage() {
  return (
    <AuthGuard>
      {(user) => (
        <Shell user={user}>
          <LessonsContent />
        </Shell>
      )}
    </AuthGuard>
  );
}
