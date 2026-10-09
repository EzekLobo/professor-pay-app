"use client";

import {
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
  type WheelEvent,
} from "react";
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
const paymentLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const month = new Intl.DateTimeFormat("pt-BR", { month: "short" })
    .format(date)
    .replace(".", "");
  const formattedDate = new Intl.DateTimeFormat("pt-BR").format(date);
  return `${month.slice(0, 1).toUpperCase()}${month.slice(1)} - ${formattedDate}`;
};
const paymentMonthTitle = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const label = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(date);
  return `${label.slice(0, 1).toUpperCase()}${label.slice(1)}`;
};
const uniquePayments = (payments: Array<DashboardPayment | null>) =>
  payments
    .filter((payment): payment is DashboardPayment => payment !== null)
    .filter(
      (payment, index, all) =>
        all.findIndex(
          (candidate) => candidate.payment_date === payment.payment_date,
        ) === index,
    )
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date));

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
  const [paymentsVisible, setPaymentsVisible] = useState(
    () =>
      typeof window === "undefined" ||
      window.localStorage.getItem("aulapay.payments.visible") !== "false",
  );
  const [updatingLessonId, setUpdatingLessonId] = useState<string | null>(null);
  const [addingExtra, setAddingExtra] = useState(false);
  const [statusPayment, setStatusPayment] = useState<DashboardPayment | null>(null);
  const [updatingPaymentStatus, setUpdatingPaymentStatus] = useState(false);
  const [error, setError] = useState("");
  const togglePaymentsVisibility = () => {
    setPaymentsVisible((visible) => {
      const next = !visible;
      window.localStorage.setItem("aulapay.payments.visible", String(next));
      return next;
    });
  };
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

  const dashboardPayments = uniquePayments([
    ...dashboard.payments,
    dashboard.last_payment,
    dashboard.next_payment,
  ]);
  const selectedIndex = statementDate
    ? dashboardPayments.findIndex(
        (payment) => payment.payment_date === statementDate,
      )
    : -1;
  const selectedPayment =
    selectedIndex >= 0 ? dashboardPayments[selectedIndex] : null;
  const openStatement = (payment: DashboardPayment | null) =>
    setStatementDate(payment?.payment_date ?? null);
  const moveStatement = (step: number) => {
    const next = dashboardPayments[selectedIndex + step];
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
  async function updatePaymentStatus(status: "RECEIVED" | "OVERDUE") {
    if (!statusPayment || updatingPaymentStatus) return;
    setUpdatingPaymentStatus(true);
    setError("");
    try {
      await paymentsApi.setStatus(statusPayment.payment_date, status);
      await onRefresh?.();
      setStatusPayment(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar o status do pagamento.",
      );
    } finally {
      setUpdatingPaymentStatus(false);
    }
  }

  return (
    <div className="dashboard-grid">
      <section className="panel payment-panel" data-tour="dashboard-payments">
        <div className="section-heading">
          <div>
            <h2>Competências mensais</h2>
          </div>
          <button
            className="payment-visibility-toggle"
            type="button"
            aria-label={
              paymentsVisible
                ? "Ocultar competências mensais"
                : "Mostrar competências mensais"
            }
            aria-pressed={paymentsVisible}
            title={
              paymentsVisible
                ? "Ocultar competências mensais"
                : "Mostrar competências mensais"
            }
            onClick={togglePaymentsVisibility}
          >
            {paymentsVisible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
        </div>
        {paymentsVisible ? (
          <DashboardPaymentCarousel
            payments={dashboardPayments}
            initialFocus={dashboard.next_payment?.payment_date ?? null}
            onOpen={openStatement}
            onStatusSelect={setStatusPayment}
          />
        ) : (
          <p className="muted payment-hidden-message">
            Competências mensais ocultas.
          </p>
        )}
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
              total={dashboardPayments.length}
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
      <Modal
        open={Boolean(statusPayment)}
        title="Alterar status do pagamento"
        onClose={() => !updatingPaymentStatus && setStatusPayment(null)}
      >
        {statusPayment && (
          <div className="form-stack">
            <p className="muted">{paymentLabel(statusPayment.payment_date)} · {money(statusPayment.total_cents)}</p>
            <div className="form-actions">
              <button className="button button-primary" type="button" disabled={updatingPaymentStatus} onClick={() => void updatePaymentStatus("RECEIVED")}>Marcar como pago</button>
              <button className="button button-ghost" type="button" disabled={updatingPaymentStatus} onClick={() => void updatePaymentStatus("OVERDUE")}>Marcar como em atraso</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

function EyeIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M10.6 5.2A11 11 0 0 1 12 5c6.1 0 9.5 7 9.5 7a16.8 16.8 0 0 1-3.2 3.8M6.5 6.5C4 8.1 2.5 12 2.5 12s3.4 7 9.5 7c1.5 0 2.8-.4 4-1" />
      <path d="m3.5 3.5 17 17" />
      <path d="M9.7 9.7a3.2 3.2 0 0 0 4.6 4.6" />
    </svg>
  );
}

function DashboardPaymentCarousel({
  payments,
  initialFocus,
  onOpen,
  onStatusSelect,
}: {
  payments: DashboardPayment[];
  initialFocus: string | null;
  onOpen: (payment: DashboardPayment | null) => void;
  onStatusSelect: (payment: DashboardPayment) => void;
}) {
  const defaultFocus = initialFocus ?? payments.at(-1)?.payment_date ?? null;
  const [focusedPaymentDate, setFocusedPaymentDate] = useState(defaultFocus);
  const [carouselMotion, setCarouselMotion] = useState<
    "previous" | "next" | null
  >(null);
  const carouselDragStart = useRef<number | null>(null);
  const carouselDragDistance = useRef(0);
  const carouselWheelLocked = useRef(false);
  const focusedIndex = Math.max(
    0,
    payments.findIndex((payment) => payment.payment_date === focusedPaymentDate),
  );
  const carouselOffsets =
    carouselMotion === "next"
      ? [-1, 0, 1, 2]
      : carouselMotion === "previous"
        ? [-2, -1, 0, 1]
        : [-1, 0, 1];

  function moveCarousel(step: -1 | 1) {
    if (carouselMotion) return;
    if (payments[focusedIndex + step]) {
      setCarouselMotion(step === 1 ? "next" : "previous");
    }
  }
  function finishCarouselMotion() {
    if (!carouselMotion) return;
    const step = carouselMotion === "next" ? 1 : -1;
    const payment = payments[focusedIndex + step];
    if (payment) setFocusedPaymentDate(payment.payment_date);
    setCarouselMotion(null);
  }
  function beginCarouselDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    carouselDragStart.current = event.clientX;
    carouselDragDistance.current = 0;
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function trackCarouselDrag(event: PointerEvent<HTMLDivElement>) {
    if (carouselDragStart.current === null) return;
    carouselDragDistance.current = event.clientX - carouselDragStart.current;
  }
  function finishCarouselDrag() {
    const distance = carouselDragDistance.current;
    carouselDragStart.current = null;
    carouselDragDistance.current = 0;
    if (Math.abs(distance) >= 36) moveCarousel(distance < 0 ? 1 : -1);
  }
  function moveCarouselWithWheel(event: WheelEvent<HTMLDivElement>) {
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!delta) return;
    const step = delta > 0 ? 1 : -1;
    if (!payments[focusedIndex + step]) return;
    event.preventDefault();
    event.stopPropagation();
    if (carouselWheelLocked.current) return;
    carouselWheelLocked.current = true;
    moveCarousel(step);
    window.setTimeout(() => {
      carouselWheelLocked.current = false;
    }, 260);
  }

  if (!payments.length) {
    return <p className="muted">Nenhuma competência disponível.</p>;
  }

  return (
    <div
      className="payment-carousel"
      aria-label="Carrossel de competências mensais"
      onWheelCapture={moveCarouselWithWheel}
    >
      <p className="payment-carousel-month">
        {paymentMonthTitle(payments[focusedIndex].payment_date)}
      </p>
      <button
        className="button button-ghost payment-carousel-nav"
        type="button"
        aria-label="Competência anterior"
        disabled={focusedIndex <= 0 || carouselMotion !== null}
        onClick={() => moveCarousel(-1)}
      >
        ←
      </button>
      <div
        className="payment-carousel-track"
        onPointerDown={beginCarouselDrag}
        onPointerMove={trackCarouselDrag}
        onPointerUp={finishCarouselDrag}
        onPointerCancel={finishCarouselDrag}
      >
        <div
          className={`payment-carousel-rail${
            carouselMotion ? ` is-sliding-${carouselMotion}` : ""
          }`}
          onAnimationEnd={(event) => {
            if (event.currentTarget === event.target) finishCarouselMotion();
          }}
        >
          {carouselOffsets.map((offset) => {
            const payment = payments[focusedIndex + offset];
            if (!payment) {
              return (
                <div
                  className="payment-carousel-placeholder"
                  key={offset}
                  aria-hidden="true"
                />
              );
            }
            const isFocus = carouselMotion
              ? offset === (carouselMotion === "next" ? 1 : -1)
              : offset === 0;
            return (
              <button
                className={`payment-carousel-card${isFocus ? " is-focus" : ""}`}
                type="button"
                key={payment.payment_date}
                aria-current={isFocus ? "true" : undefined}
                aria-label={`Abrir extrato de ${paymentLabel(payment.payment_date)}`}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => onOpen(payment)}
              >
                <span>{paymentLabel(payment.payment_date)}</span>
                <div className="payment-carousel-details">
                  <b>{money(payment.total_cents)}</b>
                  <small>
                    {payment.lesson_count} aula
                    {payment.lesson_count === 1 ? "" : "s"}
                  </small>
                </div>
                <StatusBadge
                  tone={paymentTone(payment.status)}
                  onActivate={payment.status === "RECEIVED" ? undefined : () => onStatusSelect(payment)}
                >
                  {paymentStatus(payment.status)}
                </StatusBadge>
                <em>Abrir extrato</em>
              </button>
            );
          })}
        </div>
      </div>
      <button
        className="button button-ghost payment-carousel-nav"
        type="button"
        aria-label="Próxima competência"
        disabled={focusedIndex >= payments.length - 1 || carouselMotion !== null}
        onClick={() => moveCarousel(1)}
      >
        →
      </button>
    </div>
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
