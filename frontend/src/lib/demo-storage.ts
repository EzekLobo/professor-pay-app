import { demoFinancialLessonId, type DemoSnapshot } from "./demo-snapshot";
import type { CustomHoliday } from "./holidays";
import { isIsoDate } from "./holidays";
import { isHttpUrl } from "./manual-pedagogy";
import type { ManualActivity, ManualLessonContent } from "./manual-pedagogy";
import type { KodlandClassSettings, ManualClass, ManualStudent } from "./manual-teaching";
import type { RatePeriod, WeeklySlot } from "./teaching-finance";
import { generateRecurringOccurrences } from "./teaching-finance";
export const DEMO_STATE_KEY = "nexusclass.demo.v2";
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const array = (value: unknown, limit = 200) => Array.isArray(value) ? value.slice(0, limit) as unknown[] : [];
const localId = (value: unknown) => typeof value === "string" && value.startsWith("demo-manual-") && value.length < 100;
const validRate = (value: unknown) => value === null || Number.isInteger(value) && Number(value) > 0 && Number(value) < 100000000;
const rateHistory = (value: unknown): RatePeriod[] => array(value).map(object).filter((item) => isIsoDate(item.effective_from) && validRate(item.hourly_rate_cents)).map((item) => ({ effective_from: String(item.effective_from), effective_from_local: typeof item.effective_from_local === "string" ? item.effective_from_local : undefined, hourly_rate_cents: item.hourly_rate_cents as number | null }));
const slotRows = (value: unknown): WeeklySlot[] => array(value, 20).map(object).filter((item) => typeof item.id === "string" && Number.isInteger(item.week_day) && Number(item.week_day) >= 0 && Number(item.week_day) <= 6 && /^([01]\d|2[0-3]):[0-5]\d$/.test(String(item.start_time)) && Number.isInteger(item.duration_minutes) && Number(item.duration_minutes) > 0 && Number(item.duration_minutes) <= 1440 && isIsoDate(item.effective_from) && (!item.effective_until || isIsoDate(item.effective_until))).map((item) => ({ id: String(item.id), week_day: Number(item.week_day), start_time: String(item.start_time), duration_minutes: Number(item.duration_minutes), effective_from: String(item.effective_from), effective_until: item.effective_until ? String(item.effective_until) : null }));

export function restoreManualDemoData(raw: Record<string, unknown>, seed: DemoSnapshot): Pick<DemoSnapshot, "manualClasses" | "manualStudents" | "manualLessons" | "manualActivities" | "defaultRateHistory" | "kodlandSettings" | "paymentSnapshots"> {
  const manualStudents: ManualStudent[] = array(raw.manualStudents, 100).map(object).filter((item) => localId(item.id) && typeof item.name === "string" && item.name.trim()).map((item) => ({ id: String(item.id), name: String(item.name).slice(0, 200), email: String(item.email ?? "").slice(0, 200), phone: String(item.phone ?? "").slice(0, 100), active: item.active !== false, created_at: String(item.created_at ?? seed.today), updated_at: String(item.updated_at ?? seed.today) }));
  const studentIds = new Set(manualStudents.map((item) => item.id));
  const manualClasses: ManualClass[] = array(raw.manualClasses, 50).map(object).filter((item) => localId(item.id) && typeof item.name === "string" && item.name.trim() && isIsoDate(item.first_lesson_date) && slotRows(item.schedule_slots).length > 0 && Number.isInteger(item.payment_day) && Number(item.payment_day) >= 1 && Number(item.payment_day) <= 31).map((item) => ({
    id: String(item.id), source: "manual", name: String(item.name).slice(0, 200), first_lesson_date: String(item.first_lesson_date), end_date: isIsoDate(item.end_date) ? String(item.end_date) : null,
    schedule_slots: slotRows(item.schedule_slots), hourly_rate_cents: null, rate_history: rateHistory(item.rate_history),
    initial_default_rate_cents: validRate(item.initial_default_rate_cents) ? item.initial_default_rate_cents as number | null : null,
    payment_day: Number(item.payment_day), payment_day_history: array(item.payment_day_history).map(object).filter((row) => isIsoDate(row.effective_from) && Number.isInteger(row.payment_day) && Number(row.payment_day) >= 1 && Number(row.payment_day) <= 31).map((row) => ({ effective_from: String(row.effective_from), payment_day: Number(row.payment_day) })),
    student_ids: array(item.student_ids, 100).filter((id): id is string => typeof id === "string" && studentIds.has(id)), active: item.active !== false,
    created_at: String(item.created_at ?? seed.today), updated_at: String(item.updated_at ?? seed.today),
  }));
  const classIds = new Set(manualClasses.map((item) => item.id));
  const manualLessons: ManualLessonContent[] = array(raw.manualLessons, 300).map(object).filter((item) => localId(item.id) && classIds.has(String(item.class_id)) && typeof item.title === "string" && item.title.trim()).map((item) => ({
    id: String(item.id), class_id: String(item.class_id), occurrence_id: typeof item.occurrence_id === "string" ? item.occurrence_id : null,
    title: String(item.title).slice(0, 200), content: String(item.content ?? "").slice(0, 10000), guide: String(item.guide ?? "").slice(0, 10000),
    links: array(item.links, 30).map(object).filter((link) => typeof link.label === "string" && isHttpUrl(String(link.url))).map((link) => ({ label: String(link.label).slice(0, 200), url: String(link.url) })),
    created_at: String(item.created_at ?? seed.today), updated_at: String(item.updated_at ?? seed.today),
  }));
  const manualActivities: ManualActivity[] = array(raw.manualActivities, 1000).map(object).filter((item) => localId(item.id) && classIds.has(String(item.class_id)) && studentIds.has(String(item.student_id)) && typeof item.occurrence_id === "string" && typeof item.title === "string" && item.title.trim() && (!item.submission_url || isHttpUrl(String(item.submission_url))) && ["pending", "completed"].includes(String(item.status))).map((item) => ({
    id: String(item.id), class_id: String(item.class_id), student_id: String(item.student_id), occurrence_id: String(item.occurrence_id), title: String(item.title).slice(0, 200), description: String(item.description ?? "").slice(0, 10000), submission_text: String(item.submission_text ?? "").slice(0, 10000), submission_url: String(item.submission_url ?? ""), feedback: String(item.feedback ?? "").slice(0, 10000), status: item.status as "pending" | "completed", created_at: String(item.created_at ?? seed.today), updated_at: String(item.updated_at ?? seed.today),
  }));
  const kodlandSettings: KodlandClassSettings[] = array(raw.kodlandSettings, 50).map(object).filter((item) => seed.groups.some((group) => group.external_id === item.id) && Number.isInteger(item.payment_day) && Number(item.payment_day) >= 1 && Number(item.payment_day) <= 31).map((item) => ({ id: String(item.id), rate_history: rateHistory(item.rate_history), payment_day: Number(item.payment_day), payment_day_history: array(item.payment_day_history).map(object).filter((row) => isIsoDate(row.effective_from) && Number.isInteger(row.payment_day) && Number(row.payment_day) >= 1 && Number(row.payment_day) <= 31).map((row) => ({ effective_from: String(row.effective_from), payment_day: Number(row.payment_day) })), created_at: String(item.created_at ?? seed.today), updated_at: String(item.updated_at ?? seed.today) }));
  const paymentSnapshots = Object.fromEntries(Object.entries(object(raw.paymentSnapshots)).filter(([date, value]) => isIsoDate(date) && object(raw.paymentStatus)[date] === "RECEIVED" && object(value).payment_date === date && Number.isInteger(object(value).total_cents) && Array.isArray(object(value).lessons))) as DemoSnapshot["paymentSnapshots"];
  return { manualStudents, manualClasses, manualLessons, manualActivities, defaultRateHistory: rateHistory(raw.defaultRateHistory), kodlandSettings, paymentSnapshots };
}

/** Restore only local actions. The seed owns identities, courses and links. */
export function restoreDemoState(seed: DemoSnapshot, serialized: string | null): { snapshot: DemoSnapshot; holidays: CustomHoliday[] } {
  const fallback = { snapshot: seed, holidays: [] as CustomHoliday[] };
  if (!serialized) return fallback;
  try {
    const stored = object(JSON.parse(serialized));
    const raw = object(stored.snapshot);
    if (stored.version !== 2) return fallback;
    const manual = restoreManualDemoData(raw, seed);
    const validManualLesson = (id: string) => {
      const parts = id.split(":");
      if (parts.length !== 4 || parts[0] !== "manual") return false;
      const classroom = manual.manualClasses.find((item) => item.id === parts[1]);
      if (!classroom || !isIsoDate(parts[3])) return false;
      try { return generateRecurringOccurrences(classroom, parts[3], parts[3]).some((item) => item.id === id); }
      catch { return false; }
    };
    const financialStatus = Object.fromEntries(Object.entries(object(raw.financialStatus)).filter(([id, value]) => (seed.lessons.some((lesson) => lesson.id === id || demoFinancialLessonId(lesson) === id) || validManualLesson(id)) && ["", "BILLABLE", "HOLIDAY", "SUBSTITUTION", "CANCELED"].includes(String(value))).map(([id, value]) => { const legacy = seed.lessons.find((lesson) => lesson.id === id); return [legacy ? demoFinancialLessonId(legacy) : id, value]; }));
    const paymentStatus = Object.fromEntries(Object.entries(object(raw.paymentStatus)).filter(([date, value]) => isIsoDate(date) && ["RECEIVED", "OVERDUE"].includes(String(value)))) as DemoSnapshot["paymentStatus"];
    const extraData = Array.isArray(raw.extras) ? raw.extras.map(object) : [];
    const reviewIds = Array.isArray(raw.reviews) ? new Set(raw.reviews.map((item) => object(item).id)) : new Set(seed.reviews.map((item) => item.id));
    const extras = seed.extras.map((extra) => { const saved = extraData.find((item) => item.id === extra.id); return saved && ["PENDING", "ACCOUNTED", "DONE"].includes(String(saved.manual_status)) ? { ...extra, manual_status: saved.manual_status as typeof extra.manual_status, completed: saved.manual_status === "DONE" } : extra; });
    const additionalExtras = Array.isArray(raw.additionalExtras) ? raw.additionalExtras.map(object).filter((item) => typeof item.id === "string" && item.id.startsWith("demo-added-") && typeof item.student === "string" && isIsoDate(item.lesson_date) && isIsoDate(item.payment_date) && typeof item.duration_minutes === "number" && item.duration_minutes > 0 && typeof item.hourly_rate_cents === "number" && item.hourly_rate_cents >= 0 && Number.isFinite(item.hourly_rate_cents)).map((item) => ({ id: String(item.id), class_id: null, class_name_snapshot: "Aula extra", number: 0, lesson_date: String(item.lesson_date), student: String(item.student).slice(0, 200), type: "EXTRA", duration_minutes: Number(item.duration_minutes), hourly_rate_cents: Number(item.hourly_rate_cents), period: String(item.lesson_date).slice(0, 7), payment_date: String(item.payment_date), value_cents: Math.round(Number(item.duration_minutes) / 60 * Number(item.hourly_rate_cents)), status: "COMPLETED" })) : [];
    const holidays: CustomHoliday[] = Array.isArray(stored.holidays) ? stored.holidays.map(object).filter((item) => isIsoDate(item.date) && typeof item.name === "string" && item.name.trim()).map((item) => ({ id: `demo-holiday-${item.date}`, date: String(item.date), name: String(item.name).slice(0, 120), source: "CUSTOM", affects_financial_total: true, created_at: seed.today, updated_at: seed.today })) : [];
    return { snapshot: { ...seed, ...manual, financialStatus: financialStatus as DemoSnapshot["financialStatus"], paymentStatus, extras, reviews: seed.reviews.filter((review) => reviewIds.has(review.id)), additionalExtras }, holidays };
  } catch { return fallback; }
}
