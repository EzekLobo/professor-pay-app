"use client";
import { ChartNoAxesCombined } from "lucide-react";

import { useId, useState } from "react";
import { createPortal } from "react-dom";
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
  const tooltipId = useId();
  const [tooltip, setTooltip] = useState<{ key: string; heading: string; rows: { label: string; value: string }[]; x: number; y: number } | null>(null);
  const showTooltip = (element: Element, key: string, heading: string, rows: { label: string; value: string }[]) => {
    const rect = element.getBoundingClientRect();
    const x = Math.max(12, Math.min(rect.left + rect.width / 2 - 120, window.innerWidth - 252));
    const height = 52 + rows.length * 26;
    const y = rect.top >= height + 16 ? rect.top - height - 8 : Math.min(rect.bottom + 8, Math.max(12, window.innerHeight - height - 12));
    setTooltip({ key, heading, rows, x, y });
  };
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
  const series = metric === "money"
    ? [{ key: "received" as const, label: "Recebido", color: "#49dca1" }, { key: "expected" as const, label: "Previsto", color: "#6acfff" }, { key: "overdue" as const, label: "Em atraso", color: "#ff8294" }]
    : [{ key: "normal" as const, label: "Regulares", color: "#6acfff" }, { key: "extras" as const, label: "Extras", color: "#b19aff" }];
  const compositionTotal = series.reduce((sum, item) => sum + annual[item.key], 0);
  let offset = 0;
  const slices = series.map((item) => { const from = offset; offset += compositionTotal ? annual[item.key] / compositionTotal * 100 : 0; return `${item.color} ${from}% ${offset}%`; });
  const displayValue = (amount: number) => metric === "money" ? formatMoney(amount) : `${amount} aulas`;
  const compactMoney = (amount: number) => new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(amount / 100);
  const monthTooltip = (element: Element, month: (typeof months)[number]) => showTooltip(element, month.month, `${month.label} de ${year}`, [
    ...series.map((item) => ({ label: item.label, value: displayValue(month[item.key]) })),
    { label: "Total", value: metric === "money" ? formatMoney(totalMoney(month)) : `${month.lessons} aulas` },
  ]);
  const seriesTooltip = (element: Element, item: (typeof series)[number]) => showTooltip(element, item.key, `${item.label} · ${year}`, [
    { label: metric === "money" ? "Valor" : "Quantidade", value: displayValue(annual[item.key]) },
    { label: "Participação", value: compositionTotal ? new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(annual[item.key] / compositionTotal) : "—" },
  ]);
  const renderPlot = (type: typeof chartType) => (type === "bars" ? <div className="payment-history-scroll" tabIndex={0} role="region" aria-label="Evolução mensal de pagamentos e aulas">
        <div className="payment-bars-plot"><div className="payment-chart-axis" aria-hidden="true"><span>{metric === "money" ? `R$ ${compactMoney(max)}` : max}</span><span>{metric === "money" ? compactMoney(Math.round(max / 2)) : Math.round(max / 2)}</span><span>0</span></div><div className="payment-history-bars">
          {months.map((month) => {
            const total = metric === "money" ? totalMoney(month) : month.normal + month.extras;
            const description = `${month.label} de ${year}: recebido ${formatMoney(month.received)}, previsto ${formatMoney(month.expected)}, em atraso ${formatMoney(month.overdue)}. Total ${formatMoney(totalMoney(month))}. ${month.lessons} aulas, sendo ${month.extras} extras. Abrir detalhes.`;
            return <button type="button" className="payment-history-column" key={month.month} aria-label={description} aria-describedby={tooltip?.key === month.month ? tooltipId : undefined} onMouseEnter={(event) => monthTooltip(event.currentTarget, month)} onMouseLeave={() => setTooltip(null)} onFocus={(event) => monthTooltip(event.currentTarget, month)} onBlur={() => setTooltip(null)} onClick={() => { setTooltip(null); setDetails(month.month); }}>
              <div className="payment-history-track" aria-hidden="true"><div className="payment-history-stack" style={{ height: `${total / max * 100}%` }}>{metric === "money" ? <><span className="history-received" style={{ flex: month.received }} /><span className="history-expected" style={{ flex: month.expected }} /><span className="history-overdue" style={{ flex: month.overdue }} /></> : <><span className="history-expected" style={{ flex: month.normal }} /><span className="history-extra" style={{ flex: month.extras }} /></>}</div></div>
              <span className="payment-history-month" aria-hidden="true">{month.label}</span>
            </button>;
          })}
        </div></div>
      </div>
      : type === "line" ? <div className="payment-history-scroll" tabIndex={0} role="region" aria-label="Gráfico de evolução mensal; role para ver todos os meses">
        <div className="payment-line-chart">
          <svg viewBox="0 0 720 210" role="img" aria-label={`Evolução mensal de ${metric === "money" ? "recebimentos e valores previstos" : "aulas regulares e extras"} em ${year}`}>
            {[0, .5, 1].map((fraction) => <g key={fraction}><line x1="28" x2="704" y1={180 - fraction * 145} y2={180 - fraction * 145} stroke="#29405b" strokeDasharray="3 5" /><text x="28" y={174 - fraction * 145} fill="#9badc5" fontSize="11">{metric === "money" ? `R$ ${compactMoney(Math.round(max * fraction))}` : Math.round(max * fraction)}</text></g>)}
            {series.filter((item) => annual[item.key] > 0).map((item) => <g key={item.key}><polyline fill="none" stroke={item.color} strokeWidth="3" strokeLinejoin="round" points={months.map((month, index) => `${28 + index * 61},${180 - month[item.key] / max * 145}`).join(" ")} />{months.map((month, index) => <circle key={month.month} cx={28 + index * 61} cy={180 - month[item.key] / max * 145} r="4" fill={item.color} stroke="transparent" strokeWidth="12" onMouseEnter={(event) => showTooltip(event.currentTarget, `${month.month}-${item.key}`, `${month.label} de ${year}`, [{ label: item.label, value: displayValue(month[item.key]) }])} onMouseLeave={() => setTooltip(null)} />)}</g>)}
          </svg>
          <div className="payment-line-months">{months.map((month) => <button type="button" key={month.month} onMouseEnter={(event) => monthTooltip(event.currentTarget, month)} onMouseLeave={() => setTooltip(null)} onFocus={(event) => monthTooltip(event.currentTarget, month)} onBlur={() => setTooltip(null)} aria-describedby={tooltip?.key === month.month ? tooltipId : undefined} onClick={() => { setTooltip(null); setDetails(month.month); }} aria-label={`Abrir detalhes de ${month.label} de ${year}`}>{month.label}</button>)}</div>
        </div>
      </div> : <div className="payment-composition">
        <div className="payment-donut" onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const dx = event.clientX - rect.left - rect.width / 2;
          const dy = event.clientY - rect.top - rect.height / 2;
          const radius = Math.hypot(dx, dy) / (rect.width / 2);
          if (!compositionTotal || radius < .72 || radius > 1) { setTooltip(null); return; }
          const angle = (Math.atan2(dx, -dy) + Math.PI * 2) % (Math.PI * 2);
          const value = angle / (Math.PI * 2) * compositionTotal;
          let boundary = 0;
          const item = series.find((entry) => { boundary += annual[entry.key]; return value < boundary; });
          if (item) seriesTooltip(event.currentTarget, item);
        }} onMouseLeave={() => setTooltip(null)} role="img" aria-label={`Composição de ${year}: ${series.map((item) => `${item.label} ${displayValue(annual[item.key])}`).join(", ")}`} style={{ background: compositionTotal ? `conic-gradient(${slices.join(", ")})` : "#29405b" }}><div><small>Total de {year}</small><strong>{displayValue(compositionTotal)}</strong></div></div>
        <ul>{series.map((item) => <li key={item.key} tabIndex={0} aria-describedby={tooltip?.key === item.key ? tooltipId : undefined} onMouseEnter={(event) => seriesTooltip(event.currentTarget, item)} onMouseLeave={() => setTooltip(null)} onFocus={(event) => seriesTooltip(event.currentTarget, item)} onBlur={() => setTooltip(null)}><span><i style={{ background: item.color }} />{item.label}</span><small>{compositionTotal ? new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(annual[item.key] / compositionTotal) : "—"}</small></li>)}</ul>
      </div>);
  return <section onKeyDown={(event) => { if (event.key === "Escape") setTooltip(null); }} className="panel payment-history" aria-label="Gráfico de pagamentos" aria-busy={loading}>
    <div className="section-heading payment-history-heading"><h2>Evolução dos pagamentos</h2><div className="payment-history-toolbar">{years.length > 0 && <label className="payment-history-year"><span className="sr-only">Ano do gráfico</span><select className="input" value={year} onChange={(event) => { setTooltip(null); setSelection(event.target.value); }}>{years.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>}<label className="payment-history-metric"><span className="sr-only">Tipo de gráfico</span><select className="input" value={chartType} onChange={(event) => { setTooltip(null); setChartType(event.target.value as typeof chartType); }}><option value="bars">Barras</option><option value="line">Linhas</option><option value="donut">Rosca</option></select></label><label className="payment-history-metric"><span className="sr-only">Exibir no gráfico</span><select className="input" value={metric} onChange={(event) => { setTooltip(null); setMetric(event.target.value as "money" | "lessons"); }}><option value="money">Valores</option><option value="lessons">Aulas</option></select></label><Button type="button" className="button-ghost button-small symbol-action" aria-label="Ver detalhes" title="Ver detalhes dos pagamentos" onClick={() => setDetails("year")}><ChartNoAxesCombined size={18} aria-hidden="true" /></Button></div></div>
    {loading ? <p className="muted" role="status">Carregando gráfico…</p> : payments.length === 0 ? <p className="muted">Seus pagamentos aparecerão aqui quando houver aulas cadastradas.</p> : <>

      <div className="payment-history-legend">{metric === "money" ? <><span><i className="history-received" />Recebido</span><span><i className="history-expected" />Previsto</span><span><i className="history-overdue" />Em atraso</span></> : <><span><i className="history-expected" />Regulares</span><span><i className="history-extra" />Extras</span></>}</div>
      <div className="payment-history-visuals">
        <div className="payment-primary-visual"><div className="payment-plot-frame">{renderPlot(chartType)}</div></div>
        <aside className="payment-secondary-visual" aria-label="Gráfico complementar"><h3>{chartType === "donut" ? "Evolução mensal" : "Composição do ano"}</h3><div className="payment-plot-frame">{renderPlot(chartType === "donut" ? "line" : "donut")}</div></aside>
      </div>

      {tooltip && details === null && createPortal(<div id={tooltipId} role="tooltip" className="payment-chart-tooltip" style={{ left: tooltip.x, top: tooltip.y }}><strong>{tooltip.heading}</strong>{tooltip.rows.map((row) => <div key={row.label}><span>{row.label}</span><b>{row.value}</b></div>)}</div>, document.body)}
      <Modal open={details !== null} title={details === "year" ? `Detalhes dos pagamentos · ${year}` : `Detalhes do mês · ${details?.split("-").reverse().join("/") ?? ""}`} onClose={() => setDetails(null)} className="payment-history-modal">
        <p className="muted">Quantidades vinculadas aos pagamentos; não representam apenas aulas já realizadas. Extras estão incluídas no total de aulas.</p>
        <div className="payment-revenue-metrics">
          <div><span>Recebido</span><strong>{formatMoney(detailedMonths.reduce((sum, month) => sum + month.received, 0))}</strong></div>
          <div><span>A receber</span><strong>{formatMoney(detailedMonths.reduce((sum, month) => sum + month.expected + month.overdue, 0))}</strong></div>
          <div><span>Em atraso</span><strong>{formatMoney(detailedMonths.reduce((sum, month) => sum + month.overdue, 0))}</strong></div>
          <div><span>Percentual recebido</span><strong>{totals.amount ? new Intl.NumberFormat("pt-BR", { style: "percent", maximumFractionDigits: 1 }).format(detailedMonths.reduce((sum, month) => sum + month.received, 0) / totals.amount) : "—"}</strong></div>
        </div>
        <div className="payment-history-summary">
          <div><span>Aulas</span><strong>{totals.lessons}</strong></div><div><span>Aulas extras</span><strong>{totals.extras}</strong></div><div><span>Valor das extras</span><strong>{formatMoney(totals.extraAmount)}</strong></div><div><span>Valor médio por aula</span><strong>{totals.lessons ? formatMoney(Math.round(totals.amount / totals.lessons)) : "—"}</strong></div>
        </div>
        <div className="payment-history-values payment-history-table-scroll" tabIndex={0} role="region" aria-label="Detalhamento mensal; role para ver todas as colunas"><table><caption className="sr-only">Detalhamento de aulas e pagamentos de {year}</caption><thead><tr><th scope="col">Mês</th><th scope="col">Aulas</th><th scope="col">Extras</th><th scope="col">Valor extras</th><th scope="col">Total</th><th scope="col">Recebido</th><th scope="col">Previsto</th><th scope="col">Em atraso</th></tr></thead><tbody>{detailedMonths.map((month) => <tr key={month.month}><th scope="row">{month.label}</th><td>{month.lessons}</td><td>{month.extras}</td><td>{formatMoney(month.extraAmount)}</td><td>{formatMoney(totalMoney(month))}</td><td>{formatMoney(month.received)}</td><td>{formatMoney(month.expected)}</td><td>{formatMoney(month.overdue)}</td></tr>)}</tbody></table></div>
      </Modal>
    </>}
  </section>;
}
