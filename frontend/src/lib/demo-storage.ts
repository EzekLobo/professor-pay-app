import { demoFinancialLessonId, type DemoSnapshot } from "./demo-snapshot";
import type { CustomHoliday } from "./holidays";
import { isIsoDate } from "./holidays";
export const DEMO_STATE_KEY = "nexusclass.demo.v2";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

/** Restore only local actions. The seed owns identities, courses and links. */
export function restoreDemoState(seed: DemoSnapshot, serialized: string | null): { snapshot: DemoSnapshot; holidays: CustomHoliday[] } {
  const fallback = { snapshot: seed, holidays: [] as CustomHoliday[] };
  if (!serialized) return fallback;
  try {
    const stored = object(JSON.parse(serialized));
    const raw = object(stored.snapshot);
    if (stored.version !== 2 || raw.today !== seed.today) return fallback;
    const financialStatus = Object.fromEntries(Object.entries(object(raw.financialStatus)).filter(([id, value]) => seed.lessons.some((lesson) => lesson.id === id || demoFinancialLessonId(lesson) === id) && ["", "BILLABLE", "HOLIDAY", "SUBSTITUTION", "CANCELED"].includes(String(value))).map(([id, value]) => { const legacy = seed.lessons.find((lesson) => lesson.id === id); return [legacy ? demoFinancialLessonId(legacy) : id, value]; }));
    const paymentStatus = Object.fromEntries(Object.entries(object(raw.paymentStatus)).filter(([date, value]) => isIsoDate(date) && ["RECEIVED", "OVERDUE"].includes(String(value)))) as DemoSnapshot["paymentStatus"];
    const extraData = Array.isArray(raw.extras) ? raw.extras.map(object) : [];
    const reviewIds = Array.isArray(raw.reviews) ? new Set(raw.reviews.map((item) => object(item).id)) : new Set(seed.reviews.map((item) => item.id));
    const extras = seed.extras.map((extra) => { const saved = extraData.find((item) => item.id === extra.id); return saved && ["PENDING", "ACCOUNTED", "DONE"].includes(String(saved.manual_status)) ? { ...extra, manual_status: saved.manual_status as typeof extra.manual_status, completed: saved.manual_status === "DONE" } : extra; });
    const additionalExtras = Array.isArray(raw.additionalExtras) ? raw.additionalExtras.map(object).filter((item) => typeof item.id === "string" && item.id.startsWith("demo-added-") && typeof item.student === "string" && isIsoDate(item.lesson_date) && isIsoDate(item.payment_date) && typeof item.duration_minutes === "number" && item.duration_minutes > 0 && typeof item.hourly_rate_cents === "number" && item.hourly_rate_cents >= 0 && Number.isFinite(item.hourly_rate_cents)).map((item) => ({ id: String(item.id), class_id: null, class_name_snapshot: "Aula extra", number: 0, lesson_date: String(item.lesson_date), student: String(item.student).slice(0, 200), type: "EXTRA", duration_minutes: Number(item.duration_minutes), hourly_rate_cents: Number(item.hourly_rate_cents), period: String(item.lesson_date).slice(0, 7), payment_date: String(item.payment_date), value_cents: Math.round(Number(item.duration_minutes) / 60 * Number(item.hourly_rate_cents)), status: "COMPLETED" })) : [];
    const holidays: CustomHoliday[] = Array.isArray(stored.holidays) ? stored.holidays.map(object).filter((item) => isIsoDate(item.date) && typeof item.name === "string" && item.name.trim()).map((item) => ({ id: `demo-holiday-${item.date}`, date: String(item.date), name: String(item.name).slice(0, 120), source: "CUSTOM", affects_financial_total: true, created_at: seed.today, updated_at: seed.today })) : [];
    return { snapshot: { ...seed, financialStatus: financialStatus as DemoSnapshot["financialStatus"], paymentStatus, extras, reviews: seed.reviews.filter((review) => reviewIds.has(review.id)), additionalExtras }, holidays };
  } catch { return fallback; }
}
