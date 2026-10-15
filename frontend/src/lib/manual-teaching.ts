import type { RatePeriod, RecurringClass, WeeklySlot } from "@/lib/teaching-finance";

export type ManualStudent = {
  id: string;
  name: string;
  email: string;
  phone: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualClass = RecurringClass & {
  source: "manual";
  /** The default selected at creation also covers an intentionally backdated first lesson. */
  initial_default_rate_cents?: number | null;
  payment_day_history?: PaymentDayPeriod[];
  student_ids: string[];
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type KodlandClassSettings = {
  id: string;
  rate_history: RatePeriod[];
  payment_day: number;
  payment_day_history?: PaymentDayPeriod[];
  updated_at: string;
  created_at: string;
};

export type PaymentDayPeriod = { effective_from: string; payment_day: number };
export const effectivePaymentDay = (
  lessonDate: string,
  history: readonly PaymentDayPeriod[] = [],
  legacyDay = 15,
) => history.filter((item) => item.effective_from <= lessonDate)
  .sort((a, b) => a.effective_from.localeCompare(b.effective_from)).at(-1)?.payment_day ?? legacyDay;

export type ManualClassInput = {
  name: string;
  first_lesson_date: string;
  end_date?: string | null;
  schedule_slots: Pick<WeeklySlot, "id" | "week_day" | "start_time" | "duration_minutes">[];
  student_ids: string[];
  hourly_rate_cents: number | null;
  payment_day: number;
};

export const tomorrowCivilDate = (today: string) => {
  const next = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(next.getTime())) throw new RangeError("Data inválida.");
  next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString().slice(0, 10);
};

export const yesterdayCivilDate = (today: string) => {
  const previous = new Date(`${today}T12:00:00Z`);
  if (Number.isNaN(previous.getTime())) throw new RangeError("Data inválida.");
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
};

/** Keep old slot identities and histories; edits start with the next teaching day. */
export const reconcileWeeklySlots = (
  previous: readonly WeeklySlot[],
  submitted: ManualClassInput["schedule_slots"],
  today: string,
): WeeklySlot[] => {
  const future = tomorrowCivilDate(today);
  const past = yesterdayCivilDate(future);
  const retained = previous.flatMap((slot) => {
    if (slot.effective_until && slot.effective_until < future) return [slot];
    const next = submitted.find((item) => item.id === slot.id);
    if (next && next.week_day === slot.week_day && next.start_time === slot.start_time &&
        next.duration_minutes === slot.duration_minutes) return [slot];
    return slot.effective_from >= future ? [] : [{ ...slot, effective_until: past }];
  });
  const unchanged = new Set(retained.filter((slot) => !slot.effective_until || slot.effective_until >= future).map((slot) => slot.id));
  return [
    ...retained,
    ...submitted.filter((slot) => !unchanged.has(slot.id)).map((slot) => ({
      ...slot,
      id: previous.some((item) => item.id === slot.id)
        ? crypto.randomUUID() : slot.id,
      effective_from: future,
    })),
  ];
};

export const validateManualClassInput = (input: ManualClassInput, hasDefaultRate: boolean) => {
  if (!input.name.trim()) throw new RangeError("Informe o nome da turma.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.first_lesson_date) ||
      Number.isNaN(Date.parse(`${input.first_lesson_date}T12:00:00Z`))) {
    throw new RangeError("Informe uma data inicial válida.");
  }
  if (input.end_date && input.end_date < input.first_lesson_date) {
    throw new RangeError("A data final deve ser posterior ao início.");
  }
  if (!Number.isInteger(input.payment_day) || input.payment_day < 1 || input.payment_day > 31) {
    throw new RangeError("O dia de recebimento deve estar entre 1 e 31.");
  }
  if (input.hourly_rate_cents == null && !hasDefaultRate) {
    throw new RangeError("Defina o valor por hora padrão ou específico da turma.");
  }
  if (input.hourly_rate_cents != null &&
      (!Number.isInteger(input.hourly_rate_cents) || input.hourly_rate_cents <= 0)) {
    throw new RangeError("Informe um valor por hora válido.");
  }
  if (input.schedule_slots.length === 0) throw new RangeError("Adicione ao menos um horário semanal.");
  if (new Set(input.schedule_slots.map((slot) => slot.id)).size !== input.schedule_slots.length) {
    throw new RangeError("Horários repetidos.");
  }
  for (const slot of input.schedule_slots) {
    if (!slot.id || !Number.isInteger(slot.week_day) || slot.week_day < 0 || slot.week_day > 6 ||
        !/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.start_time) ||
        !Number.isInteger(slot.duration_minutes) || slot.duration_minutes <= 0) {
      throw new RangeError("Confira os dias, horários e duração da turma.");
    }
  }
};
