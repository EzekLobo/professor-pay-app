"use client";

import { useState, type FormEvent } from "react";
import { Modal } from "./modal";
import { StatusBadge } from "./ui";
import { lessonsApi, paymentsApi } from "@/lib/api";
import type {
  DashboardLesson,
  DashboardPayment,
  DashboardResponse,
  ExtraLessonPayload,
} from "@/lib/api";
import { brlToCents } from "@/lib/finance";

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
const money = (cents: number) => currency.format(cents / 100);
const formatDate = (value: string) =>
  dateFormatter.format(new Date(`${value}T12:00:00`));
const paymentTone = (status: string) =>
  status === "RECEIVED"
    ? ("success" as const)
    : status === "OVERDUE"
      ? ("danger" as const)
      : ("warning" as const);
const paymentStatus = (status: string) =>
  status === "RECEIVED"
    ? "Recebido"
    : status === "OVERDUE"
      ? "Em atraso"
      : status === "DUE_TODAY"
        ? "Vence hoje"
        : "Previsto";

export type DashboardContentProps =
  | { state: "loading" }
  | { state: "error"; onRetry: () => void }
  | {
      state: "ready";
      dashboard: DashboardResponse;
      onRefresh?: () => Promise<void> | void;
    };

export function DashboardContent(props: DashboardContentProps) {
  const [statementDate, setStatementDate] = useState<string | null>(null);
  const [updatingLessonId, setUpdatingLessonId] = useState<string | null>(null);
  const [addingExtra, setAddingExtra] = useState(false);
  const [error, setError] = useState("");
  if (props.state === "loading")
    return (
      <section className="dashboard-state" aria-busy="true">
        <p className="muted">Sincronizando seu resumo financeiro…</p>
      </section>
    );
  if (props.state === "error")
    return (
      <section className="dashboard-state dashboard-error" role="alert">
        <h2>Não foi possível carregar o resumo</h2>
        <p className="muted">Confira sua conexão e tente novamente.</p>
        <button className="button button-primary" onClick={props.onRetry}>
          Tentar novamente
        </button>
      </section>
    );
  const { dashboard, onRefresh } = props;
  if (dashboard.total_lessons === 0)
    return (
      <section className="dashboard-state">
        <p className="eyebrow">PAINEL PRONTO</p>
        <h2>Sem lançamentos financeiros</h2>
        <p className="muted">
          Sincronize a Kodland para acompanhar a agenda semanal e as próximas
          competências.
        </p>
      </section>
    );

  const selectedIndex = statementDate
    ? dashboard.payments.findIndex(
        (payment) => payment.payment_date === statementDate,
      )
    : -1;
  const selectedPayment =
    selectedIndex >= 0 ? dashboard.payments[selectedIndex] : null;
  const openStatement = (payment: DashboardPayment | null) =>
    setStatementDate(payment?.payment_date ?? null);
  const moveStatement = (step: number) => {
    const next = dashboard.payments[selectedIndex + step];
    if (next) setStatementDate(next.payment_date);
  };
  async function updateLessonStatus(
    lesson: DashboardLesson,
    status: "" | "SUBSTITUTION" | "HOLIDAY" | "CANCELED",
  ) {
    if (!selectedPayment) return;
    setUpdatingLessonId(lesson.id);
    setError("");
    try {
      await paymentsApi.updateLessonFinancialStatus(
        selectedPayment.payment_date,
        lesson.id,
        lesson.financial_source_id,
        status,
      );
      await onRefresh?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar o status da aula.",
      );
    } finally {
      setUpdatingLessonId(null);
    }
  }
  async function createExtra(payload: ExtraLessonPayload) {
    setAddingExtra(true);
    setError("");
    try {
      await lessonsApi.createExtra(payload);
      await onRefresh?.();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível adicionar a aula extra.",
      );
      throw reason;
    } finally {
      setAddingExtra(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <section className="panel payment-panel">
        <div className="section-heading">
          <div>
            <h2>Resumo financeiro</h2>
          </div>
        </div>
        <div className="payment-summary">
          <PaymentHighlight
            label="Anterior"
            payment={dashboard.last_payment}
            empty="Nenhum pagamento anterior"
            onOpen={openStatement}
          />
          <PaymentHighlight
            label="Próximo"
            payment={dashboard.next_payment}
            empty="Nenhum pagamento previsto"
            onOpen={openStatement}
          />
        </div>
      </section>
      <Modal
        open={Boolean(selectedPayment)}
        title={
          selectedPayment ? `Extrato · ${selectedPayment.period}` : "Extrato"
        }
        onClose={() => setStatementDate(null)}
      >
        {selectedPayment && (
          <>
            {error && <p className="form-error">{error}</p>}
            <PaymentStatement
              payment={selectedPayment}
              index={selectedIndex}
              total={dashboard.payments.length}
              onMove={moveStatement}
              updatingLessonId={updatingLessonId}
              addingExtra={addingExtra}
              onLessonFinancialStatusChange={(lesson, status) =>
                void updateLessonStatus(lesson, status)
              }
              onCreateExtra={createExtra}
            />
          </>
        )}
      </Modal>
    </div>
  );
}

function PaymentHighlight({
  label,
  payment,
  empty,
  onOpen,
}: {
  label: string;
  payment: DashboardPayment | null;
  empty: string;
  onOpen: (payment: DashboardPayment | null) => void;
}) {
  return (
    <button
      className="payment-highlight payment-highlight-button"
      type="button"
      onClick={() => onOpen(payment)}
      disabled={!payment}
    >
      <span>{label}</span>
      <strong>
        {payment
          ? `${formatDate(payment.payment_date)} · ${money(payment.total_cents)}`
          : empty}
      </strong>
      {payment && (
        <StatusBadge tone={paymentTone(payment.status)}>
          {paymentStatus(payment.status)}
        </StatusBadge>
      )}
      {payment && <small>Abrir extrato</small>}
    </button>
  );
}

export function PaymentStatement({
  payment,
  index,
  total,
  onMove,
  onLessonFinancialStatusChange,
  updatingLessonId,
  onCreateExtra,
  addingExtra = false,
}: {
  payment: DashboardPayment;
  index?: number;
  total?: number;
  onMove?: (step: number) => void;
  onLessonFinancialStatusChange?: (
    lesson: DashboardLesson,
    status: "" | "SUBSTITUTION" | "HOLIDAY" | "CANCELED",
  ) => void;
  updatingLessonId?: string | null;
  onCreateExtra?: (payload: ExtraLessonPayload) => Promise<void> | void;
  addingExtra?: boolean;
}) {
  const [extraFormOpen, setExtraFormOpen] = useState(false);
  const paymentMonth = payment.payment_date.slice(0, 7);
  const lessonMonth = (() => {
    const [year, month] = paymentMonth.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 2, 1));
    return date.toISOString().slice(0, 7);
  })();
  const lessonMonthEnd = (() => {
    const [year, month] = paymentMonth.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 0)).toISOString().slice(0, 10);
  })();
  const [extraStudent, setExtraStudent] = useState("");
  const [extraDate, setExtraDate] = useState(`${lessonMonth}-01`);
  const [extraDuration, setExtraDuration] = useState("60");
  const [extraRate, setExtraRate] = useState("30,00");
  const [extraNote, setExtraNote] = useState("");
  const [extraError, setExtraError] = useState("");
  async function submitExtra(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const duration = Number(extraDuration);
    const hourlyRate = brlToCents(extraRate);
    if (
      !extraStudent.trim() ||
      !extraDate ||
      !Number.isInteger(duration) ||
      duration < 1 ||
      hourlyRate === null
    ) {
      setExtraError("Preencha os dados da aula extra com valores válidos.");
      return;
    }
    setExtraError("");
    try {
      await onCreateExtra?.({
        student: extraStudent.trim(),
        lesson_date: extraDate,
        duration_minutes: duration,
        hourly_rate_cents: hourlyRate,
        note: extraNote.trim(),
      });
      setExtraStudent("");
      setExtraDate(`${lessonMonth}-01`);
      setExtraDuration("60");
      setExtraRate("30,00");
      setExtraNote("");
      setExtraFormOpen(false);
    } catch {
      setExtraError("Não foi possível adicionar a aula extra.");
    }
  }
  return (
    <div className="payment-statement">
      <div className="payment-statement-summary">
        <div>
          <span className="muted">
            Vencimento: {formatDate(payment.payment_date)}
          </span>
        </div>
        <div>
          <StatusBadge tone={paymentTone(payment.status)}>
            {paymentStatus(payment.status)}
          </StatusBadge>
          <strong>{money(payment.total_cents)}</strong>
        </div>
      </div>
      <div className="payment-breakdown">
        <div>
          <span>Normais</span>
          <strong>
            {payment.normal_count} · {money(payment.normal_total_cents)}
          </strong>
        </div>
        <div>
          <span>Extras</span>
          <strong>
            {payment.extra_count} · {money(payment.extra_total_cents)}
          </strong>
        </div>
        <div>
          <span>Total de aulas</span>
          <strong>{payment.lesson_count}</strong>
        </div>
      </div>
      <div className="section-heading payment-statement-heading">
        <h3>Aulas da competência</h3>
        <div className="payment-statement-heading-actions">
          <span className="muted">{payment.lessons.length} registro(s)</span>
          {onCreateExtra && payment.status !== "RECEIVED" && (
            <button
              className="button button-ghost button-small"
              type="button"
              onClick={() => setExtraFormOpen((open) => !open)}
              aria-expanded={extraFormOpen}
            >
              {extraFormOpen ? "Cancelar" : "Adicionar aula extra"}
            </button>
          )}
        </div>
      </div>
      {extraFormOpen && onCreateExtra && (
        <form className="payment-extra-form" onSubmit={(event) => void submitExtra(event)}>
          <label className="field">Aluno<input className="input" value={extraStudent} onChange={(event) => setExtraStudent(event.target.value)} placeholder="Nome do aluno" autoFocus /></label>
          <label className="field">Data<input className="input" type="date" value={extraDate} min={`${lessonMonth}-01`} max={lessonMonthEnd} onChange={(event) => setExtraDate(event.target.value)} /></label>
          <label className="field">Duração (min)<input className="input" type="number" min="1" step="1" value={extraDuration} onChange={(event) => setExtraDuration(event.target.value)} /></label>
          <label className="field">Valor/hora (R$)<input className="input" inputMode="decimal" value={extraRate} onChange={(event) => setExtraRate(event.target.value)} /></label>
          <label className="field payment-extra-note">Observação<input className="input" value={extraNote} onChange={(event) => setExtraNote(event.target.value)} placeholder="Opcional" /></label>
          {extraError && <p className="form-error">{extraError}</p>}
          <div className="form-actions"><button className="button button-primary" type="submit" disabled={addingExtra}>{addingExtra ? "Adicionando…" : "Adicionar ao extrato"}</button></div>
        </form>
      )}
      {payment.lessons.length ? (
        <div className="payment-statement-list">
          {payment.lessons.map((lesson) => (
            <div className="payment-statement-row" key={lesson.id}>
              <div>
                <strong>{lesson.class_name_snapshot || "Aula"}</strong>
                <span>
                  {formatDate(lesson.lesson_date)} · Aula {lesson.number} ·{" "}
                  {lesson.type === "EXTRA" ? "Extra" : "Normal"}
                </span>
                {lesson.student && <span>{lesson.student}</span>}
                {lesson.financial_status && (
                  <span className="payment-lesson-excluded">
                    {lesson.financial_status === "SUBSTITUTION"
                      ? "Substituição"
                      : lesson.financial_status === "HOLIDAY"
                        ? "Feriado"
                        : "Cancelada"}
                  </span>
                )}
              </div>
              <div className="payment-statement-row-actions">
                <strong>{money(lesson.value_cents)}</strong>
                {onLessonFinancialStatusChange && (
                  <select
                    className="input button-small"
                    aria-label={`Status financeiro da aula ${lesson.number}`}
                    value={lesson.financial_status ?? ""}
                    disabled={
                      payment.status === "RECEIVED" ||
                      updatingLessonId === lesson.id
                    }
                    onChange={(event) =>
                      onLessonFinancialStatusChange(
                        lesson,
                        event.target.value as
                          | ""
                          | "SUBSTITUTION"
                          | "HOLIDAY"
                          | "CANCELED",
                      )
                    }
                  >
                    <option value="">Contabilizar</option>
                    <option value="SUBSTITUTION">Substituição</option>
                    <option value="HOLIDAY">Feriado</option>
                    <option value="CANCELED">Cancelada</option>
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Nenhuma aula detalhada nesta competência.</p>
      )}
      {onMove && index !== undefined && total !== undefined && (
        <div className="payment-statement-footer">
          <button
            className="button button-ghost"
            type="button"
            onClick={() => onMove(-1)}
            disabled={index <= 0}
          >
            ← Anterior
          </button>
          <span className="muted">
            {index + 1} de {total}
          </span>
          <button
            className="button button-ghost"
            type="button"
            onClick={() => onMove(1)}
            disabled={index >= total - 1}
          >
            Próximo →
          </button>
        </div>
      )}
    </div>
  );
}
