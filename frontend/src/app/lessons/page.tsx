"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Modal } from "@/components/modal";
import {
  LessonMaterialModal,
  type LessonMaterialDetails,
} from "@/components/lesson-material-modal";
import { Button, Input, StatusBadge } from "@/components/ui";
import {
  ApiError,
  courseImportApi,
  lessonsApi,
  kodlandApi,
  type CourseImportInput,
  type ExtraLessonPayload,
  type ImportedCourse,
  type ImportedCourseLesson,
  type KodlandGroup,
  type KodlandLesson,
  type Lesson,
  type LessonFilters,
} from "@/lib/api";
import { brlToCents, formatDate, formatMoney } from "@/lib/finance";
type ExtraForm = {
  student: string;
  lesson_date: string;
  duration_minutes: string;
  hourly_rate: string;
  note: string;
};
const emptyForm: ExtraForm = {
  student: "",
  lesson_date: "",
  duration_minutes: "60",
  hourly_rate: "30,00",
  note: "",
};
const labels: Record<string, string> = {
  COMPLETED: "Realizada",
  FUTURE: "Futura",
  CANCELED: "Cancelada",
};
const tone = (status: string) =>
  status === "CANCELED"
    ? ("danger" as const)
    : status === "FUTURE"
      ? ("warning" as const)
      : ("success" as const);

const courseChoices: Array<{
  id: CourseImportInput["courseId"];
  name: string;
  description: string;
  available: boolean;
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

const lessonLocation = (lesson: {
  title: string;
  module_number?: string;
  lesson_number: number;
}) => {
  const match = lesson.title.match(/[M\u041c]\s*(\d+)\s*\.?\s*L\s*(\d+)/i);
  if (match) return `M${match[1]}L${match[2]}`;
  const moduleValue = lesson.module_number?.match(/\d+/)?.[0];
  return moduleValue ? `M${moduleValue}L${lesson.lesson_number}` : `Aula ${lesson.lesson_number}`;
};

function LessonsContent() {
  const [lessons, setLessons] = useState<Lesson[]>([]),
    [courseGroups, setCourseGroups] = useState<KodlandGroup[]>([]),
    [courseLessons, setCourseLessons] = useState<KodlandLesson[]>([]),
    [importedCourses, setImportedCourses] = useState<ImportedCourse[]>([]),
    [importedLessons, setImportedLessons] = useState<ImportedCourseLesson[]>([]),
    [filters, setFilters] = useState<LessonFilters>({ page: 1, page_size: 50 }),
    [form, setForm] = useState<ExtraForm>(emptyForm),
    [formOpen, setFormOpen] = useState(false),
    [importOpen, setImportOpen] = useState(false),
    [selectedCourse, setSelectedCourse] = useState<CourseImportInput["courseId"]>("roblox"),
    [importUsername, setImportUsername] = useState(""),
    [importPassword, setImportPassword] = useState(""),
    [importing, setImporting] = useState(false),
    [importNotice, setImportNotice] = useState(""),
    [selectedMaterial, setSelectedMaterial] = useState<LessonMaterialDetails | null>(null),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    async (next = filters) => {
      setLoading(true);
      setError("");
      try {
        const [history, groups, syncedLessons, courses, imported] = await Promise.all([
          lessonsApi.list(next),
          kodlandApi.groups(),
          kodlandApi.lessons(),
          courseImportApi.courses(),
          courseImportApi.lessons(),
        ]);
        setLessons(history.items);
        setCourseGroups(groups.items.filter((group) => !group.archived));
        setCourseLessons(syncedLessons.items);
        setImportedCourses(courses.items);
        setImportedLessons(imported.items);
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
    [filters],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  function setFilter(field: keyof LessonFilters, value: string) {
    const next = { ...filters, [field]: value || undefined, page: 1 };
    setFilters(next);
    void load(next);
  }
  async function createExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const hourly_rate_cents = brlToCents(form.hourly_rate),
      duration_minutes = Number(form.duration_minutes);
    if (
      !form.student.trim() ||
      !form.lesson_date ||
      hourly_rate_cents === null ||
      !Number.isInteger(duration_minutes) ||
      duration_minutes < 1
    ) {
      setError("Preencha os dados da aula extra com valores válidos.");
      return;
    }
    const payload: ExtraLessonPayload = {
      student: form.student.trim(),
      lesson_date: form.lesson_date,
      duration_minutes,
      hourly_rate_cents,
      note: form.note.trim(),
    };
    setSaving(true);
    try {
      await lessonsApi.createExtra(payload);
      setForm(emptyForm);
      setFormOpen(false);
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Não foi possível criar a aula extra.",
      );
    } finally {
      setSaving(false);
    }
  }
  async function cancel(item: Lesson) {
    if (!window.confirm(`Cancelar a aula de ${item.student}?`)) return;
    setError("");
    try {
      await lessonsApi.cancel(item.id);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível cancelar a aula.",
      );
    }
  }
  function openForm() {
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }
  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setForm(emptyForm);
    setError("");
  }
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
  return (
    <div className="management-grid">
      {error && !formOpen && !importOpen && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <Modal open={formOpen} title="Nova aula extra" onClose={closeForm}>
        {error && <p className="form-error" role="alert">{error}</p>}
        <form className="form management-form" onSubmit={createExtra}>
          <label className="field">
            Aluno(s)
            <Input
              value={form.student}
              onChange={(e) => setForm({ ...form, student: e.target.value })}
              required
            />
          </label>
          <label className="field">
            Data
            <Input
              type="date"
              value={form.lesson_date}
              onChange={(e) =>
                setForm({ ...form, lesson_date: e.target.value })
              }
              required
            />
          </label>
          <label className="field">
            Duração (minutos)
            <Input
              type="number"
              min="1"
              value={form.duration_minutes}
              onChange={(e) =>
                setForm({ ...form, duration_minutes: e.target.value })
              }
              required
            />
          </label>
          <label className="field">
            Valor por hora (R$)
            <Input
              inputMode="decimal"
              value={form.hourly_rate}
              onChange={(e) =>
                setForm({ ...form, hourly_rate: e.target.value })
              }
              required
            />
          </label>
          <label className="field field-wide">
            Observação (opcional)
            <Input
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={saving}>
              {saving ? "Salvando…" : "Registrar aula extra"}
            </Button>
          </div>
        </form>
      </Modal>
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
      />
      <section className="panel">
        <div className="section-heading">
          <div>
            <h2>Aulas por curso</h2>
            <p className="muted">Materiais das aulas sincronizadas para cada turma.</p>
          </div>
          <Button type="button" onClick={openImport}>Importar curso</Button>
        </div>
        {loading ? (
          <p className="muted">Carregando cursos…</p>
        ) : courseGroups.length === 0 ? (
          <p className="muted">Nenhuma turma ativa foi sincronizada.</p>
        ) : (
          <div className="course-list">
            {courseGroups.map((group) => {
              const groupedLessons = courseLessons
                .filter((lesson) => lesson.external_class_id === group.external_id)
                .sort((a, b) => a.lesson_number - b.lesson_number || a.lesson_date.localeCompare(b.lesson_date));
              return (
                <details className="course-card" key={group.id}>
                  <summary>
                    <span><strong>{group.course_name || "Curso"}</strong><small>{group.title}</small></span>
                    <b>{groupedLessons.length} aula{groupedLessons.length === 1 ? "" : "s"}</b>
                  </summary>
                  <div className="course-lessons">
                    {groupedLessons.length ? groupedLessons.map((lesson) => (
                      <button className="course-lesson course-lesson-action" type="button" key={lesson.id} onClick={() => setSelectedMaterial({
                        ...lesson,
                        classroom_tasks: lesson.classroom_tasks ?? [],
                        location: lessonLocation(lesson),
                        source: group.title,
                      })}>
                        <div>
                          <strong>Aula {lesson.lesson_number || "—"}: {lesson.title || lesson.theme || "Aula"}</strong>
                          <span>{lesson.lesson_date ? formatDate(lesson.lesson_date) : "Data a confirmar"}</span>
                        </div>
                        <span className="course-lesson-hint">Ver materiais</span>
                      </button>
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
                  {lessonsForCourse.map((lesson) => <button className="course-lesson course-lesson-action" type="button" key={lesson.id} onClick={() => setSelectedMaterial({
                    ...lesson,
                    classroom_tasks: lesson.classroom_tasks ?? [],
                    location: lessonLocation(lesson),
                    source: course.name,
                  })}>
                    <div><strong>{lesson.module_number ? `Módulo ${lesson.module_number} · ` : ""}Aula {lesson.lesson_number}: {lesson.title}</strong></div>
                    <span className="course-lesson-hint">Ver materiais</span>
                  </button>)}
                </div>
              </details>;
            })}
          </div>
        </section>
      )}
      <section className="panel">
        <div className="section-heading">
          <h2>Histórico de aulas</h2>
          <div className="form-actions">
            <span className="muted">{lessons.length} exibida{lessons.length === 1 ? "" : "s"}</span>
            <Button type="button" onClick={openForm}>Nova aula extra</Button>
          </div>
        </div>
        <div className="filters">
          <label className="field">
            Tipo
            <select
              className="input"
              value={filters.type ?? ""}
              onChange={(e) => setFilter("type", e.target.value)}
            >
              <option value="">Todas</option>
              <option value="NORMAL">Turmas</option>
              <option value="EXTRA">Extras</option>
            </select>
          </label>
          <label className="field">
            Status
            <select
              className="input"
              value={filters.status ?? ""}
              onChange={(e) => setFilter("status", e.target.value)}
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Ativas</option>
              <option value="COMPLETED">Realizadas</option>
              <option value="FUTURE">Futuras</option>
              <option value="CANCELED">Canceladas</option>
            </select>
          </label>
          <label className="field">
            De
            <Input
              type="date"
              value={filters.from ?? ""}
              onChange={(e) => setFilter("from", e.target.value)}
            />
          </label>
          <label className="field">
            Até
            <Input
              type="date"
              value={filters.to ?? ""}
              onChange={(e) => setFilter("to", e.target.value)}
            />
          </label>
        </div>
        {loading ? (
          <p className="muted">Carregando aulas…</p>
        ) : lessons.length === 0 ? (
          <p className="muted">Nenhuma aula encontrada com esses filtros.</p>
        ) : (
          <div className="entity-list">
            {lessons.map((item) => (
              <article className="entity-card" key={item.id}>
                <div>
                  <div className="entity-title">
                    <h3>{item.student}</h3>
                    <StatusBadge tone={tone(item.status)}>
                      {labels[item.status] ?? item.status}
                    </StatusBadge>
                  </div>
                  <p className="muted">
                    {item.type === "EXTRA"
                      ? "Aula extra"
                      : item.class_name_snapshot}{" "}
                    · {formatDate(item.lesson_date)}
                  </p>
                  <p className="entity-details">
                    {item.duration_minutes} min ·{" "}
                    {formatMoney(item.value_cents)} · pagamento em{" "}
                    {formatDate(item.payment_date)}
                  </p>
                  {item.note && <p className="muted">{item.note}</p>}
                </div>
                {!item.canceled && (
                  <button
                    className="button button-danger"
                    onClick={() => void cancel(item)}
                  >
                    Cancelar aula
                  </button>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
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
