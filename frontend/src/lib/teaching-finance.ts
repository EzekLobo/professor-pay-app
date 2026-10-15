/** Dates are civil dates in the teacher's São Paulo calendar (YYYY-MM-DD). */
export type WeeklySlot = {
  id: string;
  /** Monday = 0, Sunday = 6, matching the existing class week_day field. */
  week_day: number;
  start_time: string;
  duration_minutes: number;
  effective_from: string;
  effective_until?: string | null;
};

export type RatePeriod = {
  effective_from: string;
  /** São Paulo civil date/time; use for changes during a teaching day. */
  effective_from_local?: string;
  hourly_rate_cents: number;
};

export type RecurringClass = {
  id: string;
  name: string;
  first_lesson_date: string;
  end_date?: string | null;
  schedule_slots: readonly WeeklySlot[];
  hourly_rate_cents?: number | null;
  rate_history?: readonly RatePeriod[];
  payment_day?: number | null;
};

export type RecurringOccurrence = {
  id: string;
  class_id: string;
  class_name_snapshot: string;
  slot_id: string;
  lesson_date: string;
  start_time: string;
  duration_minutes: number;
  hourly_rate_cents: number;
  payment_date: string;
};

const civilDate = (value: string): Date | null => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? date
    : null;
};

export const saoPauloLocalTimestamp = (instant = new Date()): string => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(instant);
  const item = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${item("year")}-${item("month")}-${item("day")}T${item("hour")}:${item("minute")}`;
};

export const nextMonthPaymentDate = (lessonDate: string, day = 15): string => {
  const date = civilDate(lessonDate);
  if (!date || !Number.isInteger(day) || day < 1 || day > 31) {
    throw new RangeError("Data da aula ou dia de recebimento inválido.");
  }
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return `${new Date(Date.UTC(year, month, Math.min(day, lastDay))).toISOString().slice(0, 10)}`;
};

export const lessonValueCents = (durationMinutes: number, hourlyRateCents: number): number => {
  if (!Number.isFinite(durationMinutes) || durationMinutes < 0 ||
      !Number.isFinite(hourlyRateCents) || hourlyRateCents < 0) {
    throw new RangeError("Duração ou valor por hora inválido.");
  }
  return Math.round(durationMinutes * hourlyRateCents / 60);
};

export const effectiveHourlyRate = (
  lessonDate: string,
  classRate: number | null | undefined,
  classHistory: readonly RatePeriod[] = [],
  defaultHistory: readonly RatePeriod[] = [],
  legacyRate = 3000,
  lessonStartTime = "00:00",
): number => {
  const applicable = (history: readonly RatePeriod[]) => history
    .filter((item) => item.effective_from <= lessonDate &&
      (!item.effective_from_local ||
        item.effective_from_local <= `${lessonDate}T${lessonStartTime}`) &&
      Number.isInteger(item.hourly_rate_cents) && item.hourly_rate_cents >= 0)
    .sort((a, b) =>
      (b.effective_from_local ?? b.effective_from).localeCompare(
        a.effective_from_local ?? a.effective_from,
      ),
    )[0]
    ?.hourly_rate_cents;
  const selected = applicable(classHistory) ?? classRate ?? applicable(defaultHistory) ?? legacyRate;
  if (!Number.isInteger(selected) || selected < 0) {
    throw new RangeError("Valor por hora inválido.");
  }
  return selected;
};

export const recurringOccurrenceId = (classId: string, slotId: string, date: string) =>
  `manual:${classId}:${slotId}:${date}`;

/** A finite read window is mandatory; this function never persists forecast lessons. */
export const generateRecurringOccurrences = (
  classRecord: RecurringClass,
  from: string,
  to: string,
  existing: readonly { id?: string; class_id?: string | null; slot_id?: string; lesson_date?: string; start_time?: string }[] = [],
  defaultHistory: readonly RatePeriod[] = [],
): RecurringOccurrence[] => {
  const start = civilDate(from);
  const end = civilDate(to);
  if (!start || !end || start > end) throw new RangeError("Período de consulta inválido.");
  const existingKeys = new Set(existing.flatMap((lesson) => [
    lesson.id ?? "",
    lesson.class_id && lesson.slot_id && lesson.lesson_date
      ? recurringOccurrenceId(lesson.class_id, lesson.slot_id, lesson.lesson_date)
      : "",
    lesson.class_id && lesson.lesson_date && lesson.start_time
      ? `${lesson.class_id}:${lesson.lesson_date}:${lesson.start_time}`
      : "",
    lesson.class_id && lesson.lesson_date && !lesson.start_time
      ? `${lesson.class_id}:${lesson.lesson_date}:legacy`
      : "",
  ]));
  const occurrences: RecurringOccurrence[] = [];
  const uniqueSlots = new Set<string>();
  for (const slot of classRecord.schedule_slots) {
    if (!slot.id || uniqueSlots.has(slot.id)) throw new RangeError("IDs de horários devem ser únicos.");
    uniqueSlots.add(slot.id);
    if (!Number.isInteger(slot.week_day) || slot.week_day < 0 || slot.week_day > 6 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start_time) ||
        !Number.isInteger(slot.duration_minutes) || slot.duration_minutes <= 0 ||
        !civilDate(slot.effective_from) || (slot.effective_until && !civilDate(slot.effective_until))) {
      throw new RangeError("Horário semanal inválido.");
    }
  }
  for (let time = start.getTime(); time <= end.getTime(); time += 86400000) {
    const date = new Date(time).toISOString().slice(0, 10);
    if (date < classRecord.first_lesson_date ||
        (classRecord.end_date && date > classRecord.end_date)) continue;
    const weekDay = (new Date(time).getUTCDay() + 6) % 7;
    for (const slot of classRecord.schedule_slots) {
      if (slot.week_day !== weekDay || date < slot.effective_from ||
          (slot.effective_until && date > slot.effective_until)) continue;
      const id = recurringOccurrenceId(classRecord.id, slot.id, date);
      if (existingKeys.has(id) || existingKeys.has(`${classRecord.id}:${date}:${slot.start_time}`) ||
          existingKeys.has(`${classRecord.id}:${date}:legacy`)) continue;
      occurrences.push({
        id,
        class_id: classRecord.id,
        class_name_snapshot: classRecord.name,
        slot_id: slot.id,
        lesson_date: date,
        start_time: slot.start_time,
        duration_minutes: slot.duration_minutes,
        hourly_rate_cents: effectiveHourlyRate(
          date, classRecord.hourly_rate_cents, classRecord.rate_history, defaultHistory,
          3000, slot.start_time,
        ),
        payment_date: nextMonthPaymentDate(date, classRecord.payment_day ?? 15),
      });
    }
  }
  return occurrences;
};
