"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { AuthGuard } from "@/components/auth-guard";
import { PaymentStatement } from "@/components/dashboard-content";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button, StatusBadge } from "@/components/ui";
import {
  paymentsApi,
  lessonsApi,
  type DashboardLesson,
  type DashboardPayment,
  type ExtraLessonPayload,
  type PaymentDetail,
} from "@/lib/api";
import { formatMoney } from "@/lib/finance";
const status = (s: string) =>
  s === "RECEIVED" ? "Recebido" : s === "OVERDUE" ? "Em atraso" : "Previsto";
const tone = (s: string) =>
  s === "RECEIVED"
    ? ("success" as const)
    : s === "OVERDUE"
      ? ("danger" as const)
      : ("warning" as const);
const paymentLabel = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  const month = new Intl.DateTimeFormat("pt-BR", {
    month: "short",
  }).format(date).replace(".", "");
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
function Content() {
  const [items, setItems] = useState<DashboardPayment[]>([]),
    [detail, setDetail] = useState<PaymentDetail | null>(null),
    [focusedPaymentDate, setFocusedPaymentDate] = useState<string | null>(null),
    [showAllPayments, setShowAllPayments] = useState(false),
    [carouselMotion, setCarouselMotion] = useState<"previous" | "next" | null>(null),
    [updatingLessonId, setUpdatingLessonId] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const carouselDragStart = useRef<number | null>(null);
  const carouselDragDistance = useRef(0);
  const carouselWheelLocked = useRef(false);
  const estimatedCents = items
    .filter((item) => item.status !== "RECEIVED")
    .reduce((total, item) => total + item.total_cents, 0);
  const paidCents = items
    .filter((item) => item.status === "RECEIVED")
    .reduce((total, item) => total + item.total_cents, 0);
  const estimatedCount = items.filter(
    (item) => item.status !== "RECEIVED",
  ).length;
  const paidCount = items.filter((item) => item.status === "RECEIVED").length;
  const focusedIndex = Math.max(
    0,
    items.findIndex((item) => item.payment_date === focusedPaymentDate),
  );
  const carouselOffsets =
    carouselMotion === "next"
      ? [-1, 0, 1, 2]
      : carouselMotion === "previous"
        ? [-2, -1, 0, 1]
        : [-1, 0, 1];
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const loadedItems = (await paymentsApi.list()).items;
      const nextFocus =
        loadedItems.find(
          (item) => item.payment_date > new Date().toISOString().slice(0, 10),
        ) ?? loadedItems.at(-1) ?? null;
      setItems(loadedItems);
      setFocusedPaymentDate((current) =>
        current && loadedItems.some((item) => item.payment_date === current)
          ? current
          : nextFocus?.payment_date ?? null,
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar pagamentos.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function open(date: string) {
    try {
      setDetail(await paymentsApi.get(date));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Não foi possível abrir o pagamento.",
      );
    }
  }
  function moveCarousel(step: -1 | 1) {
    if (carouselMotion) return;
    const payment = items[focusedIndex + step];
    if (payment) setCarouselMotion(step === 1 ? "next" : "previous");
  }
  function finishCarouselMotion() {
    if (!carouselMotion) return;
    const step = carouselMotion === "next" ? 1 : -1;
    const payment = items[focusedIndex + step];
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
    if (Math.abs(distance) < 36) return;
    moveCarousel(distance < 0 ? 1 : -1);
  }
  function openFromCarousel(paymentDate: string) {
    void open(paymentDate);
  }
  function moveCarouselWithWheel(event: WheelEvent<HTMLDivElement>) {
    const delta =
      Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;
    if (!delta) return;

    const step = delta > 0 ? 1 : -1;
    if (!items[focusedIndex + step]) return;

    event.preventDefault();
    event.stopPropagation();
    if (carouselWheelLocked.current) return;
    carouselWheelLocked.current = true;
    moveCarousel(step);
    window.setTimeout(() => {
      carouselWheelLocked.current = false;
    }, 260);
  }
  async function updateLessonFinancialStatus(
    lesson: DashboardLesson,
    status: "" | "SUBSTITUTION" | "HOLIDAY" | "CANCELED",
  ) {
    if (!detail) return;
    setUpdatingLessonId(lesson.id);
    setError("");
    try {
      await paymentsApi.updateLessonFinancialStatus(
        detail.payment_date,
        lesson.id,
        lesson.financial_source_id,
        status,
      );
      await load();
      try {
        setDetail(await paymentsApi.get(detail.payment_date));
      } catch {
        setDetail(null);
      }
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
    if (!detail) return;
    setBusy(true);
    setError("");
    try {
      await lessonsApi.createExtra(payload);
      await load();
      setDetail(await paymentsApi.get(detail.payment_date));
      setNotice("Aula extra adicionada ao extrato.");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível adicionar a aula extra.",
      );
      throw reason;
    } finally {
      setBusy(false);
    }
  }
  async function change(reverse: boolean) {
    if (
      !detail ||
      busy ||
      !window.confirm(
        reverse
          ? "Estornar esta confirmação?"
          : `Confirmar ${formatMoney(detail.total_cents)} como recebido?`,
      )
    )
      return;
    setBusy(true);
    try {
      if (reverse) await paymentsApi.reverse(detail.payment_date);
      else await paymentsApi.confirm(detail.payment_date);
      await load();
      setDetail(await paymentsApi.get(detail.payment_date));
      setNotice(reverse ? "Confirmação estornada." : "Pagamento confirmado.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir a operação.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="management-grid">
      <section className="page-heading">
        <p className="eyebrow">Financeiro</p>
        <h1>Pagamentos</h1>
        <p className="muted">
          Projeção pelo cronograma Kodland e aulas extras. Pagamento previsto
          para o dia 15 do mês seguinte.
        </p>
      </section>
      {error && <p className="form-error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      <section className="metric-grid payment-metric-grid">
        <article className="metric-card">
          <span>Estimativa a receber</span>
          <strong>{formatMoney(estimatedCents)}</strong>
          <small>{estimatedCount} competência(s) ainda não recebida(s)</small>
        </article>
        <article className="metric-card metric-success">
          <span>Já recebido</span>
          <strong>{formatMoney(paidCents)}</strong>
          <small>{paidCount} competência(s) confirmada(s)</small>
        </article>
      </section>
      <section className="panel">
        <div className="section-heading">
          <h2>Competências mensais</h2>
          {items.length > 0 && (
            <button
              className="button button-ghost button-small"
              type="button"
              aria-expanded={showAllPayments}
              onClick={() => setShowAllPayments((current) => !current)}
            >
              {showAllPayments ? "Mostrar carrossel" : "Ver completo"}
            </button>
          )}
        </div>
        {loading ? (
          <p className="muted">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            Sincronize a Kodland para importar o cronograma das turmas.
          </p>
        ) : showAllPayments ? (
          <div className="payment-list payment-complete-list">
            {items.map((payment) => (
              <button
                className="payment-row payment-row-button payment-complete-row"
                type="button"
                key={payment.payment_date}
                onClick={() => void open(payment.payment_date)}
              >
                <div>
                  <strong>{paymentLabel(payment.payment_date)}</strong>
                  <span>
                    {payment.lesson_count} aula{payment.lesson_count === 1 ? "" : "s"}
                  </span>
                </div>
                <div>
                  <span className="payment-complete-value">
                    <strong>{formatMoney(payment.total_cents)}</strong>
                    <StatusBadge tone={tone(payment.status)}>
                      {status(payment.status)}
                    </StatusBadge>
                  </span>
                  <em>Abrir extrato</em>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div
            className="payment-carousel"
            aria-label="Carrossel de competências mensais"
            onWheelCapture={moveCarouselWithWheel}
          >
            <p className="payment-carousel-month">
              {paymentMonthTitle(items[focusedIndex].payment_date)}
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
                const payment = items[focusedIndex + offset];
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
                    aria-label={
                      `Abrir extrato de ${paymentLabel(payment.payment_date)}`
                    }
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => openFromCarousel(payment.payment_date)}
                  >
                    <span>{paymentLabel(payment.payment_date)}</span>
                    <div className="payment-carousel-details">
                      <b>{formatMoney(payment.total_cents)}</b>
                      <small>
                        {payment.lesson_count} aula{payment.lesson_count === 1 ? "" : "s"}
                      </small>
                    </div>
                    <StatusBadge tone={tone(payment.status)}>
                      {status(payment.status)}
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
              disabled={focusedIndex >= items.length - 1 || carouselMotion !== null}
              onClick={() => moveCarousel(1)}
            >
              →
            </button>
          </div>
        )}
      </section>
      <Modal
        open={Boolean(detail)}
        title={detail ? `Extrato · ${detail.period}` : "Extrato"}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <PaymentStatement
              payment={detail}
              updatingLessonId={updatingLessonId}
              addingExtra={busy}
              onLessonFinancialStatusChange={(lesson, status) =>
                void updateLessonFinancialStatus(lesson, status)
              }
              onCreateExtra={createExtra}
            />
            <div className="form-actions">
              {detail.status === "RECEIVED" ? (
                <button
                  className="button button-primary"
                  type="button"
                  disabled={busy}
                  onClick={() => void change(true)}
                >
                  Estornar confirmação
                </button>
              ) : (
                <Button disabled={busy} onClick={() => void change(false)}>
                  Confirmar recebimento
                </Button>
              )}
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <AuthGuard>
      {(user) => (
        <Shell user={user}>
          <Content />
        </Shell>
      )}
    </AuthGuard>
  );
}
