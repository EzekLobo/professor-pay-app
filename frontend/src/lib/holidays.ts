export type HolidaySource = "NATIONAL" | "CUSTOM";
export type FinancialOverrideStatus = "BILLABLE" | "HOLIDAY" | "SUBSTITUTION" | "CANCELED";

export type Holiday = {
  date: string;
  name: string;
  source: HolidaySource;
  affects_financial_total: true;
};

export type CustomHoliday = Holiday & {
  id: string;
  created_at: string;
  updated_at: string;
};

export type FinancialResolution = {
  financialStatus: "" | FinancialOverrideStatus;
  isBillable: boolean;
  holiday: Holiday | null;
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SAO_PAULO = "America/Sao_Paulo";

export const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== "string" || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

const isoDate = (date: Date) => date.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

/** Gregorian computus, returning Easter Sunday in UTC so date-only arithmetic stays timezone safe. */
const easterSunday = (year: number) => {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  return new Date(Date.UTC(year, Math.floor((h + l - 7 * m + 114) / 31) - 1, ((h + l - 7 * m + 114) % 31) + 1));
};

/** National holidays only. State, municipal and optional dates are custom holidays. */
export const brazilianNationalHolidays = (year: number): Holiday[] => {
  if (!Number.isInteger(year) || year < 1900 || year > 9999) return [];
  const fixed: Array<[string, string]> = [
    ["01-01", "Confraternização Universal"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia Mundial do Trabalho"],
    ["09-07", "Independência do Brasil"],
    ["10-12", "Nossa Senhora Aparecida"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"],
    ["12-25", "Natal"],
  ];
  const goodFriday = isoDate(addDays(easterSunday(year), -2));
  return [
    ...fixed.map(([monthDay, name]) => ({ date: `${year}-${monthDay}`, name, source: "NATIONAL" as const, affects_financial_total: true as const })),
    { date: goodFriday, name: "Paixão de Cristo", source: "NATIONAL" as const, affects_financial_total: true as const },
  ].sort((left, right) => left.date.localeCompare(right.date));
};

export const saoPauloDate = (value: Date | string | number): string => {
  if (typeof value === "string" && isIsoDate(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.valueOf())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: SAO_PAULO,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
};

export const holidaysForDate = (date: string, customHolidays: readonly Pick<Holiday, "date" | "name">[] = []): Holiday[] => {
  if (!isIsoDate(date)) return [];
  const national = brazilianNationalHolidays(Number(date.slice(0, 4)));
  const custom = customHolidays
    .filter((holiday) => holiday.date === date)
    .map((holiday) => ({ ...holiday, source: "CUSTOM" as const, affects_financial_total: true as const }));
  return [...national, ...custom].filter((holiday, index, all) =>
    holiday.date === date && all.findIndex((item) => item.source === holiday.source && item.name === holiday.name) === index,
  );
};

export const normalizeFinancialOverride = (status: unknown): "" | FinancialOverrideStatus => {
  const normalized = String(status ?? "").trim().toUpperCase();
  if (normalized === "BILLABLE" || normalized === "CONTABILIZAR") return "BILLABLE";
  if (normalized === "HOLIDAY" || normalized === "FERIADO") return "HOLIDAY";
  if (normalized === "SUBSTITUTION" || normalized === "SUBSTITUIÇÃO" || normalized === "SUBSTITUICAO" || normalized === "REPLACEMENT") return "SUBSTITUTION";
  if (normalized === "CANCELED" || normalized === "CANCELLED" || normalized === "CANCELADA" || normalized === "CANCELADO") return "CANCELED";
  return "";
};

/**
 * Resolves presentation/calculation state only. It never persists an automatic
 * holiday into the synced lesson, and leaves already received competencies intact.
 */
export const resolveFinancialStatus = ({
  lessonDate,
  financialStatus,
  customHolidays = [],
  paymentReceived = false,
}: {
  lessonDate: string;
  financialStatus?: unknown;
  customHolidays?: readonly Pick<Holiday, "date" | "name">[];
  paymentReceived?: boolean;
}): FinancialResolution => {
  const override = normalizeFinancialOverride(financialStatus);
  if (paymentReceived) {
    return { financialStatus: override, isBillable: override !== "HOLIDAY" && override !== "SUBSTITUTION" && override !== "CANCELED", holiday: null };
  }
  if (override) {
    return { financialStatus: override, isBillable: override === "BILLABLE", holiday: null };
  }
  const holiday = holidaysForDate(lessonDate, customHolidays)[0] ?? null;
  return holiday
    ? { financialStatus: "HOLIDAY", isBillable: false, holiday }
    : { financialStatus: "", isBillable: true, holiday: null };
};

export const customHolidayDocumentId = (date: string) => {
  if (!isIsoDate(date)) throw new Error("A data do feriado deve estar no formato AAAA-MM-DD.");
  return date;
};

export const userHolidayCollectionPath = (userId: string) => `users/${userId}/holidays`;
