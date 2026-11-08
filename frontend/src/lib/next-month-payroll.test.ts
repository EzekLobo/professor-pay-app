import { expect, it } from "vitest";
import { nextMonthPayroll } from "./next-month-payroll";
import type { PayrollPeriod } from "./kodland-payroll";
const sheet = (changes = {}) => ({ id: "one", teacher_id: "22", period_start: "2026-11-01", complete: true, currency: "BRL", earned_cents: 12000, projected_cents: 34000, synced_at: "2026-11-08T12:00:00Z", ...changes }) as PayrollPeriod;
it("includes earned amounts plus projections exactly once for the next payout", () => {
  expect(nextMonthPayroll([sheet(), sheet({ id: "older", synced_at: "2026-11-01T12:00:00Z", earned_cents: 100 })], "2026-11-08")).toMatchObject({ payment_date: "2026-12-15", total_cents: 46000, earned_cents: 12000, projected_cents: 34000 });
});
it("does not substitute a missing official forecast with zero or another period", () => {
  for (const sheets of [[], [sheet({ period_start: "2026-10-01" })], [sheet({ complete: false })], [sheet({ currency: "USD" })], [sheet({ projected_cents: null })]]) expect(nextMonthPayroll(sheets, "2026-11-08").total_cents).toBeNull();
  expect(nextMonthPayroll([sheet({ earned_cents: 0, projected_cents: 0 })], "2026-11-08").total_cents).toBe(0);
});
it("rolls December's teaching month into January's payout", () => {
  expect(nextMonthPayroll([sheet({ period_start: "2026-12-01" })], "2026-12-31")).toMatchObject({ payment_date: "2027-01-15", period: "2026-12", total_cents: 46000 });
});
