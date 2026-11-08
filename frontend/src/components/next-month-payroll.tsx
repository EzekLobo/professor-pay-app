import { formatMoney } from "@/lib/finance";
import type { NextMonthPayroll } from "@/lib/next-month-payroll";
export function NextMonthPayrollCard({ forecast }: { forecast?: NextMonthPayroll }) {
  const label = forecast ? new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(new Date(`${forecast.payment_date}T12:00:00Z`)) : "próximo mês";
  return <article className="metric-card" aria-label="Saldo previsto para o próximo mês"><span>Previsto para {label}</span><strong>{forecast?.total_cents != null ? formatMoney(forecast.total_cents) : "Ainda não informado"}</strong><small>{forecast?.total_cents != null ? "Folha Kodland: contabilizado + aulas previstas" : "Aguardando a folha prevista da Kodland"}</small></article>;
}
