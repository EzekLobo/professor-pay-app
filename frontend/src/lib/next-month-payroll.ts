import type { PayrollPeriod } from "./kodland-payroll";
import { nextMonthPaymentDate } from "./teaching-finance";
export type NextMonthPayroll = { payment_date: string; period: string; total_cents: number | null; earned_cents: number | null; projected_cents: number | null; synced_at: string | null };
/** Provider amounts already include bonuses/corrections in earned_cents. */
export function nextMonthPayroll(periods: readonly PayrollPeriod[], today: string): NextMonthPayroll {
  const period = today.slice(0, 7);
  const valid = periods.filter(item => item.period_start === `${period}-01` && item.complete && item.currency === "BRL" && Number.isSafeInteger(item.earned_cents) && Number.isSafeInteger(item.projected_cents));
  const sheet = [...valid].sort((a, b) => b.synced_at.localeCompare(a.synced_at))[0];
  return { payment_date: nextMonthPaymentDate(today), period, total_cents: sheet ? sheet.earned_cents! + sheet.projected_cents! : null, earned_cents: sheet?.earned_cents ?? null, projected_cents: sheet?.projected_cents ?? null, synced_at: sheet?.synced_at ?? null };
}
