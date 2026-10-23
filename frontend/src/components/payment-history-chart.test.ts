import { describe, expect, it } from "vitest";
import type { DashboardPayment } from "@/lib/api";
import { paymentHistoryMonths } from "./payment-history-chart";

const payment = (payment_date: string, total_cents: number, status: string) => ({ payment_date, total_cents, status }) as DashboardPayment;

describe("histórico mensal de pagamentos", () => {
  it("agrupa por mês de recebimento e separa recebido, previsto e atraso", () => {
    const months = paymentHistoryMonths([
      payment("2026-02-01", 1050, "RECEIVED"),
      payment("2026-02-15", 2050, "RECEIVED"),
      payment("2026-02-20", 3000, "EXPECTED"),
      payment("2026-02-28", 4000, "OVERDUE"),
      payment("2025-02-15", 99999, "RECEIVED"),
    ], "2026");
    expect(months).toHaveLength(12);
    expect(months[1]).toMatchObject({ month: "2026-02", received: 3100, expected: 3000, overdue: 4000 });
    expect(months[0]).toMatchObject({ received: 0, expected: 0, overdue: 0 });
    expect(months[11].month).toBe("2026-12");
  });
  it("mantém meses sem dados e não gera barras negativas", () => {
    expect(paymentHistoryMonths([], "2027").every((month) => month.received + month.expected + month.overdue === 0)).toBe(true);
    expect(paymentHistoryMonths([payment("2026-01-15", -100, "RECEIVED")], "2026")[0].received).toBe(0);
  });
});
