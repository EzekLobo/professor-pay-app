import { describe, expect, it } from "vitest";
import { __test } from "./api";

describe("Firestore financial helpers", () => {
  it("calcula o período da quinzena", () => expect(__test.period("2026-09-14")).toBe("01 a 15/09/2026"));

  it("calcula o pagamento no primeiro ou décimo quinto dia seguinte", () => {
    expect(__test.paymentDate("2026-09-14")).toBe("2026-10-01");
    expect(__test.paymentDate("2026-09-20")).toBe("2026-10-15");
  });

  it("converte uma turma exportada pelo Expo para o formato Firestore", () => {
    const item = __test.normalizeClass({ id: "turma-1", name: "Terça", weekDay: "Terça", time: "19:00:00", firstLesson: "2026-10-06", lessonCount: 12, durationHours: 1.5, hourlyRate: 40 });
    expect(item).toMatchObject({ week_day: 1, start_time: "19:00", duration_minutes: 90, hourly_rate_cents: 4000 });
  });

  it("converte uma aula exportada pelo Expo para o formato Firestore", () => {
    const lesson = __test.normalizeLesson({ id: "extra-1", classId: null, className: "Extra", lessonDate: "2026-10-02", type: "Extra", durationHours: 1, hourlyRate: 55 });
    expect(lesson).toMatchObject({ class_id: null, lesson_date: "2026-10-02", type: "EXTRA", duration_minutes: 60, hourly_rate_cents: 5500 });
  });
});
