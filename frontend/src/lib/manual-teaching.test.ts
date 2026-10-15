import { describe, expect, it } from "vitest";
import { calculateDashboard } from "./api";
import { effectiveHourlyRate, generateRecurringOccurrences } from "./teaching-finance";
import {
  effectivePaymentDay,
  reconcileWeeklySlots,
  validateManualClassInput,
} from "./manual-teaching";

describe("turmas próprias e configurações financeiras", () => {
  it("preserva o horário antigo e só troca as ocorrências a partir de amanhã", () => {
    const previous = [{ id: "old", week_day: 0, start_time: "19:00", duration_minutes: 60, effective_from: "2026-10-05" }];
    const slots = reconcileWeeklySlots(previous, [{ id: "new", week_day: 0, start_time: "20:00", duration_minutes: 90 }], "2026-10-15");
    expect(slots[0]).toMatchObject({ id: "old", effective_until: "2026-10-15" });
    expect(slots[1]).toMatchObject({ id: "new", effective_from: "2026-10-16" });
    const occurrences = generateRecurringOccurrences({
      id: "manual-1", name: "Desenho", first_lesson_date: "2026-10-05",
      schedule_slots: slots, hourly_rate_cents: 4000,
    }, "2026-10-12", "2026-10-19");
    expect(occurrences.map((item) => [item.lesson_date, item.start_time])).toEqual([
      ["2026-10-12", "19:00"], ["2026-10-19", "20:00"],
    ]);
  });

  it("exige tarifa na primeira turma e permite voltar da exceção ao padrão sem reprecificar aulas antigas", () => {
    const input = {
      name: "Desenho", first_lesson_date: "2026-10-15", student_ids: [],
      schedule_slots: [{ id: "slot", week_day: 3, start_time: "20:00", duration_minutes: 60 }],
      hourly_rate_cents: null, payment_day: 31,
    };
    expect(() => validateManualClassInput(input, false)).toThrow(/valor por hora/);
    expect(() => validateManualClassInput(input, true)).not.toThrow();
    const history = [
      { effective_from: "2026-10-01", hourly_rate_cents: 7000 },
      { effective_from: "2026-10-15", effective_from_local: "2026-10-15T21:00", hourly_rate_cents: null },
    ];
    const defaultHistory = [{ effective_from: "2026-10-01", hourly_rate_cents: 5000 }];
    expect(effectiveHourlyRate("2026-10-15", null, history, defaultHistory, 3000, "20:00")).toBe(7000);
    expect(effectiveHourlyRate("2026-10-16", null, history, defaultHistory)).toBe(5000);
  });

  it("reúne manual e Kodland no extrato, sem alterar a tarifa Kodland passada", () => {
    const manual = {
      id: "manual-1", source: "manual", name: "Desenho", first_lesson_date: "2026-10-13", active: true,
      student_ids: ["student-1"], created_at: "2026-10-13", updated_at: "2026-10-13",
      payment_day: 20, payment_day_history: [{ effective_from: "2026-10-13", payment_day: 20 }],
      initial_default_rate_cents: 5000, hourly_rate_cents: null,
      schedule_slots: [{ id: "tue", week_day: 1, start_time: "19:00", duration_minutes: 60, effective_from: "2026-10-13" }],
    };
    const kodland = {
      id: "group-1", external_id: "group-1", title: "Kodland", course_name: "Curso [60 min] [2L]",
      start_date: "2026-10-13", next_lesson_date: "2026-10-13", archived: false,
    };
    const response = calculateDashboard(
      [manual], [], [], [kodland], [], "2026-10-15", [], [], [],
      [{ effective_from: "2026-10-15", effective_from_local: "2026-10-15T12:00", hourly_rate_cents: 5000 }],
      [{ id: "group-1", rate_history: [{ effective_from: "2026-10-15", effective_from_local: "2026-10-15T12:00", hourly_rate_cents: 8000 }], payment_day: 25, payment_day_history: [{ effective_from: "2026-10-16", payment_day: 25 }] }],
    );
    const manualPayment = response.payments.find((item) => item.payment_date === "2026-11-20");
    const kodlandPayment = response.payments.find((item) => item.payment_date === "2026-11-15");
    expect(manualPayment?.lessons[0]).toMatchObject({ class_id: "manual-1", value_cents: 5000 });
    expect(kodlandPayment?.lessons[0]).toMatchObject({ class_id: "kodland:group-1", value_cents: 3000 });
    expect(effectivePaymentDay("2026-10-15", [{ effective_from: "2026-10-16", payment_day: 25 }])).toBe(15);
  });
});
