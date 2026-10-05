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
          start_date: "2026-10-05T19:00:00-03:00",
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

    expect(
      dashboard.payments.find((payment) => payment.period === "10/2026"),
    ).toMatchObject({
      period: "10/2026",
      payment_date: "2026-11-15",
      lesson_count: 4,
      total_cents: 18000,
    });
  });

  it("contabiliza apenas aulas extras concluídas da Kodland", () => {
    const dashboard = __test.dashboardFrom([], [], [], [], [], "2026-10-04", [
      {
        id: "extra-1",
        student_name: "Ana",
        external_class_name: "Roblox",
        lesson_date: "2026-10-03",
        start_time: "18:00",
        end_time: "19:00",
        completed: true,
        created_at: "2026-10-01",
      },
      {
        id: "extra-2",
        student_name: "Ana",
        external_class_name: "Roblox",
        lesson_date: "2026-10-05",
        start_time: "18:00",
        end_time: "19:00",
        completed: false,
        created_at: "2026-10-01",
      },
    ]);

    expect(dashboard.extra_lessons).toBe(1);
    expect(dashboard.extra_earned_cents).toBe(3000);
  });

  it("completa a recorrência semanal e ignora substituições", () => {
    const groups = [
      {
        id: "mon",
        external_id: "mon",
        title: "Segunda",
        course_name: "[90 min][40 L]",
        start_date: "2026-03-02",
        archived: false,
        created_at: "2026-03-01",
      },
      {
        id: "tue",
        external_id: "tue",
        title: "Terça",
        course_name: "[90 min][40 L]",
        start_date: "2026-03-03",
        archived: false,
        created_at: "2026-03-01",
      },
      {
        id: "thu",
        external_id: "thu",
        title: "Quinta",
        course_name: "[90 min][40 L]",
        start_date: "2026-03-05",
        archived: false,
        created_at: "2026-03-01",
      },
    ];
    const dashboard = __test.dashboardFrom(
      [],
      [],
      [],
      groups,
      [
        {
          id: "sub",
          external_class_id: "thu",
          lesson_date: "2026-04-02",
          status: "Substituição",
          created_at: "2026-03-01",
        },
      ],
      "2026-04-01",
    );
    const april = dashboard.payments.find(
      (payment) => payment.period === "04/2026",
    );

    // Abril teria 13 encontros semanais das três turmas; a substituição não entra no orçamento.
    expect(april).toMatchObject({ lesson_count: 12, total_cents: 54000 });
  });

  it("normaliza aulas importadas em uma colecao separada da agenda sincronizada", () => {
    const result = __test.normalizeImportedCourseResult({
      course: { id: "roblox", name: "Roblox", lesson_count: 1 },
      lessons: [{
        id: "20849",
        lesson_number: 3,
        title: "Construindo o jogo",
        module_number: "1",
        external_url: "https://bo.kodland.org/courses/1192?lessonId=20849",
        slides_url: "https://docs.google.com/presentation/d/example",
        guide_url: "https://wiki.kodland.org/example",
        homework_url: "https://learn.kodland.org/pt/task/1/teacher/do",
        homework_title: "Atividade",
      }],
    });

    expect(result.course).toMatchObject({ id: "roblox", lesson_count: 1 });
    expect(__test.importedLessonDocumentId("roblox", result.lessons[0].id)).toBe("roblox--20849");
    expect(result.lessons[0]).not.toHaveProperty("password");
  });

  it("rejeita resposta de importacao fora do catalogo permitido", () => {
    expect(() => __test.normalizeImportedCourseResult({
      course: { id: "arbitrary", name: "Outro", lesson_count: 0 },
      lessons: [],
    })).toThrow("curso importado");
  });
});
