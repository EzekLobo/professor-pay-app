"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { StatusBadge } from "./ui";
import type { DashboardPayment, DashboardResponse } from "@/lib/api";

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
  | { state: "ready"; dashboard: DashboardResponse };

export function DashboardContent(props: DashboardContentProps) {
  const [statementDate, setStatementDate] = useState<string | null>(null);
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
  const { dashboard } = props;
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
          <PaymentStatement
            payment={selectedPayment}
            index={selectedIndex}
            total={dashboard.payments.length}
            onMove={moveStatement}
          />
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

function PaymentStatement({
  payment,
  index,
  total,
  onMove,
}: {
  payment: DashboardPayment;
  index: number;
  total: number;
  onMove: (step: number) => void;
}) {
  return (
    <div className="payment-statement">
      <div className="payment-statement-summary">
        <div>
          <span className="muted">Competência</span>
          <strong>{payment.period}</strong>
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
        <span className="muted">{payment.lesson_count} registro(s)</span>
      </div>
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
              </div>
              <strong>{money(lesson.value_cents)}</strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">Nenhuma aula detalhada nesta competência.</p>
      )}
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
    </div>
  );
}
