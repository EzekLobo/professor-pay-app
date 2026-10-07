"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import {
  ApiError,
  classesApi,
  kodlandApi,
  type ClassPayload,
  type ClassRecord,
  type KodlandGroup,
  type KodlandLesson,
  type KodlandReview,
  type KodlandStudent,
} from "@/lib/api";
import {
  brlToCents,
  centsToBrlInput,
  formatDate,
  formatMoney,
} from "@/lib/finance";
import { whatsappUrl } from "@/lib/whatsapp";

const weekDays = [
  "Segunda-feira",
  "Terça-feira",
  "Quarta-feira",
  "Quinta-feira",
  "Sexta-feira",
  "Sábado",
  "Domingo",
];

type FormState = {
  name: string;
  week_day: string;
  start_time: string;
  first_lesson_date: string;
  lesson_count: string;
  duration_minutes: string;
  hourly_rate: string;
};

const emptyForm: FormState = {
  name: "",
  week_day: "0",
  start_time: "08:00",
  first_lesson_date: "",
  lesson_count: "1",
  duration_minutes: "60",
  hourly_rate: "30,00",
};

const toForm = (item: ClassRecord): FormState => ({
  name: item.name,
  week_day: String(item.week_day),
  start_time: item.start_time.slice(0, 5),
  first_lesson_date: item.first_lesson_date,
  lesson_count: String(item.lesson_count),
  duration_minutes: String(item.duration_minutes),
  hourly_rate: centsToBrlInput(item.hourly_rate_cents),
});

const classInfo = (group: KodlandGroup) => {
  const parts =
    group.course_name
      .match(/\[([^\]]+)\]/g)
      ?.map((value) => value.slice(1, -1)) ?? [];
  const rawCourse = group.course_name.trim();
  const courseName =
    rawCourse &&
    !["none", "null", "undefined"].includes(rawCourse.toLowerCase())
      ? rawCourse
      : "";
  const parsedCourse = parts[1]?.trim();
  const readableCourse = rawCourse.replace(/\[[^\]]+\]/g, "").trim();
  return {
    course:
      readableCourse ||
      (parsedCourse &&
      !["none", "null", "undefined"].includes(parsedCourse.toLowerCase())
        ? parsedCourse
        : courseName) ||
      "Curso não informado",
    duration:
      parts.find((value) => /min/i.test(value)) ?? "Duração não informada",
    lessons:
      parts.find((value) => /\bL\b/i.test(value)) ?? "Plano não informado",
    region: parts.find((value) => /brazil|brasil/i.test(value)) ?? "",
  };
};

const dateTime = (value: string) => {
  if (!value) return "Agenda não informada";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "full",
        timeStyle: "short",
      }).format(date);
};

const dateValue = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? Number.MAX_SAFE_INTEGER
    : date.getTime();
};

const absoluteUrl = (value: string) =>
  value.startsWith("/") ? `https://bo.kodland.org${value}` : value;

const lessonLinks = (lesson: KodlandLesson | undefined) =>
  lesson
    ? [
        ["Slides", lesson.slides_url],
        ["Roteiro", lesson.guide_url],
        ["Atividade", lesson.homework_url],
      ].filter((item): item is [string, string] => Boolean(item[1]))
    : [];

function LessonMaterials({
  lesson,
  label,
  onFinancialStatusChange,
}: {
  lesson: KodlandLesson;
  label: string;
  onFinancialStatusChange: (lesson: KodlandLesson, status: string) => void;
}) {
  const links = lessonLinks(lesson);
  return (
    <div className="lesson-material-card">
      <div>
        <strong>
          {label}: {lesson.title || "Aula"}
        </strong>
        <span>
          {lesson.lesson_date
            ? dateTime(lesson.lesson_date)
            : "Data não informada"}
          {lesson.homework_title
            ? ` · Atividade: ${lesson.homework_title}`
            : ""}
        </span>
      </div>
      <div className="card-actions">
        {links.map(([linkLabel, href]) => (
          <a
            className="button button-ghost button-small"
            href={absoluteUrl(href)}
            target="_blank"
            rel="noreferrer"
            key={linkLabel}
          >
            {linkLabel}
          </a>
        ))}
        {!links.length && lesson.external_url && (
          <a
            className="button button-ghost button-small"
            href={absoluteUrl(lesson.external_url)}
            target="_blank"
            rel="noreferrer"
          >
            Abrir aula
          </a>
        )}
        <select
          className="input button-small"
          aria-label={`Status financeiro de ${lesson.title || "aula"}`}
          value={lesson.financial_status ?? ""}
          onChange={(event) =>
            onFinancialStatusChange(lesson, event.target.value)
          }
        >
          <option value="">Contabilizar</option>
          <option value="SUBSTITUTION">Substituição</option>
          <option value="HOLIDAY">Feriado</option>
          <option value="CANCELED">Cancelada</option>
        </select>
      </div>
    </div>
  );
}

function GroupAccordion({
  group,
  students,
  lessons,
  reviews,
  openByDefault,
  onFinancialStatusChange,
}: {
  group: KodlandGroup;
  students: KodlandStudent[];
  lessons: KodlandLesson[];
  reviews: KodlandReview[];
  openByDefault: boolean;
  onFinancialStatusChange: (lesson: KodlandLesson, status: string) => void;
}) {
  const info = classInfo(group);
  const orderedLessons = [...lessons].sort(
    (a, b) => dateValue(a.lesson_date) - dateValue(b.lesson_date),
  );
  const nextLesson =
    orderedLessons.find((lesson) => !lesson.lesson_passed) ??
    orderedLessons[orderedLessons.length - 1];
  const previousLesson = [...orderedLessons]
    .reverse()
    .find((lesson) => lesson.lesson_passed);
  const pendingReviews = reviews.filter(
    (review) => review.external_class_id === group.external_id,
  ).length;

  return (
    <details className="group-accordion" open={openByDefault}>
      <summary className="group-accordion-summary">
        <span>
          <strong>{group.title}</strong>
          <small>{info.course}</small>
        </span>
        <span className="group-summary-meta">
          <StatusBadge tone={group.archived ? "neutral" : "success"}>
            {group.archived ? "Arquivada" : "Ativa"}
          </StatusBadge>
          <span>
            {students.length || group.student_count} aluno
            {(students.length || group.student_count) === 1 ? "" : "s"}
          </span>
        </span>
      </summary>
      <div className="group-accordion-body">
        <div className="group-facts">
          <StatusBadge>{info.duration}</StatusBadge>
          <StatusBadge>{info.lessons}</StatusBadge>
          {info.region && <StatusBadge>{info.region}</StatusBadge>}
          <span>
            Próxima aula: <strong>{dateTime(group.next_lesson_date)}</strong>
          </span>
          {pendingReviews > 0 && (
            <span>
              {pendingReviews} correção{pendingReviews === 1 ? "" : "ões"}{" "}
              pendente{pendingReviews === 1 ? "" : "s"}
            </span>
          )}
        </div>

        {(nextLesson || previousLesson) && (
          <div className="lesson-materials">
            {nextLesson && (
              <LessonMaterials
                lesson={nextLesson}
                label="Próxima aula"
                onFinancialStatusChange={onFinancialStatusChange}
              />
            )}
            {previousLesson &&
              (!nextLesson || previousLesson.id !== nextLesson.id) && (
                <LessonMaterials
                  lesson={previousLesson}
                  label="Aula anterior"
                  onFinancialStatusChange={onFinancialStatusChange}
                />
              )}
          </div>
        )}

        <div className="student-list-heading">
          <h3>Alunos</h3>
          <span className="muted">
            {students.length} cadastrado{students.length === 1 ? "" : "s"}
          </span>
        </div>
        {students.length === 0 ? (
          <p className="muted">Nenhum aluno sincronizado nesta turma.</p>
        ) : (
          <div className="student-list">
            {students.map((student) => {
              const contact = student.guardian_phone || student.phone;
              const contactLabel = student.guardian_phone
                ? "WhatsApp responsável"
                : "WhatsApp aluno";
              const contactHref = whatsappUrl(
                contact,
                `Olá! Sou o professor de ${student.name}.`,
              );
              return (
                <article className="student-row" key={student.id}>
                  <div>
                    <strong>{student.name}</strong>
                    <span>
                      {student.status || "Status não informado"}
                      {student.progress_summary
                        ? ` · Progresso ${student.progress_summary}`
                        : ""}
                    </span>
                    {student.guardian_name && (
                      <span>
                        Responsável: {student.guardian_name}
                        {student.guardian_relationship
                          ? ` (${student.guardian_relationship})`
                          : ""}
                        {student.guardian_phone
                          ? ` · ${student.guardian_phone}`
                          : ""}
                      </span>
                    )}
                    {student.guardian_email && (
                      <span>{student.guardian_email}</span>
                    )}
                  </div>
                  <div className="card-actions">
                    {contactHref && (
                      <a
                        className="button button-ghost button-small"
                        href={contactHref}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {contactLabel}
                      </a>
                    )}
                    {student.profile_url && (
                      <a
                        className="button button-ghost button-small"
                        href={absoluteUrl(student.profile_url)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Perfil
                      </a>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

function ClassesContent() {
  const [items, setItems] = useState<ClassRecord[]>([]);
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [lessons, setLessons] = useState<KodlandLesson[]>([]);
  const [reviews, setReviews] = useState<KodlandReview[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<ClassRecord | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [
        financial,
        groupResult,
        studentResult,
        lessonResult,
        reviewResult,
      ] = await Promise.all([
        classesApi.list(),
        kodlandApi.groups(),
        kodlandApi.students(),
        kodlandApi.lessons(),
        kodlandApi.reviews(),
      ]);
      setItems(financial.items);
      setGroups(groupResult.items);
      setStudents(studentResult.items);
      setLessons(lessonResult.items);
      setReviews(reviewResult.items);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar as turmas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function syncClasses(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password || syncing) return;
    setSyncing(true);
    setError("");
    try {
      const result = await kodlandApi.sync(username.trim(), password);
      setUsername("");
      setPassword("");
      setSyncOpen(false);
      setNotice(
        `${result.extra_lesson_count ?? 0} aula(s) extra encontrada(s) na agenda da Kodland. Apenas as concluídas entram em Pagamentos.`,
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Não foi possível sincronizar os dados.",
      );
    } finally {
      setSyncing(false);
    }
  }

  async function updateLessonFinancialStatus(
    lesson: KodlandLesson,
    status: string,
  ) {
    try {
      setError("");
      await kodlandApi.updateLessonFinancialStatus(lesson.id, status);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar o status da aula.",
      );
    }
  }

  function update(field: keyof FormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    const hourly_rate_cents = brlToCents(form.hourly_rate);
    const lesson_count = Number(form.lesson_count);
    const duration_minutes = Number(form.duration_minutes);
    if (
      !form.name.trim() ||
      !form.first_lesson_date ||
      hourly_rate_cents === null ||
      !Number.isInteger(lesson_count) ||
      lesson_count < 1 ||
      !Number.isInteger(duration_minutes) ||
      duration_minutes < 1
    ) {
      setError("Preencha os campos obrigatórios com valores válidos.");
      return;
    }
    const payload: ClassPayload = {
      name: form.name.trim(),
      week_day: Number(form.week_day),
      start_time: form.start_time,
      first_lesson_date: form.first_lesson_date,
      lesson_count,
      duration_minutes,
      hourly_rate_cents,
    };
    setSaving(true);
    try {
      if (editing) await classesApi.update(editing.id, payload);
      else await classesApi.create(payload);
      setEditing(null);
      setForm(emptyForm);
      setFormOpen(false);
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.message
          : "Não foi possível salvar a turma.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function deactivate(item: ClassRecord) {
    if (
      !window.confirm(
        `Desativar ${item.name}? Aulas ainda não recebidas serão canceladas.`,
      )
    )
      return;
    setError("");
    try {
      await classesApi.deactivate(item.id);
      await load();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível desativar a turma.",
      );
    }
  }

  function beginEdit(item: ClassRecord) {
    setEditing(item);
    setForm(toForm(item));
    setError("");
    setFormOpen(true);
  }

  function beginCreate() {
    setEditing(null);
    setForm(emptyForm);
    setError("");
    setFormOpen(true);
  }

  function closeForm() {
    if (saving) return;
    setFormOpen(false);
    setEditing(null);
    setForm(emptyForm);
    setError("");
  }

  return (
    <div className="management-grid">
      <Modal
        open={syncOpen}
        title="Sincronizar turmas e alunos"
        onClose={() => !syncing && setSyncOpen(false)}
      >
        <form className="form management-form" onSubmit={syncClasses}>
          <p className="muted">
            O acesso é usado somente durante a leitura dos dados e não é salvo
            neste navegador.
          </p>
          <label className="field">
            Usuário ou e-mail
            <Input
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label className="field">
            Senha
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button type="submit" disabled={syncing}>
              {syncing ? "Sincronizando…" : "Sincronizar"}
            </Button>
          </div>
        </form>
      </Modal>

      {error && !formOpen && !syncOpen && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <Modal
        open={formOpen}
        title={editing ? `Editar ${editing.name}` : "Nova turma"}
        onClose={closeForm}
      >
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <form className="form management-form" onSubmit={submit}>
          <label className="field">
            Nome da turma
            <Input
              value={form.name}
              onChange={(event) => update("name", event.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className="field">
            Dia da semana
            <select
              className="input"
              value={form.week_day}
              onChange={(event) => update("week_day", event.target.value)}
            >
              {weekDays.map((day, index) => (
                <option value={index} key={day}>
                  {day}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Horário
            <Input
              type="time"
              value={form.start_time}
              onChange={(event) => update("start_time", event.target.value)}
              required
            />
          </label>
          <label className="field">
            Primeira aula
            <Input
              type="date"
              value={form.first_lesson_date}
              onChange={(event) =>
                update("first_lesson_date", event.target.value)
              }
              required
            />
          </label>
          <label className="field">
            Quantidade de aulas
            <Input
              type="number"
              min="1"
              value={form.lesson_count}
              onChange={(event) => update("lesson_count", event.target.value)}
              required
            />
          </label>
          <label className="field">
            Duração (minutos)
            <Input
              type="number"
              min="1"
              value={form.duration_minutes}
              onChange={(event) =>
                update("duration_minutes", event.target.value)
              }
              required
            />
          </label>
          <label className="field">
            Valor por hora (R$)
            <Input
              inputMode="decimal"
              value={form.hourly_rate}
              onChange={(event) => update("hourly_rate", event.target.value)}
              required
            />
            <small>Use vírgula para centavos.</small>
          </label>
          <div className="form-actions">
            <Button type="submit" disabled={saving}>
              {saving
                ? "Salvando…"
                : editing
                  ? "Salvar alterações"
                  : "Criar turma"}
            </Button>
            {editing && (
              <button
                className="button button-ghost"
                type="button"
                onClick={closeForm}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </Modal>

      <section className="panel pedagogical-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Acompanhamento pedagógico</p>
            <h2>Turmas e alunos</h2>
            <p className="muted">
              Abra uma turma para ver alunos, responsáveis, agenda e materiais.
            </p>
          </div>
          <Button type="button" onClick={() => setSyncOpen(true)}>
            Sincronizar dados
          </Button>
        </div>
        {loading ? (
          <p className="muted">Carregando turmas…</p>
        ) : groups.length === 0 ? (
          <p className="muted">
            Nenhuma turma sincronizada. Use “Sincronizar dados” para importar
            suas turmas.
          </p>
        ) : (
          <div className="accordion-list">
            {groups.map((group) => (
              <GroupAccordion
                key={group.id}
                group={group}
                students={students.filter(
                  (student) => student.external_class_id === group.external_id,
                )}
                lessons={lessons.filter(
                  (lesson) => lesson.external_class_id === group.external_id,
                )}
                reviews={reviews}
                openByDefault={false}
                onFinancialStatusChange={(lesson, status) =>
                  void updateLessonFinancialStatus(lesson, status)
                }
              />
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Controle financeiro</p>
            <h2>Turmas cadastradas</h2>
          </div>
          <div className="form-actions">
            <span className="muted">
              {items.length} cadastrada{items.length === 1 ? "" : "s"}
            </span>
            <Button type="button" onClick={beginCreate}>
              Nova turma
            </Button>
          </div>
        </div>
        {loading ? (
          <p className="muted">Carregando turmas…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            Nenhuma turma ativa. Use “Nova turma” para cadastrar a primeira.
          </p>
        ) : (
          <div className="entity-list">
            {items.map((item) => (
              <article className="entity-card" key={item.id}>
                <div>
                  <div className="entity-title">
                    <h3>{item.name}</h3>
                    <StatusBadge tone="success">Ativa</StatusBadge>
                  </div>
                  <p className="muted">
                    {weekDays[item.week_day]} às {item.start_time.slice(0, 5)} ·
                    início em {formatDate(item.first_lesson_date)}
                  </p>
                  <p className="entity-details">
                    {item.lesson_count} aulas · {item.duration_minutes} min ·{" "}
                    {formatMoney(item.hourly_rate_cents)}/hora
                  </p>
                </div>
                <div className="card-actions">
                  <button
                    className="button button-ghost"
                    onClick={() => beginEdit(item)}
                  >
                    Editar
                  </button>
                  <button
                    className="button button-danger"
                    onClick={() => void deactivate(item)}
                  >
                    Desativar
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

export default function ClassesPage() {
  return (
    <AuthGuard>
      {(user) => (
        <Shell user={user}>
          <ClassesContent />
        </Shell>
      )}
    </AuthGuard>
  );
}
