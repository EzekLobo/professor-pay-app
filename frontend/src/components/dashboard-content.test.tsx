import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardResponse } from "@/lib/api";
import { DashboardContent, PaymentStatement } from "./dashboard-content";

const dashboard: DashboardResponse = {
  today: "2026-09-29",
  earned_cents: 123450,
  received_cents: 50000,
  normal_lessons: 8,
  extra_lessons: 2,
  normal_earned_cents: 100000,
  extra_earned_cents: 23450,
  planned_cents: 15000,
  future_lessons: 1,
  total_planned_cents: 138450,
  total_lessons: 10,
  last_payment: null,
  next_payment: {
    payment_date: "2026-10-01",
    period: "16/09 a 30/09",
    lesson_count: 2,
    normal_count: 2,
    extra_count: 0,
    normal_total_cents: 25000,
    extra_total_cents: 0,
    total_cents: 25000,
    status: "FUTURE",
    lessons: [],
  },
  payments: [],
  progress: [
    {
      class_id: "class-1",
      name: "Matemática",
      lesson_count: 10,
      completed: 4,
      remaining: 6,
      percent: 40,
    },
  ],
};

describe("DashboardContent", () => {
  it("exibe o estado de carregamento", () =>
    expect(
      renderToStaticMarkup(<DashboardContent state="loading" />),
    ).toContain("Sincronizando seu resumo financeiro"));
  it("exibe erro e ação de nova tentativa", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent state="error" onRetry={vi.fn()} />,
    );
    expect(markup).toContain("Não foi possível carregar o resumo");
    expect(markup).toContain("Tentar novamente");
  });
  it("exibe apenas o resumo financeiro", () => {
    const markup = renderToStaticMarkup(
      <DashboardContent state="ready" dashboard={dashboard} />,
    );
    expect(markup).toContain("Resumo financeiro");
    expect(markup).not.toContain("Competências em destaque");
    expect(markup).toContain("Próximo");
    expect(markup).toContain("R$ 250,00");
    expect(markup).toContain("1 de out. de 2026");
  });
  it("orienta a sincronização quando não há aulas", () =>
    expect(
      renderToStaticMarkup(
        <DashboardContent
          state="ready"
          dashboard={{ ...dashboard, total_lessons: 0 }}
        />,
      ),
    ).toContain("Sincronize a Kodland"));

  it("detalha as aulas contabilizadas no extrato", () => {
    const payment = {
      ...dashboard.next_payment!,
      normal_count: 1,
      normal_total_cents: 12500,
      extra_count: 1,
      extra_total_cents: 12500,
      lessons: [
        {
          id: "lesson-1",
          class_id: "class-1",
          class_name_snapshot: "Turma de terça",
          lesson_date: "2026-09-18",
          number: 3,
          type: "NORMAL",
          student: "",
          duration_minutes: 60,
          hourly_rate_cents: 12500,
          period: "01/09 a 15/09",
          payment_date: "2026-10-15",
          value_cents: 12500,
          status: "FUTURE",
          financial_source_id: "agenda-lesson-1",
        },
        {
          id: "lesson-2",
          class_id: null,
          class_name_snapshot: "Aula extra",
          lesson_date: "2026-09-20",
          number: 0,
          type: "EXTRA",
          student: "Ana",
          duration_minutes: 60,
          hourly_rate_cents: 12500,
          period: "16/09 a 30/09",
          payment_date: "2026-10-15",
          value_cents: 12500,
          status: "FUTURE",
        },
      ],
    };

    const markup = renderToStaticMarkup(
      <PaymentStatement
        payment={payment}
        onLessonFinancialStatusChange={vi.fn()}
        onCreateExtra={vi.fn()}
      />,
    );

    expect(markup).toContain("Aulas da competência");
    expect(markup).toContain("Turma de terça");
    expect(markup).toContain("Aula extra");
    expect(markup).toContain("Feriado");
    expect(markup).toContain("Cancelada");
    expect(markup).toContain("Adicionar aula extra");
    expect(markup).toContain("Status financeiro da aula 0");
    expect(markup).toContain("R$ 250,00");
  });
});
