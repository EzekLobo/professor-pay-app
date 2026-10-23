"use client";

import { useState } from "react";
import { Modal } from "@/components/modal";
import { Button } from "@/components/ui";
import type { DashboardPayment } from "@/lib/api";
import { formatMoney } from "@/lib/finance";

export function paymentHistoryMonths(payments: readonly DashboardPayment[], year: string) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(Number(year), index, 1))).replace(".", ""),
    received: 0, overdue: 0, expected: 0, lessons: 0, normal: 0, extras: 0, extraAmount: 0,
  }));
  for (const payment of payments) {
    const month = months.find((item) => item.month === payment.payment_date.slice(0, 7));
    if (!month) continue;
    const amount = Math.max(0, payment.total_cents);
    month.normal += Math.max(0, payment.normal_count ?? 0);
    month.extras += Math.max(0, payment.extra_count ?? 0);
    month.lessons += Math.max(0, payment.lesson_count ?? (payment.normal_count ?? 0) + (payment.extra_count ?? 0));
    month.extraAmount += Math.max(0, payment.extra_total_cents ?? 0);
    if (payment.status === "RECEIVED") month.received += amount;
    else if (payment.status === "OVERDUE") month.overdue += amount;
    else month.expected += amount;
  }
  return months;
}

export function PaymentHistoryChart({ payments, loading }: { payments: readonly DashboardPayment[]; loading: boolean }) {
  const currentYear = new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Sao_Paulo" }).format(new Date());
  const years = [...new Set(payments.map((payment) => payment.payment_date.slice(0, 4)))].sort();
  const [chartType, setChartType] = useState<"bars" | "line" | "donut">("bars");
  const [metric, setMetric] = useState<"money" | "lessons">("money");
  const [details, setDetails] = useState<"year" | string | null>(null);
  const [selection, setSelection] = useState("");
  const year = years.includes(selection) ? selection : years.includes(currentYear) ? currentYear : years[0] ?? currentYear;
  const months = paymentHistoryMonths(payments, year);
  const totalMoney = (month: (typeof months)[number]) => month.received + month.overdue + month.expected;
  const max = Math.max(1, ...months.map((month) => metric === "money" ? totalMoney(month) : month.normal + month.extras));
  const detailedMonths = details === "year" ? months : months.filter((month) => month.month === details);
  const totals = detailedMonths.reduce((sum, month) => ({ lessons: sum.lessons + month.lessons, extras: sum.extras + month.extras, extraAmount: sum.extraAmount + month.extraAmount, amount: sum.amount + totalMoney(month) }), { lessons: 0, extras: 0, extraAmount: 0, amount: 0 });
  const annual = months.reduce((sum, month) => ({ received: sum.received + month.received, expected: sum.expected + month.expected, overdue: sum.overdue + month.overdue, normal: sum.normal + month.normal, extras: sum.extras + month.extras }), { received: 0, expected: 0, overdue: 0, normal: 0, extras: 0 });
  const annualTotal = annual.received + annual.expected + annual.overdue;
  const series = metric === "money"
    ? [{ key: "received" as const, label: "Recebido", color: "#49dca1" }, { key: "expected" as const, label: "Previsto", color: "#6acfff" }, { key: "overdue" as const, label: "Em atraso", color: "#ff8294" }]
    : [{ key: "normal" as const, label: "Regulares", color: "#6acfff" }, { key: "extras" as const, label: "Extras", color: "#b19aff" }];
  const compositionTotal = series.reduce((sum, item) => sum + annual[item.key], 0);
  let offset = 0;
  const slices = series.map((item) => { const from = offset; offset += compositionTotal ? annual[item.key] / compositionTotal * 100 : 0; return `${item.color} ${from}% ${offset}%`; });
  const displayValue = (amount: number) => metric === "money" ? formatMoney(amount) : `${amount} aulas`;
  const compactMoney = (amount: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(amount / 100);
  return <section className="panel payment-history" aria-label="Gráfico de pagamentos" aria-busy={loading}>
    <div className="section-heading"><div><h2>Acompanhamento de pagamentos</h2><p className="muted">Valores e aulas por mês de recebimento.</p></div>{years.length > 0 && <label className="payment-history-year"><span className="sr-only">Ano do gráfico</span><select className="input" value={year} onChange={(event) => setSelection(event.target.value)}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}</div>
    {loading ? <p className="muted" role="status">Carregando gráfico…</p> : payments.length === 0 ? <p className="muted">Seus pagamentos aparecerão aqui quando houver aulas cadastradas.</p> : <>
      <div className="payment-revenue-metrics" aria-label={`Indicadores de faturamento de ${year}`}>
        <div><span>Recebido</span><strong>{formatMoney(annual.received)}</strong></div>
        <div><span>A receber</span><strong>{formatMoney(annual.expected + annual.overdue)}</strong></div>
        <div><span>Em atraso</span><strong>{formatMoney(annual.overdue)}</strong></div>
        <div><span>Percentual recebido</span><strong>{annualTotal ? new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(annual.received / annualTotal) : "—"}</strong></div>
      </div>
      <div className="payment-history-toolbar"><label className="payment-history-metric"><span>Tipo de gráfico</span><select className="input" value={chartType} onChange={(event) => setChartType(event.target.value as typeof chartType)}><option value="bars">Barras</option><option value="line">Linhas</option><option value="donut">Rosca</option></select></label><label className="payment-history-metric"><span>Exibir no gráfico</span><select className="input" value={metric} onChange={(event) => setMetric(event.target.value as "money" | "lessons")}><option value="money">Valores</option><option value="lessons">Quantidade de aulas</option></select></label><Button type="button" className="button-ghost button-small" onClick={() => setDetails("year")}>Ver detalhes</Button></div>
      {chartType !== "donut" && <div className="payment-history-legend">{metric === "money" ? <><span><i className="history-received" />Recebido</span><span><i className="history-expected" />Previsto</span><span><i className="history-overdue" />Em atraso</span><span className="muted">Valores em R$</span></> : <><span><i className="history-expected" />Regulares</span><span><i className="history-extra" />Extras</span></>}</div>}
      {chartType === "bars" ? <div className="payment-history-scroll" tabIndex={0} role="region" aria-label="Evolução mensal de pagamentos e aulas">
        <div className="payment-history-bars">
          {months.map((month) => {
            const total = metric === "money" ? totalMoney(month) : month.normal + month.extras;
            const description = `${month.label} de ${year}: recebido ${formatMoney(month.received)}, previsto ${formatMoney(month.expected)}, em atraso ${formatMoney(month.overdue)}. Total ${formatMoney(totalMoney(month))}. ${month.lessons} aulas, sendo ${month.extras} extras. Abrir detalhes.`;
            return <button type="button" className="payment-history-column" key={month.month} aria-label={description} title={description} onClick={() => setDetails(month.month)}>
              <div className="payment-history-track" aria-hidden="true"><span className="payment-history-total">{total > 0 ? metric === "money" ? compactMoney(total) : total : "—"}</span><div className="payment-history-stack" style={{ height: `${total / max * 100}%` }}>{metric === "money" ? <><span className="history-received" style={{ flex: month.received }} /><span className="history-expected" style={{ flex: month.expected }} /><span className="history-overdue" style={{ flex: month.overdue }} /></> : <><span className="history-expected" style={{ flex: month.normal }} /><span className="history-extra" style={{ flex: month.extras }} /></>}</div></div>
              <span className="payment-history-month" aria-hidden="true">{month.label}</span><span className="payment-history-count" aria-hidden="true"><span>{month.lessons}<span className="payment-history-count-label"> aulas</span></span><span>{month.extras}<span className="payment-history-count-label"> extras</span></span></span>
            </button>;
          })}
        </div>
      </div>
      : chartType === "line" ? <div className="payment-history-scroll" tabIndex={0} role="region" aria-label="Gráfico de evolução mensal; role para ver todos os meses">
        <div className="payment-line-chart">
          <svg viewBox="0 0 720 210" role="img" aria-label={`Evolução mensal de ${metric === "money" ? "recebimentos e valores previstos" : "aulas regulares e extras"} em ${year}`}>
            {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="28" x2="704" y1={180 - fraction * 145} y2={180 - fraction * 145} stroke="#29405b" strokeDasharray="3 5" /><text x="28" y={174 - fraction * 145} fill="#9badc5" fontSize="11">{metric === "money" ? `R$ ${compactMoney(Math.round(max * fraction))}` : Math.round(max * fraction)}</text></g>)}
            {series.filter((item) => annual[item.key] > 0).map((item) => <g key={item.key}><polyline fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" points={months.map((month, index) => `${28 + index * 61},${180 - month[item.key] / max * 145}`).join(" ")} />{months.map((month, index) => <circle key={month.month} cx={28 + index * 61} cy={180 - month[item.key] / max * 145} r="4" fill={item.color}><title>{month.label}: {item.label} {displayValue(month[item.key])}</title></circle>)}</g>)}
          </svg>
          <div className="payment-line-months">{months.map((month) => <button type="button" key={month.month} onClick={() => setDetails(month.month)} aria-label={`Abrir detalhes de ${month.label} de ${year}`}>{month.label}<small>{month.lessons} aulas · {month.extras} extras</small></button>)}</div>
        </div>
      </div> : <div className="payment-composition">
        <div className="payment-donut" role="img" aria-label={`Composição de ${year}: ${series.map((item) => `${item.label} ${displayValue(annual[item.key])}`).join(", ")}`} style={{ background: compositionTotal ? `conic-gradient(${slices.join(", ")})` : "#29405b" }}><div><small>Total de {year}</small><strong>{displayValue(compositionTotal)}</strong></div></div>
        <ul>{series.map((item) => <li key={item.key}><span><i style={{ background: item.color }} />{item.label}</span><strong>{displayValue(annual[item.key])}</strong><small>{compositionTotal ? new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(annual[item.key] / compositionTotal) : "—"}</small></li>)}</ul>
      </div>}
      <p className="muted payment-history-hint">{chartType === "donut" ? "Composição do ano selecionado. Abra os detalhes para consultar cada mês." : "Abaixo de cada mês: aulas e extras. Selecione um mês para ver detalhes."} Quantidades pelo mês de recebimento, incluindo aulas previstas.</p>
      <Modal open={details !== null} title={details === "year" ? `Detalhes dos pagamentos · ${year}` : `Detalhes do mês · ${details?.split("-").reverse().join("/") ?? ""}`} onClose={() => setDetails(null)} className="payment-history-modal">
        <p className="muted">Quantidades vinculadas aos pagamentos; não representam apenas aulas já realizadas. Extras estão incluídas no total de aulas.</p>
        <div className="payment-history-summary">
          <div><span>Aulas</span><strong>{totals.lessons}</strong></div><div><span>Aulas extras</span><strong>{totals.extras}</strong></div><div><span>Valor das extras</span><strong>{formatMoney(totals.extraAmount)}</strong></div><div><span>Valor médio por aula</span><strong>{totals.lessons ? formatMoney(Math.round(totals.amount / totals.lessons)) : "—"}</strong></div>
        </div>
        <div className="payment-history-values payment-history-table-scroll" tabIndex={0} role="region" aria-label="Detalhamento mensal; role para ver todas as colunas"><table><caption className="sr-only">Detalhamento de aulas e pagamentos de {year}</caption><thead><tr><th scope="col">Mês</th><th scope="col">Aulas</th><th scope="col">Extras</th><th scope="col">Valor extras</th><th scope="col">Total</th><th scope="col">Recebido</th><th scope="col">Previsto</th><th scope="col">Em atraso</th></tr></thead><tbody>{detailedMonths.map((month) => <tr key={month.month}><th scope="row">{month.label}</th><td>{month.lessons}</td><td>{month.extras}</td><td>{formatMoney(month.extraAmount)}</td><td>{formatMoney(totalMoney(month))}</td><td>{formatMoney(month.received)}</td><td>{formatMoney(month.expected)}</td><td>{formatMoney(month.overdue)}</td></tr>)}</tbody></table></div>
      </Modal>
    </>}
  </section>;
}
