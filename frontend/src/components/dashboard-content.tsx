"use client";

import { useState } from "react";
import Link from "next/link";
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
    const nextIndex = selectedIndex + step;
    const nextPayment = dashboard.payments[nextIndex];
    if (nextPayment) setStatementDate(nextPayment.payment_date);
  };

  return (
    <div className="dashboard-grid">
      <section className="dashboard-heading">
        <div>
          <p className="eyebrow">RESUMO FINANCEIRO</p>
          <h1>Visão geral</h1>
          <p className="muted">Atualizado em {formatDate(dashboard.today)}</p>
        </div>
      </section>
      <section className="metric-grid" aria-label="Métricas financeiras">
        <Metric
          label="Total ganho"
          value={money(dashboard.earned_cents)}
          detail={`${dashboard.total_lessons} aulas registradas`}
        />
        <Metric
          label="Recebido"
          value={money(dashboard.received_cents)}
          detail="Pagamentos processados"
          success
        />
        <Metric
          label="Aulas normais"
          value={money(dashboard.normal_earned_cents)}
          detail={`${dashboard.normal_lessons} realizadas`}
        />
        <Metric
          label="Aulas extras"
          value={money(dashboard.extra_earned_cents)}
          detail={`${dashboard.extra_lessons} realizadas`}
        />
      </section>
      <section className="future-card">
        <div>
          <p className="eyebrow">PLANEJAMENTO FUTURO</p>
          <strong>{money(dashboard.planned_cents)}</strong>
          <p className="muted">
            {dashboard.future_lessons} aulas futuras · Total planejado:{" "}
            {money(dashboard.total_planned_cents)}
          </p>
        </div>
      </section>
      <section className="panel payment-panel">
        <div className="section-heading">
          <div>
            <h2>Pagamentos em destaque</h2>
            <p className="muted">
              Abra um período para conferir o extrato das aulas.
            </p>
          </div>
          <Link className="button button-ghost" href="/payments">
            Ver todos
          </Link>
        </div>
        <div className="payment-summary">
          <PaymentHighlight
            label="Último pagamento"
            payment={dashboard.last_payment}
            empty="Nenhum pagamento anterior"
            onOpen={openStatement}
          />
          <PaymentHighlight
            label="Próximo pagamento"
            payment={dashboard.next_payment}
            empty="Nenhum pagamento previsto"
            onOpen={openStatement}
          />
        </div>
      </section>
      <section className="panel progress-panel">
        <div className="section-heading">
          <h2>Progresso das turmas</h2>
          <Link className="button button-ghost" href="/classes">
            Gerenciar
          </Link>
        </div>
        {dashboard.progress.length ? (
          <div className="progress-list">
            {dashboard.progress.map((item) => (
              <div className="progress-item" key={item.class_id}>
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {item.completed} de {item.lesson_count} aulas
                  </span>
                </div>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={`Progresso de ${item.name}`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={item.percent}
                >
                  <span style={{ width: `${item.percent}%` }} />
                </div>
                <b>{item.percent}%</b>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Nenhuma turma ativa com progresso.</p>
        )}
      </section>
      <section className="panel relevant-payments">
        <div className="section-heading">
          <div>
            <h2>Pagamentos relevantes</h2>
            <p className="muted">Últimos e próximos períodos do seu extrato.</p>
          </div>
          <Link className="button button-ghost" href="/payments">
            Detalhes
          </Link>
        </div>
        {dashboard.payments.length ? (
          <div className="payment-list">
            {dashboard.payments.slice(0, 5).map((item) => (
              <button
                className="payment-row payment-row-button"
                type="button"
                onClick={() => openStatement(item)}
                key={item.payment_date}
              >
                <div>
                  <strong>{formatDate(item.payment_date)}</strong>
                  <span>
                    {item.lesson_count} aulas · {item.period}
                  </span>
                </div>
                <div>
                  <strong>{money(item.total_cents)}</strong>
                  <StatusBadge tone={paymentTone(item.status)}>
                    {paymentStatus(item.status)}
                  </StatusBadge>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <p className="muted">Ainda não há pagamentos relevantes.</p>
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

function Metric({
  label,
  value,
  detail,
  success = false,
}: {
  label: string;
  value: string;
  detail: string;
  success?: boolean;
}) {
  return (
    <article className={`metric-card${success ? " metric-success" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
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
      <div className="form-actions">
        <Link className="button button-primary" href="/payments">
          Gerenciar recebimento
        </Link>
      </div>
    </div>
  );
}
