"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
  type WheelEvent,
} from "react";
import { StatementRequests } from "@/lib/statement-requests";
import { readWithDeadline } from "@/lib/read-deadline";
import { NextMonthPayrollCard } from "./next-month-payroll";
import type { NextMonthPayroll } from "@/lib/next-month-payroll";
import { AuthGuard } from "@/components/auth-guard";
import { PaymentHistoryChart } from "@/components/payment-history-chart";
import { PaymentStatement } from "@/components/dashboard-content";
import { ConfirmDialog } from "@/components/confirm-dialog";
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
import { useStudentNotifications } from "@/components/student-notifications";
import { getFirebaseAuth } from "@/lib/firebase";
import { syncPaymentsOnEntry } from "@/lib/auto-sync-payroll";
import { subscribeSyncDataChanged } from "@/lib/sync-events";
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
function PaymentStatus({
  payment,
  onActivate,
  tourTarget = false,
}: {
  payment: DashboardPayment;
  onActivate: (payment: DashboardPayment) => void;
  tourTarget?: boolean;
}) {
  return (
    <span data-tour={tourTarget ? "payments-status" : undefined}>
      <StatusBadge
        tone={tone(payment.status)}
        onActivate={payment.status === "RECEIVED" ? undefined : () => onActivate(payment)}
      >
        {status(payment.status)}
      </StatusBadge>
    </span>
  );
}
export type PaymentsAdapter = {
  list: () => Promise<{ items: DashboardPayment[]; next_month_forecast?: NextMonthPayroll }>;
  get: (date: string) => Promise<PaymentDetail>;
  updateLessonFinancialStatus: (date: string, id: string, source: string | undefined, status: "" | "BILLABLE" | "SUBSTITUTION" | "HOLIDAY" | "CANCELED") => Promise<unknown>;
  setStatus: (date: string, status: "RECEIVED" | "OVERDUE") => Promise<unknown>;
  reverse: (date: string) => Promise<unknown>;
  confirm: (date: string) => Promise<unknown>;
  createExtra: (payload: ExtraLessonPayload) => Promise<unknown>;
};
export function PaymentsContent({ adapter }: { adapter?: PaymentsAdapter } = {}) {
  const paymentActions = adapter ?? paymentsApi;
  const notificationState = useStudentNotifications();
  const [forecast, setForecast] = useState<NextMonthPayroll>();
  const automaticEntryStarted = useRef(false);
  const detailPaymentDate = useRef<string | null>(null);
  const [automaticStatus, setAutomaticStatus] = useState("");
  const [confirmReverse, setConfirmReverse] = useState<boolean | null>(null);
  const [items, setItems] = useState<DashboardPayment[]>([]),
    [detail, setDetail] = useState<PaymentDetail | null>(null),
    [focusedPaymentDate, setFocusedPaymentDate] = useState<string | null>(null),
    [statusPayment, setStatusPayment] = useState<DashboardPayment | null>(null),
    [showAllPayments, setShowAllPayments] = useState(false),
    [carouselMotion, setCarouselMotion] = useState<"previous" | "next" | null>(null),
    [updatingLessonId, setUpdatingLessonId] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");

  useEffect(() => {
    const revealAllPayments = (event: Event) => {
      if ((event as CustomEvent<string>).detail === "show-all-payments") setShowAllPayments(true);
    };
    window.addEventListener("nexusclass:tutorial-reveal", revealAllPayments);
    return () => window.removeEventListener("nexusclass:tutorial-reveal", revealAllPayments);
  }, []);
  const carouselDragStart = useRef<number | null>(null);
  const carouselDragDistance = useRef(0);
  const carouselDragStartY = useRef(0);
  const carouselSwiped = useRef(false);
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
  const reading = useRef(false);
  const loadGeneration = useRef(0);
  const hasLoaded = useRef(false);
  const detailRequests = useRef(new StatementRequests());
  useEffect(() => () => { loadGeneration.current++; detailRequests.current.close(); }, []);
  const reloadRequested = useRef(false);
  const entryTimeZone = notificationState?.settings?.time_zone ?? "America/Sao_Paulo";
  const load = useCallback(async (keepContent = false) => {
    if (reading.current) { reloadRequested.current = true; return; }
    reading.current = true;
    const run = ++loadGeneration.current;
    if (!keepContent && !hasLoaded.current) setLoading(true);
    setError("");
    try {
      do {
        reloadRequested.current = false;
        let loaded = await readWithDeadline(() => paymentActions.list(), "Pagamentos");
        let loadedItems = loaded.items;
        if (!adapter && !automaticEntryStarted.current) {
          automaticEntryStarted.current = true;
          try {
            const result = await syncPaymentsOnEntry(loadedItems, { timeZone: entryTimeZone, refreshOnEntry: true });
            setAutomaticStatus(result.status === "auth_required" || result.status === "credentials_required"
              ? "Reconecte a Kodland em Dados e backup para atualizar os pagamentos."
              : result.status === "pending" ? "Não foi possível atualizar os pagamentos. Exibindo a última consulta salva." : "");
            if (result.updated) {
              reloadRequested.current = false; // This read includes the sync events already received.
              loaded = await readWithDeadline(() => paymentActions.list(), "Pagamentos");
              loadedItems = loaded.items;
            }
          } catch { setAutomaticStatus("Não foi possível atualizar os pagamentos. Exibindo a última consulta salva."); }
        }
        if (run !== loadGeneration.current) return;
        hasLoaded.current = true;
        const nextFocus =
          loadedItems.find(
            (item) => item.payment_date > new Date().toISOString().slice(0, 10),
          ) ?? loadedItems.at(-1) ?? null;
        setItems(loadedItems);
        setForecast(loaded.next_month_forecast);
        setStatusPayment(current => current ? loadedItems.find(item => item.payment_date === current.payment_date) ?? null : null);
        setFocusedPaymentDate((current) =>
          current && loadedItems.some((item) => item.payment_date === current)
            ? current
            : nextFocus?.payment_date ?? null,
        );
      } while (reloadRequested.current);
    } catch (e) {
      if (run !== loadGeneration.current) return;
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível carregar pagamentos.",
      );
    } finally {
      reading.current = false;
      if (run === loadGeneration.current) setLoading(false);
    }
  }, [paymentActions, adapter, entryTimeZone]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => { detailPaymentDate.current = detail?.payment_date ?? null; }, [detail]);
  useEffect(() => {
    if (adapter) return; // A demo adapter must never resolve Firebase or Kodland services.
    const uid = getFirebaseAuth().currentUser?.uid;
    if (!uid) return;
    return subscribeSyncDataChanged(uid, event => {
      if (!event.domains.includes("payments")) return;
      void load(true);
      const date = detailPaymentDate.current;
      const request = detailRequests.current.refresh(date);
      if (date && request !== null) void readWithDeadline(() => paymentActions.get(date), "Extrato").then(value => {
        if (detailRequests.current.current(request) && getFirebaseAuth().currentUser?.uid === uid && detailPaymentDate.current === date) setDetail(value);
      }).catch(() => { /* Keep the open statement while a refresh is unavailable. */ });
    });
  }, [adapter, load, paymentActions]);
  async function open(date: string) {
    const request = detailRequests.current.open(date);
    try {
      const result = await readWithDeadline(() => paymentActions.get(date), "Extrato");
      if (detailRequests.current.finishOpen(request)) setDetail(result);
    } catch (e) {
      if (!detailRequests.current.failOpen(request)) return;
      setError(
        e instanceof Error ? e.message : "Não foi possível abrir o pagamento.",
      );
    }
  }
  async function refreshDetail(date: string) {
    const request = detailRequests.current.refresh(date);
    if (request === null) return;
    try {
      const value = await readWithDeadline(() => paymentActions.get(date), "Extrato");
      if (detailRequests.current.current(request)) setDetail(value);
    } catch {
      // Persistence already succeeded; a failed follow-up must not invite duplicate writes.
      if (detailRequests.current.current(request)) {
        detailRequests.current.close(); detailPaymentDate.current = null; setDetail(null);
        setError("Alteração salva. Não foi possível atualizar o extrato agora. Tente consultar novamente.");
      }
    }
  }
  function moveCarousel(step: -1 | 1) {
    if (carouselMotion) return;
    const payment = items[focusedIndex + step];
    if (!payment) return;
    if (window.matchMedia("(max-width: 720px), (prefers-reduced-motion: reduce)").matches) {
      setFocusedPaymentDate(payment.payment_date);
    } else setCarouselMotion(step === 1 ? "next" : "previous");
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
    carouselDragStartY.current = event.clientY;
    carouselSwiped.current = false;
  }
  function trackCarouselDrag(event: PointerEvent<HTMLDivElement>) {
    if (carouselDragStart.current === null) return;
    const distance = event.clientX - carouselDragStart.current;
    if (Math.abs(distance) <= Math.abs(event.clientY - carouselDragStartY.current)) return;
    carouselDragDistance.current = distance;
    if (Math.abs(distance) >= 36) {
      carouselSwiped.current = true;
      if (event.pointerType === "mouse") event.currentTarget.setPointerCapture(event.pointerId);
    }
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
    status: "" | "BILLABLE" | "SUBSTITUTION" | "HOLIDAY" | "CANCELED",
  ) {
    if (!detail) return;
    setUpdatingLessonId(lesson.id);
    setError("");
    try {
      await paymentActions.updateLessonFinancialStatus(
        detail.payment_date,
        lesson.id,
        lesson.financial_source_id,
        status,
      );
      await load();
      try {
        await refreshDetail(detail.payment_date);
      } catch {
        // Keep the last confirmed statement when a follow-up read is unavailable.
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
      await (adapter ?? lessonsApi).createExtra(payload);
      await load();
      await refreshDetail(detail.payment_date);
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
    if (!detail || busy) return;
    setBusy(true);
    try {
      if (reverse) await paymentActions.reverse(detail.payment_date);
      else await paymentActions.confirm(detail.payment_date);
      await load();
      await refreshDetail(detail.payment_date);
      setNotice(reverse ? "Confirmação estornada." : "Pagamento confirmado.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir a operação.",
      );
      throw e;
    } finally {
      setBusy(false);
    }
  }
  async function updatePaymentStatus(status: "RECEIVED" | "OVERDUE") {
    if (!statusPayment || busy) return;
    setBusy(true);
    setError("");
    try {
      await paymentActions.setStatus(statusPayment.payment_date, status);
      await load();
      if (detail?.payment_date === statusPayment.payment_date) {
        await refreshDetail(statusPayment.payment_date);
      }
      setNotice(status === "RECEIVED" ? "Pagamento marcado como pago." : "Pagamento marcado como em atraso.");
      setStatusPayment(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível atualizar o status do pagamento.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (loading) return <section className="panel" role="status" aria-busy="true"><h1>Pagamentos</h1><p className="muted">Atualizando pagamentos…</p></section>;
  return (
    <div className="management-grid page-fill-grid">
      <ConfirmDialog open={confirmReverse !== null} title={confirmReverse ? "Estornar confirmação" : "Confirmar recebimento"} confirmLabel={confirmReverse ? "Estornar confirmação" : "Confirmar recebimento"} danger={confirmReverse === true} onClose={() => setConfirmReverse(null)} onConfirm={() => change(confirmReverse === true)}><p>{confirmReverse ? "O pagamento voltará a ficar em aberto." : `Confirmar ${formatMoney(detail?.total_cents ?? 0)} como recebido?`}</p></ConfirmDialog>
      <section className="page-heading">
        <p className="eyebrow">Financeiro</p>
        <h1>Pagamentos</h1>
        <p className="muted">
          Projeção pelo cronograma Kodland e aulas extras. Pagamento previsto
          para o dia 15 do mês seguinte.
        </p>
      </section>
      {automaticStatus && <p className="muted" role="status">{automaticStatus}</p>}
      {error && <div role="alert"><p className="form-error">{error}</p><Button type="button" className="button-ghost" onClick={() => void load(true)}>Tentar novamente</Button></div>}
      {notice && <p className="notice">{notice}</p>}
      <section className="metric-grid payment-metric-grid payment-metrics-with-forecast" data-tour="payments-summary">
        <NextMonthPayrollCard forecast={forecast} />
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
      <div className={`payments-visual-layout${showAllPayments ? " payments-visual-expanded" : ""}`}>
      <PaymentHistoryChart payments={items} loading={loading} />
      <section className="panel" data-tour="payments-period">
        <div className="section-heading">
          <h2>Competências mensais</h2>
          {items.length > 0 && (
            <button
              className="button button-ghost button-small"
              data-tour="payments-view-toggle"
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
            {items.map((payment, index) => (
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
                    <PaymentStatus payment={payment} onActivate={setStatusPayment} tourTarget={index === 0} />
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
              onPointerCancel={() => { carouselDragStart.current = null; carouselDragDistance.current = 0; }}
        onClickCapture={(event) => { if (carouselSwiped.current) { event.preventDefault(); event.stopPropagation(); carouselSwiped.current = false; } }}
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

                    onClick={() => openFromCarousel(payment.payment_date)}
                  >
                    <span>{paymentLabel(payment.payment_date)}</span>
                    <div className="payment-carousel-details">
                      <b>{formatMoney(payment.total_cents)}</b>
                      <small>
                        {payment.lesson_count} aula{payment.lesson_count === 1 ? "" : "s"}
                      </small>
                    </div>
                    <PaymentStatus payment={payment} onActivate={setStatusPayment} tourTarget={isFocus} />
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
      </div>
      <Modal
        open={Boolean(detail)}
        className="payment-statement-modal"
        title={detail ? `Extrato · ${detail.period}` : "Extrato"}
        onClose={() => { detailRequests.current.close(); detailPaymentDate.current = null; setDetail(null); }}
        help={{
          id: adapter ? "demo-payment-statement" : "payment-statement",
          version: 2,
          intro: "O extrato detalha as aulas e os valores que formam esta competência.",
          items: [
            { title: "Aulas", content: "Confira turma, data, duração e valor de cada registro.", target: ".payment-statement-list" },
            { title: "Situação da aula", content: "Use o seletor ao lado do valor para marcar cancelamento, feriado ou substituição.", target: ".payment-statement-row-actions" },
            { title: "Aula extra", content: "Adicione um encontro extra antes de confirmar o recebimento.", target: ".payment-statement-heading-actions" },
            { title: "Confirmação", content: "Confirme o recebimento somente depois de revisar o total.", target: ".form-actions" },
          ],
        }}
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
                  onClick={() => setConfirmReverse(true)}
                >
                  Estornar confirmação
                </button>
              ) : (
                <Button disabled={busy} onClick={() => setConfirmReverse(false)}>
                  Confirmar recebimento
                </Button>
              )}
            </div>
          </>
        )}
      </Modal>
      <Modal
        open={Boolean(statusPayment)}
        title="Alterar status do pagamento"
        onClose={() => !busy && setStatusPayment(null)}
      >
        {statusPayment && (
          <div className="form-stack">
            <p className="muted">{paymentLabel(statusPayment.payment_date)} · {formatMoney(statusPayment.total_cents)}</p>
            <div className="form-actions">
              <Button disabled={busy} onClick={() => void updatePaymentStatus("RECEIVED")}>Marcar como pago</Button>
              <button className="button button-ghost" type="button" disabled={busy} onClick={() => void updatePaymentStatus("OVERDUE")}>Marcar como em atraso</button>
            </div>
          </div>
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
          <PaymentsContent key={user.id} />
        </Shell>
      )}
    </AuthGuard>
  );
}
