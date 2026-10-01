"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import {
  ApiError,
  classesApi,
  kodlandApi,
  type ClassPayload,
  type ClassRecord,
  type KodlandGroup,
} from "@/lib/api";
import {
  brlToCents,
  centsToBrlInput,
  formatDate,
  formatMoney,
} from "@/lib/finance";
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
function ClassesContent() {
  const [items, setItems] = useState<ClassRecord[]>([]);
  const [kodlandGroups, setKodlandGroups] = useState<KodlandGroup[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<ClassRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [financial, kodland] = await Promise.all([classesApi.list(), kodlandApi.groups()]);
      setItems(financial.items);
      setKodlandGroups(kodland.items);
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
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
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
    document
      .getElementById("class-form")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  return (
    <div className="management-grid">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Organização</p>
          <h1>Turmas</h1>
          <p className="muted">
            Cadastre turmas e mantenha o planejamento de aulas atualizado.
          </p>
        </div>
      </section>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <section className="panel" id="class-form">
        <h2>{editing ? `Editar ${editing.name}` : "Nova turma"}</h2>
        <form className="form management-form" onSubmit={submit}>
          <label className="field">
            Nome da turma
            <Input
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              required
              maxLength={160}
            />
          </label>
          <label className="field">
            Dia da semana
            <select
              className="input"
              value={form.week_day}
              onChange={(e) => update("week_day", e.target.value)}
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
              onChange={(e) => update("start_time", e.target.value)}
              required
            />
          </label>
          <label className="field">
            Primeira aula
            <Input
              type="date"
              value={form.first_lesson_date}
              onChange={(e) => update("first_lesson_date", e.target.value)}
              required
            />
          </label>
          <label className="field">
            Quantidade de aulas
            <Input
              type="number"
              min="1"
              value={form.lesson_count}
              onChange={(e) => update("lesson_count", e.target.value)}
              required
            />
          </label>
          <label className="field">
            Duração (minutos)
            <Input
              type="number"
              min="1"
              value={form.duration_minutes}
              onChange={(e) => update("duration_minutes", e.target.value)}
              required
            />
          </label>
          <label className="field">
            Valor por hora (R$)
            <Input
              inputMode="decimal"
              value={form.hourly_rate}
              onChange={(e) => update("hourly_rate", e.target.value)}
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
                onClick={() => {
                  setEditing(null);
                  setForm(emptyForm);
                }}
              >
                Cancelar edição
              </button>
            )}
          </div>
        </form>
      </section>
      <section className="panel">
        <div className="section-heading"><h2>Turmas Kodland</h2><span className="muted">{kodlandGroups.length} sincronizada{kodlandGroups.length === 1 ? "" : "s"}</span></div>
        {kodlandGroups.length === 0 ? <p className="muted">Sincronize a Kodland para ver suas turmas pedagógicas.</p> : <div className="entity-list">{kodlandGroups.map((group) => <article className="entity-card" key={group.id}><div><div className="entity-title"><h3>{group.title}</h3><StatusBadge tone={group.archived ? "neutral" : "success"}>{group.archived ? "Arquivada" : "Ativa"}</StatusBadge></div><p className="entity-details">{group.course_name || "Curso não informado"} · {group.student_count} aluno(s)</p><p className="muted">Próxima aula: {group.next_lesson_date || "não informada"}</p></div></article>)}</div>}
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Turmas ativas</h2>
          <span className="muted">
            {items.length} cadastrada{items.length === 1 ? "" : "s"}
          </span>
        </div>
        {loading ? (
          <p className="muted">Carregando turmas…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            Nenhuma turma ativa. Use o formulário acima para criar a primeira.
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
