import { describe, expect, it } from "vitest";
import { calculateDashboard, type PayrollState } from "./api";
import { normalizePayroll, payrollCents } from "./kodland-payroll";

const raw = {
  id: 12, teacher: 22, period_start: "2026-10-01", approval_status: "approved",
  payout_currency: "BRL", local_currency: "BRL", payout_amount: "45.00",
  total_payable_amount_local: "45.00", bonus_amount: "0", corrections_amount: "0",
  projected_lessons: 1, projected_amount_local: "30.00", projected_local_currency: "BRL",
  total_minutes: 90, payable_lessons: 1,
  entries: [
    { id: 1, group: 2, group_title: "Turma", lesson_started_at: "2026-10-06T23:00:00Z", lesson_tz: "America/Sao_Paulo", lesson_kind: "regular", lesson_length_minutes: 90, actual_minutes: 100, amount: "45.00", currency: "BRL", status: "calculated" },
    { id: 2, group: 2, group_title: "Turma", lesson_started_at: "2026-10-27T23:00:00Z", lesson_tz: "America/Sao_Paulo", lesson_kind: "extra", lesson_length_minutes: 60, amount: "30.00", currency: "BRL", status: "projected" },
  ],
};
const sheet = () => normalizePayroll(raw, raw, "22");
const calculate = (mode: PayrollState["mode"], confirmations: { id: string; [key: string]: unknown }[] = []) => calculateDashboard(
  [], [{ id: "own", lesson_date: "2026-10-10", class_name_snapshot: "Particular", type: "NORMAL", duration_minutes: 60, hourly_rate_cents: 1000 }], confirmations,
  [{ id: "g", external_id: "2", title: "Turma", start_date: "2026-10-06", course_name: "4 L 90 min" }], [], "2026-10-25", [], [], [], [], [], [],
  { periods: [sheet()], teacher_id: "22", mode, last_sync: "2026-10-25" },
);

describe("official payroll", () => {
  it("parses decimal money without silently turning missing amounts into zero", () => {
    expect(payrollCents("1234.56")).toBe(123456);
    expect(payrollCents("-3.50")).toBe(-350);
    expect(payrollCents(null)).toBeNull();
    expect(payrollCents("1.234")).toBeNull();
  });
  it("separates projected and earned, preserves dates and ignores unrelated data", () => {
    const period = sheet();
    expect(period).toMatchObject({ complete: true, earned_cents: 4500, projected_cents: 3000, teacher_id: "22" });
    expect(period.entries[0]).toMatchObject({ lesson_date: "2026-10-06", planned_minutes: 90, actual_minutes: 100 });
    expect(() => normalizePayroll(raw, raw, "other")).toThrow("não pertence");
  });
  it("blocks inconsistent totals, missing values and incompatible currencies", () => {
    expect(normalizePayroll(raw, { ...raw, payout_amount: "99.00" }, "22").complete).toBe(false);
    expect(normalizePayroll(raw, { ...raw, payout_currency: "USD" }, "22").complete).toBe(false);
    expect(normalizePayroll(raw, { ...raw, projected_amount_local: null }, "22").complete).toBe(false);
    expect(normalizePayroll(raw, { ...raw, entries: [raw.entries[0], raw.entries[0]] }, "22").complete).toBe(false);
  });
  it("replaces only Kodland projections, keeps own income and does not infer receipt from approval", () => {
    const dashboard = calculate("official");
    const payment = dashboard.payments.find(p => p.payment_date === "2026-11-15")!;
    expect(payment.total_cents).toBe(8500);
    expect(payment.status).toBe("FUTURE");
    expect(payment.lesson_count).toBe(3);
    expect(payment.lessons.filter(l => l.source === "kodland_payroll")).toHaveLength(2);
    expect(calculate("comparison").payments.find(p => p.payment_date === "2026-11-15")!.total_cents).not.toBe(8500);
  });
  it("never rewrites a received payment snapshot", () => {
    const dashboard = calculate("official", [{ id: "2026-11-15", payment_date: "2026-11-15", status: "RECEIVED", payment_snapshot: { payment_date: "2026-11-15", total_cents: 12345, lessons: [], status: "RECEIVED" } }]);
    expect(dashboard.payments.find(p => p.payment_date === "2026-11-15")).toMatchObject({ total_cents: 12345, status: "RECEIVED", payroll: [{ received_locked: true, applied: false }] });
  });
});
