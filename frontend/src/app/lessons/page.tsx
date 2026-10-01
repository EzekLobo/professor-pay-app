"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Modal } from "@/components/modal";
import { Button, Input, StatusBadge } from "@/components/ui";
import {
  ApiError,
  lessonsApi,
  type ExtraLessonPayload,
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
function LessonsContent() {
  const [lessons, setLessons] = useState<Lesson[]>([]),
    [filters, setFilters] = useState<LessonFilters>({ page: 1, page_size: 50 }),
    [form, setForm] = useState<ExtraForm>(emptyForm),
    [formOpen, setFormOpen] = useState(false),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const load = useCallback(
    async (next = filters) => {
      setLoading(true);
      setError("");
      try {
        setLessons((await lessonsApi.list(next)).items);
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
  return (
    <div className="management-grid">
      {error && !formOpen && (
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
