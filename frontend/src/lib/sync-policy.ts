/** Pure scheduling rules. All calendar boundaries use an explicit business timezone. */
export const DEFAULT_SYNC_TIME_ZONE = "America/Sao_Paulo";
export const SYNC_POLICY_VERSION = 1;
const MINUTE = 60_000;
const DAY = 86_400_000;

export type SyncScope = "activities" | "attendance" | "ranking" | "extras_discovery" | "extra_final_check" | "recordings" | "call_link" | "payroll" | "manual";
export type SyncHistory = {
  last_attempt_at?: number | null;
  last_success_at?: number | null;
  next_due_at?: number | null;
  completed?: boolean;
};
export type SyncOccurrence = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  /** Prefer authoritative ISO instants with an explicit offset, when provided. */
  startAt?: string;
  endAt?: string;
  cancelled?: boolean;
  taught?: boolean;
  recordingUrl?: string;
  callUrl?: string;
};
export type SyncDecision = { due: boolean; nextDueAt: number | null; reason: string };

export function syncTimeZone(value?: string | null): string {
  try { if (value) { new Intl.DateTimeFormat("en", { timeZone: value }).format(); return value; } } catch { /* Use the application's explicit fallback. */ }
  return DEFAULT_SYNC_TIME_ZONE;
}

export function calendarDay(now: number, timeZone = DEFAULT_SYNC_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: syncTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const part = (name: string) => parts.find(item => item.type === name)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}
export function addCalendarDays(date: string, amount: number): string {
  const instant = Date.parse(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(instant) || new Date(instant).toISOString().slice(0, 10) !== date) throw new Error("Data de agenda inválida.");
  return new Date(instant + amount * DAY).toISOString().slice(0, 10);
}
export function weekBounds(now: number, timeZone = DEFAULT_SYNC_TIME_ZONE): { start: string; end: string } {
  const day = calendarDay(now, timeZone);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const start = addCalendarDays(day, -((weekday + 6) % 7));
  return { start, end: addCalendarDays(start, 6) };
}

/** Converts a calendar wall time without interpreting it in the machine's timezone. */
export function zonedInstant(date: string, time: string, timeZone = DEFAULT_SYNC_TIME_ZONE): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(time)) return null;
  const wall = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`);
  if (!Number.isFinite(wall) || new Date(wall).toISOString().slice(0, 10) !== date) return null;
  const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: syncTimeZone(timeZone), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const wallAt = (instant: number) => {
    const parts = formatter.formatToParts(instant);
    const value = (name: string) => parts.find(item => item.type === name)?.value;
    return Date.parse(`${value("year")}-${value("month")}-${value("day")}T${value("hour")}:${value("minute")}:${value("second")}Z`);
  };
  let guess = wall;
  for (let index = 0; index < 5; index++) {
    const difference = wall - wallAt(guess);
    if (!difference) return guess;
    guess += difference;
  }
  return null; // Nonexistent wall time, e.g. a daylight-saving clock transition.
}

function explicitInstant(value?: string): number | null {
  if (!value || !/(Z|[+-]\d{2}:?\d{2})$/i.test(value)) return null;
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? instant : null;
}
export function occurrenceTimes(item: SyncOccurrence, timeZone = DEFAULT_SYNC_TIME_ZONE): { start: number; end: number } | null {
  const start = explicitInstant(item.startAt) ?? zonedInstant(item.date, item.startTime, timeZone);
  let end = explicitInstant(item.endAt) ?? zonedInstant(item.date, item.endTime, timeZone);
  if (start === null || end === null) return null;
  if (!item.endAt && end < start) end = zonedInstant(addCalendarDays(item.date, 1), item.endTime, timeZone);
  return end !== null && end > start ? { start, end } : null;
}
/** A reschedule creates a new key; old successful checks cannot suppress the new occurrence. */
export function occurrenceKey(item: SyncOccurrence, timeZone = DEFAULT_SYNC_TIME_ZONE): string {
  const times = occurrenceTimes(item, timeZone);
  return `${item.id}:${times?.start ?? `${item.date}T${item.startTime}`}:${times?.end ?? item.endTime}`;
}
function decision(due: boolean, nextDueAt: number | null, reason: string): SyncDecision { return { due, nextDueAt, reason }; }
function retryGate(now: number, history: SyncHistory): SyncDecision | null {
  return history.next_due_at && history.next_due_at > now ? decision(false, history.next_due_at, "retry_wait") : null;
}
/** Used for newly discovered rows: older pending rows already tracked remain eligible. */
export function withinInitialWindow(item: SyncOccurrence, initialisedAt: number, timeZone = DEFAULT_SYNC_TIME_ZONE): boolean {
  return item.date >= addCalendarDays(calendarDay(initialisedAt, timeZone), -7);
}
export function extraFinalCheckDecision(item: SyncOccurrence, now: number, history: SyncHistory = {}, timeZone = DEFAULT_SYNC_TIME_ZONE): SyncDecision {
  if (item.cancelled || item.taught || history.completed) return decision(false, null, "closed");
  if (zonedInstant(item.date, "00:00", timeZone) === null) return decision(false, null, "missing_time");
  const dueAt = zonedInstant(addCalendarDays(item.date, 1), "00:00", timeZone);
  if (dueAt === null) return decision(false, null, "missing_time");
  if (now < dueAt) return decision(false, dueAt, "future_day");
  return retryGate(now, history) ?? decision(true, dueAt, "past_day");
}
export function attendanceDecision(item: SyncOccurrence, now: number, history: SyncHistory = {}, timeZone = DEFAULT_SYNC_TIME_ZONE): SyncDecision {
  if (item.cancelled || history.completed) return decision(false, null, "closed");
  const times = occurrenceTimes(item, timeZone);
  if (!times) return decision(false, null, "missing_time");
  const dueAt = times.end + 60 * MINUTE;
  if (now < dueAt) return decision(false, dueAt, "before_check");
  return retryGate(now, history) ?? decision(true, dueAt, "after_lesson");
}
export function recordingDecision(item: SyncOccurrence, now: number, history: SyncHistory = {}, timeZone = DEFAULT_SYNC_TIME_ZONE): SyncDecision {
  if (item.cancelled || item.recordingUrl) return decision(false, null, "closed");
  const times = occurrenceTimes(item, timeZone);
  if (!times) return decision(false, null, "missing_time");
  const dueAt = Math.max(times.end, (history.last_attempt_at ?? -Infinity) + 30 * MINUTE, history.next_due_at ?? -Infinity);
  return decision(now >= dueAt, dueAt, now >= dueAt ? "recording_pending" : "recording_wait");
}
export function callLinkDecision(item: SyncOccurrence, now: number, history: SyncHistory = {}, timeZone = DEFAULT_SYNC_TIME_ZONE): SyncDecision {
  const times = occurrenceTimes(item, timeZone);
  if (!times) return decision(false, null, "missing_time");
  if (item.cancelled || item.callUrl || now >= times.end) return decision(false, null, "closed");
  const dueAt = Math.max(times.start - 15 * MINUTE, (history.last_attempt_at ?? -Infinity) + 5 * MINUTE, history.next_due_at ?? -Infinity);
  return decision(now >= dueAt, dueAt < times.end ? dueAt : null, now >= dueAt ? "call_pending" : "call_wait");
}
export function payrollDecision(paymentDate: string, now: number, history: SyncHistory = {}, timeZone = DEFAULT_SYNC_TIME_ZONE): SyncDecision {
  if (zonedInstant(paymentDate, "00:00", timeZone) === null) return decision(false, null, "missing_payment_date");
  const today = calendarDay(now, timeZone);
  if (today < addCalendarDays(paymentDate, -5) || today > paymentDate) return decision(false, null, "outside_payment_window");
  if (history.last_success_at != null && calendarDay(history.last_success_at, timeZone) === today) {
    const next = addCalendarDays(today, 1);
    return decision(false, next <= paymentDate ? zonedInstant(next, "00:00", timeZone) : null, "already_checked_today");
  }
  return retryGate(now, history) ?? decision(true, now, "payment_window");
}
export function isNewExtraThisWeek(id: string, date: string, knownIds: ReadonlySet<string>, now: number, timeZone = DEFAULT_SYNC_TIME_ZONE): boolean {
  const week = weekBounds(now, timeZone);
  return !knownIds.has(id) && date >= week.start && date <= week.end;
}
