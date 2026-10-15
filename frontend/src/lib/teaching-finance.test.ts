import { describe, expect, it } from "vitest";
import {
  effectiveHourlyRate,
  generateRecurringOccurrences,
  lessonValueCents,
  nextMonthPaymentDate,
  recurringOccurrenceId,
  saoPauloLocalTimestamp,
  type RecurringClass,
} from "./teaching-finance";

const course: RecurringClass = {
  id: "own-1",
  name: "Turma própria",
  first_lesson_date: "2026-10-05",
  hourly_rate_cents: 4800,
  payment_day: 31,
  schedule_slots: [
    { id: "mon-19", week_day: 0, start_time: "19:00", duration_minutes: 90, effective_from: "2026-10-05" },
    { id: "wed-20", week_day: 2, start_time: "20:00", duration_minutes: 45, effective_from: "2026-10-05" },
  ],
};

describe("financial domain for manually scheduled classes", () => {
  it("gera dois horários por semana em janela finita com IDs estáveis", () => {
    const first = generateRecurringOccurrences(course, "2026-10-05", "2026-10-12");
    expect(first.map((item) => item.id)).toEqual([
      recurringOccurrenceId("own-1", "mon-19", "2026-10-05"),
      recurringOccurrenceId("own-1", "wed-20", "2026-10-07"),
      recurringOccurrenceId("own-1", "mon-19", "2026-10-12"),
    ]);
    expect(first[0]).toMatchObject({ hourly_rate_cents: 4800, payment_date: "2026-11-30" });
    expect(generateRecurringOccurrences(course, "2026-10-05", "2026-10-12", first)).toEqual([]);
  });

  it("preserva aulas locais antigas e aplica alteração de horário só após sua vigência", () => {
    const changed: RecurringClass = {
      ...course,
      schedule_slots: [
        { ...course.schedule_slots[0], effective_until: "2026-10-11" },
        { id: "mon-21", week_day: 0, start_time: "21:00", duration_minutes: 60, effective_from: "2026-10-12" },
      ],
    };
    expect(generateRecurringOccurrences(changed, "2026-10-05", "2026-10-19", [
      { id: "own-1-lesson-1-2026-10-05", class_id: "own-1", lesson_date: "2026-10-05" },
    ]).map((item) => [item.lesson_date, item.start_time])).toEqual([
      ["2026-10-12", "21:00"],
      ["2026-10-19", "21:00"],
    ]);
  });

  it("trata horários como datas civis de São Paulo, sem deslocamento por UTC", () => {
    const result = generateRecurringOccurrences(course, "2026-10-04", "2026-10-08");
    expect(result.map((item) => [item.lesson_date, item.start_time])).toEqual([
      ["2026-10-05", "19:00"],
      ["2026-10-07", "20:00"],
    ]);
    expect(saoPauloLocalTimestamp(new Date("2026-10-16T02:30:00Z")))
      .toBe("2026-10-15T23:30");
  });

  it("seleciona tarifa por vigência, exceção por turma e padrão antes da Kodland legada", () => {
    const defaultHistory = [{ effective_from: "2026-10-01", hourly_rate_cents: 4000 }];
    const classHistory = [{ effective_from: "2026-11-01", hourly_rate_cents: 6000 }];
    expect(effectiveHourlyRate("2026-10-31", null, classHistory, defaultHistory)).toBe(4000);
    expect(effectiveHourlyRate("2026-11-01", null, classHistory, defaultHistory)).toBe(6000);
    expect(effectiveHourlyRate("2026-09-01", null, [], defaultHistory)).toBe(3000);
    expect(effectiveHourlyRate("2026-09-01", 5000, [], defaultHistory)).toBe(5000);
    const sameDay = [{
      effective_from: "2026-10-31",
      effective_from_local: "2026-10-31T20:30",
      hourly_rate_cents: 7000,
    }];
    expect(effectiveHourlyRate("2026-10-31", null, sameDay, defaultHistory, 3000, "19:00"))
      .toBe(4000);
    expect(effectiveHourlyRate("2026-10-31", null, sameDay, defaultHistory, 3000, "21:00"))
      .toBe(7000);
  });

  it("arredonda por aula e ajusta vencimento aos meses curtos", () => {
    expect(lessonValueCents(45, 3333)).toBe(2500);
    expect(lessonValueCents(30, 3333) + lessonValueCents(30, 3333)).toBe(3334);
    expect(nextMonthPaymentDate("2026-01-31", 31)).toBe("2026-02-28");
    expect(nextMonthPaymentDate("2027-01-31", 29)).toBe("2027-02-28");
    expect(nextMonthPaymentDate("2027-12-31", 31)).toBe("2028-01-31");
    expect(() => nextMonthPaymentDate("2026-02-30", 15)).toThrow();
  });
});
