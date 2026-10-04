import { describe, expect, it } from "vitest";
import { __test } from "./api";

describe("Firestore financial helpers", () => {
  it("calcula a competência mensal", () =>
    expect(__test.period("2026-09-14")).toBe("09/2026"));

  it("calcula o pagamento no primeiro ou décimo quinto dia seguinte", () => {
    expect(__test.paymentDate("2026-09-14")).toBe("2026-10-15");
    expect(__test.paymentDate("2026-09-20")).toBe("2026-10-15");
  });

  it("converte uma turma exportada pelo Expo para o formato Firestore", () => {
    const item = __test.normalizeClass({
      id: "turma-1",
      name: "Terça",
      weekDay: "Terça",
      time: "19:00:00",
      firstLesson: "2026-10-06",
      lessonCount: 12,
      durationHours: 1.5,
      hourlyRate: 40,
    });
    expect(item).toMatchObject({
      week_day: 1,
      start_time: "19:00",
      duration_minutes: 90,
      hourly_rate_cents: 4000,
    });
  });

  it("converte uma aula exportada pelo Expo para o formato Firestore", () => {
    const lesson = __test.normalizeLesson({
      id: "extra-1",
      classId: null,
      className: "Extra",
      lessonDate: "2026-10-02",
      type: "Extra",
      durationHours: 1,
      hourlyRate: 55,
    });
    expect(lesson).toMatchObject({
      class_id: null,
      lesson_date: "2026-10-02",
      type: "EXTRA",
      duration_minutes: 60,
      hourly_rate_cents: 5500,
    });
  });

  it("projeta pagamentos a partir do cronograma sincronizado da Kodland", () => {
    const dashboard = __test.dashboardFrom(
      [],
      [],
      [],
      [
        {
          id: "62934",
          external_id: "62934",
          title: "Roblox SEG-19",
          course_name: "[1192]Roblox[90 min][40 L]",
          archived: false,
          created_at: "2026-09-01",
        },
      ],
      [
        {
          id: "event-1",
          external_class_id: "62934",
          lesson_number: 1,
          lesson_date: "2026-10-05T19:00:00-03:00",
          start_time: "19:00",
          end_time: "20:30",
          created_at: "2026-09-01",
        },
      ],
      "2026-10-04",
    );

    expect(dashboard.payments).toHaveLength(1);
    expect(dashboard.payments[0]).toMatchObject({
      period: "10/2026",
      payment_date: "2026-11-15",
      lesson_count: 1,
      total_cents: 4500,
    });
  });
});
