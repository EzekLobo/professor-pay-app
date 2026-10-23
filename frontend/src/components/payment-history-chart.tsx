"use client";

import { useState } from "react";
import type { DashboardPayment } from "@/lib/api";
import { formatMoney } from "@/lib/finance";

export function paymentHistoryMonths(payments: readonly DashboardPayment[], year: string) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(Number(year), index, 1))).replace(".", ""),
    received: 0, overdue: 0, expected: 0,
  }));
  for (const payment of payments) {
    const month = months.find((item) => item.month === payment.payment_date.slice(0, 7));
    if (!month) continue;
    const amount = Math.max(0, payment.total_cents);
    if (payment.status === "RECEIVED") month.received += amount;
    else if (payment.status === "OVERDUE") month.overdue += amount;
    else month.expected += amount;
  }
  return months;
}

export function PaymentHistoryChart({ payments, loading }: { payments: readonly DashboardPayment[]; loading: boolean }) {
  const currentYear = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date());
  const years = [...new Set(payments.map((payment) => payment.payment_date.slice(0, 4)))].sort();
  const [selection, setSelection] = useState("");
  const year = years.includes(selection) ? selection : years.includes(currentYear) ? currentYear : years[0] ?? currentYear;
  const months = paymentHistoryMonths(payments, year);
  const max = Math.max(1, ...months.map((month) => month.received + month.overdue + month.expected));
  const compactMoney = (amount: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(amount / 100);
  return <section className="panel payment-history" aria-label="Gráfico de pagamentos" aria-busy={loading}>
    <div className="section-heading"><div><h2>Pagamentos por mês</h2><p className="muted">Valores por mês de recebimento.</p></div>{years.length > 0 && <label className="payment-history-year"><span className="sr-only">Ano do gráfico</span><select className="input" value={year} onChange={(event) => setSelection(event.target.value)}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}</div>
    {loading ? <p className="muted" role="status">Carregando gráfico…</p> : payments.length === 0 ? <p className="muted">Seus pagamentos aparecerão aqui quando houver aulas cadastradas.</p> : <>
      <div className="payment-history-legend"><span><i className="history-received" />Recebido</span><span><i className="history-expected" />Previsto</span><span><i className="history-overdue" />Em atraso</span><span className="muted">Valores em R$</span></div>
      <div className="payment-history-scroll" tabIndex={0} role="region" aria-label="Evolução mensal; role horizontalmente para ver todos os meses">
        <div className="payment-history-bars">
          {months.map((month) => {
            const total = month.received + month.overdue + month.expected;
            const description = `${month.label} de ${year}: recebido ${formatMoney(month.received)}, previsto ${formatMoney(month.expected)}, em atraso ${formatMoney(month.overdue)}. Total ${formatMoney(total)}.`;
            return <div className="payment-history-column" key={month.month} tabIndex={0} role="img" aria-label={description} title={description}>
              <div className="payment-history-track" aria-hidden="true"><span className="payment-history-total">{total > 0 ? compactMoney(total) : "—"}</span><div className="payment-history-stack" style={{ height: `${total / max * 100}%` }}><span className="history-received" style={{ flex: month.received }} /><span className="history-expected" style={{ flex: month.expected }} /><span className="history-overdue" style={{ flex: month.overdue }} /></div></div>
              <span className="payment-history-month" aria-hidden="true">{month.label}</span>
            </div>;
          })}
        </div>
      </div>
      <details className="payment-history-values"><summary>Ver valores</summary><div className="payment-history-table-scroll"><table><caption className="sr-only">Pagamentos por mês de {year}</caption><thead><tr><th scope="col">Mês</th><th scope="col">Recebido</th><th scope="col">Previsto</th><th scope="col">Em atraso</th></tr></thead><tbody>{months.map((month) => <tr key={month.month}><th scope="row">{month.label}</th><td>{formatMoney(month.received)}</td><td>{formatMoney(month.expected)}</td><td>{formatMoney(month.overdue)}</td></tr>)}</tbody></table></div></details>
    </>}
  </section>;
}
