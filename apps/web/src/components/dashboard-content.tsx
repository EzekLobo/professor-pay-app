import { StatusBadge } from "./ui";
import type { DashboardPayment, DashboardResponse } from "../lib/api";

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateFormatter = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });
const money = (cents: number) => currency.format(cents / 100);
const formatDate = (value: string) => dateFormatter.format(new Date(`${value}T12:00:00`));
const paymentTone = (status: string) => status === "RECEIVED" ? "success" as const : status === "OVERDUE" ? "danger" as const : "warning" as const;
const paymentStatus = (status: string) => status === "RECEIVED" ? "Recebido" : status === "OVERDUE" ? "Em atraso" : "Previsto";

export type DashboardContentProps = { state: "loading" } | { state: "error"; onRetry: () => void } | { state: "ready"; dashboard: DashboardResponse };

export function DashboardContent(props: DashboardContentProps) {
  if (props.state === "loading") return <section className="dashboard-state" aria-busy="true"><p className="muted">Carregando resumo financeiro…</p></section>;
  if (props.state === "error") return <section className="dashboard-state dashboard-error" role="alert"><h2>Não foi possível carregar o resumo</h2><p className="muted">Confira sua conexão e tente novamente.</p><button className="button button-primary" onClick={props.onRetry}>Tentar novamente</button></section>;
  const { dashboard } = props;
  if (dashboard.total_lessons === 0) return <section className="dashboard-state"><h2>Seu resumo está pronto para começar</h2><p className="muted">Cadastre uma turma ou uma aula extra para acompanhar seus ganhos e pagamentos.</p></section>;
  return <div className="dashboard-grid">
    <section className="dashboard-heading"><div><p className="eyebrow">Resumo financeiro</p><h1>Visão geral</h1><p className="muted">Atualizado em {formatDate(dashboard.today)}</p></div></section>
    <section className="metric-grid" aria-label="Métricas financeiras">
      <Metric label="Total ganho" value={money(dashboard.earned_cents)} detail={`${dashboard.total_lessons} aulas realizadas`} />
      <Metric label="Recebido" value={money(dashboard.received_cents)} detail="Pagamentos confirmados" success />
      <Metric label="Aulas normais" value={money(dashboard.normal_earned_cents)} detail={`${dashboard.normal_lessons} aulas`} />
      <Metric label="Aulas extras" value={money(dashboard.extra_earned_cents)} detail={`${dashboard.extra_lessons} aulas`} />
    </section>
    <section className="future-card"><div><p className="eyebrow">Planejamento futuro</p><strong>{money(dashboard.planned_cents)}</strong><p className="muted">{dashboard.future_lessons} aulas futuras · Total planejado: {money(dashboard.total_planned_cents)}</p></div></section>
    <section className="panel payment-panel"><h2>Pagamentos</h2><div className="payment-summary"><PaymentHighlight label="Último pagamento" payment={dashboard.last_payment} empty="Nenhum pagamento anterior" /><PaymentHighlight label="Próximo pagamento" payment={dashboard.next_payment} empty="Nenhum pagamento previsto" /></div></section>
    <section className="panel progress-panel"><h2>Progresso das turmas</h2>{dashboard.progress.length ? <div className="progress-list">{dashboard.progress.map((item) => <div className="progress-item" key={item.class_id}><div><strong>{item.name}</strong><span>{item.completed} de {item.lesson_count} aulas</span></div><div className="progress-track" role="progressbar" aria-label={`Progresso de ${item.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={item.percent}><span style={{ width: `${item.percent}%` }} /></div><b>{item.percent}%</b></div>)}</div> : <p className="muted">Nenhuma turma ativa com progresso.</p>}</section>
    <section className="panel relevant-payments"><h2>Pagamentos relevantes</h2>{dashboard.payments.length ? <div className="payment-list">{dashboard.payments.slice(0, 5).map((item) => <div className="payment-row" key={item.payment_date}><div><strong>{formatDate(item.payment_date)}</strong><span>{item.lesson_count} aulas · {item.period}</span></div><div><strong>{money(item.total_cents)}</strong><StatusBadge tone={paymentTone(item.status)}>{paymentStatus(item.status)}</StatusBadge></div></div>)}</div> : <p className="muted">Ainda não há pagamentos relevantes.</p>}</section>
  </div>;
}

function Metric({ label, value, detail, success = false }: { label: string; value: string; detail: string; success?: boolean }) { return <article className={`metric-card${success ? " metric-success" : ""}`}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>; }
function PaymentHighlight({ label, payment, empty }: { label: string; payment: DashboardPayment | null; empty: string }) { return <div className="payment-highlight"><span>{label}</span><strong>{payment ? `${formatDate(payment.payment_date)} · ${money(payment.total_cents)}` : empty}</strong>{payment && <StatusBadge tone={paymentTone(payment.status)}>{paymentStatus(payment.status)}</StatusBadge>}</div>; }
