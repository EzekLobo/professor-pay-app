"use client";
import { useCallback, useEffect, useState } from "react";
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
function Content() {
  const [items, setItems] = useState<DashboardPayment[]>([]),
    [detail, setDetail] = useState<PaymentDetail | null>(null),
    [focusedPaymentDate, setFocusedPaymentDate] = useState<string | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
        <h2>Competências mensais</h2>
        {loading ? (
          <p className="muted">Carregando…</p>
        ) : items.length === 0 ? (
          <p className="muted">
            Sincronize a Kodland para importar o cronograma das turmas.
          </p>
        ) : (
          <div className="payment-carousel" aria-label="Carrossel de competências mensais">
            <button
              className="button button-ghost payment-carousel-nav"
              type="button"
              aria-label="Competência anterior"
              disabled={focusedIndex <= 0}
              onClick={() =>
                setFocusedPaymentDate(items[focusedIndex - 1]?.payment_date ?? null)
              }
            >
              ←
            </button>
            <div className="payment-carousel-track">
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
                      isFocus
                        ? `Abrir extrato de ${payment.period}`
                        : `Focar competência ${payment.period}`
                    }
                    onClick={() =>
                      isFocus
                        ? void open(payment.payment_date)
                        : setFocusedPaymentDate(payment.payment_date)
                    }
                  >
                    <span>{isFocus ? "Em foco" : "Competência"}</span>
                    <strong>{formatDate(payment.payment_date)}</strong>
                    <small>
                      {payment.period} · {payment.lesson_count} aula(s)
                    </small>
                    <span className="payment-carousel-value">
                      <b>{formatMoney(payment.total_cents)}</b>
                      <StatusBadge tone={tone(payment.status)}>
                        {status(payment.status)}
                      </StatusBadge>
                    </span>
                    {isFocus && <em>Abrir extrato</em>}
                  </button>
                );
              })}
            </div>
            <button
              className="button button-ghost payment-carousel-nav"
              type="button"
              aria-label="Próxima competência"
              disabled={focusedIndex >= items.length - 1}
              onClick={() =>
                setFocusedPaymentDate(items[focusedIndex + 1]?.payment_date ?? null)
              }
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
