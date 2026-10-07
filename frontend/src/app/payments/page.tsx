"use client";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { AuthGuard } from "@/components/auth-guard";
import { PaymentStatement } from "@/components/dashboard-content";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button, StatusBadge } from "@/components/ui";
import {
  paymentsApi,
  type DashboardPayment,
  type PaymentDetail,
} from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/finance";
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
function Content() {
  const [items, setItems] = useState<DashboardPayment[]>([]),
    [detail, setDetail] = useState<PaymentDetail | null>(null),
    [focusedPaymentDate, setFocusedPaymentDate] = useState<string | null>(null),
    [showAllPayments, setShowAllPayments] = useState(false),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const carouselDragStart = useRef<number | null>(null);
  const carouselDragDistance = useRef(0);
  const carouselWasDragged = useRef(false);
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
  const today = new Date().toISOString().slice(0, 10);
  const previousPayment =
    items.filter((item) => item.payment_date <= today).at(-1) ?? null;
  const nextPayment = items.find((item) => item.payment_date > today) ?? null;
  const focusedIndex = Math.max(
    0,
    items.findIndex((item) => item.payment_date === focusedPaymentDate),
  );
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
    const payment = items[focusedIndex + step];
    if (payment) setFocusedPaymentDate(payment.payment_date);
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
    carouselWasDragged.current = true;
    moveCarousel(distance < 0 ? 1 : -1);
    window.setTimeout(() => {
      carouselWasDragged.current = false;
    }, 0);
  }
  function openFromCarousel(paymentDate: string) {
    if (carouselWasDragged.current) {
      carouselWasDragged.current = false;
      return;
    }
    void open(paymentDate);
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
      <section className="payment-summary" aria-label="Pagamentos em destaque">
        <PaymentHighlight
          label="Anterior"
          payment={previousPayment}
          empty="Nenhum pagamento anterior"
          onOpen={open}
        />
        <PaymentHighlight
          label="Próximo"
          payment={nextPayment}
          empty="Nenhum pagamento previsto"
          onOpen={open}
        />
      </section>
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
          <div className="payment-carousel" aria-label="Carrossel de competências mensais">
            <button
              className="button button-ghost payment-carousel-nav"
              type="button"
              aria-label="Competência anterior"
              disabled={focusedIndex <= 0}
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
              {[-1, 0, 1].map((offset) => {
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
                const isFocus = offset === 0;
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
                    <b>{formatMoney(payment.total_cents)}</b>
                    <small>
                      {payment.lesson_count} aula{payment.lesson_count === 1 ? "" : "s"}
                    </small>
                    <StatusBadge tone={tone(payment.status)}>
                      {status(payment.status)}
                    </StatusBadge>
                    <em>Abrir extrato</em>
                  </button>
                );
              })}
            </div>
            <button
              className="button button-ghost payment-carousel-nav"
              type="button"
              aria-label="Próxima competência"
              disabled={focusedIndex >= items.length - 1}
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
            <PaymentStatement payment={detail} />
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

function PaymentHighlight({
  label,
  payment,
  empty,
  onOpen,
}: {
  label: string;
  payment: DashboardPayment | null;
  empty: string;
  onOpen: (date: string) => Promise<void>;
}) {
  return (
    <button
      className="payment-highlight payment-highlight-button"
      type="button"
      disabled={!payment}
      onClick={() => payment && void onOpen(payment.payment_date)}
    >
      <span>{label}</span>
      {payment ? (
        <>
          <span className="payment-highlight-value">
            <strong>{formatMoney(payment.total_cents)}</strong>
            <StatusBadge tone={tone(payment.status)}>
              {status(payment.status)}
            </StatusBadge>
          </span>
          <small>
            Vence {formatDate(payment.payment_date)}
          </small>
        </>
      ) : <strong>{empty}</strong>}
    </button>
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
