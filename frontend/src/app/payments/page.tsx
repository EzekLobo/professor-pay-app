"use client";
import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
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
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setItems((await paymentsApi.list()).items);
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
          <div className="entity-list">
            {items.map((p) => (
              <button
                className="entity-card"
                key={p.payment_date}
                onClick={() => void open(p.payment_date)}
              >
                <div>
                  <strong>{formatDate(p.payment_date)}</strong>
                  <p className="muted">
                    {p.period} · {p.lesson_count} aula(s)
                  </p>
                </div>
                <div>
                  <strong>{formatMoney(p.total_cents)}</strong>
                  <StatusBadge tone={tone(p.status)}>
                    {status(p.status)}
                  </StatusBadge>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>
      {detail && (
        <section className="panel">
          <div className="section-heading">
            <h2>
              {formatDate(detail.payment_date)} ·{" "}
              {formatMoney(detail.total_cents)}
            </h2>
            <button
              className="button button-ghost"
              onClick={() => setDetail(null)}
            >
              Fechar
            </button>
          </div>
          <div className="entity-list">
            {detail.lessons.map((l) => (
              <div className="entity-card" key={l.id}>
                <span>
                  {l.student} · {formatDate(l.lesson_date)}
                </span>
                <strong>{formatMoney(l.value_cents)}</strong>
              </div>
            ))}
          </div>
          <div className="form-actions">
            {detail.status === "RECEIVED" ? (
              <button
                className="button button-primary"
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
        </section>
      )}
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
