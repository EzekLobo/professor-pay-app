import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { DashboardResponse } from "@/lib/api";
import { DashboardContent } from "./dashboard-content";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: unknown }) => <a href={href}>{children}</a>,
}));

const dashboard: DashboardResponse = {
  today: "2026-09-29", earned_cents: 123450, received_cents: 50000, normal_lessons: 8, extra_lessons: 2,
  normal_earned_cents: 100000, extra_earned_cents: 23450, planned_cents: 15000, future_lessons: 1,
  total_planned_cents: 138450, total_lessons: 10, last_payment: null,
  next_payment: { payment_date: "2026-10-01", period: "16/09 a 30/09", lesson_count: 2, normal_count: 2, extra_count: 0, normal_total_cents: 25000, extra_total_cents: 0, total_cents: 25000, status: "FUTURE", lessons: [] },
  payments: [], progress: [{ class_id: "class-1", name: "Matemática", lesson_count: 10, completed: 4, remaining: 6, percent: 40 }],
};

describe("DashboardContent", () => {
  it("exibe o estado de carregamento", () => expect(renderToStaticMarkup(<DashboardContent state="loading" />)).toContain("Sincronizando seu resumo financeiro"));
  it("exibe erro e ação de nova tentativa", () => { const markup = renderToStaticMarkup(<DashboardContent state="error" onRetry={vi.fn()} />); expect(markup).toContain("Não foi possível carregar o resumo"); expect(markup).toContain("Tentar novamente"); });
  it("exibe métricas em pt-BR e progresso", () => { const markup = renderToStaticMarkup(<DashboardContent state="ready" dashboard={dashboard} />); expect(markup).toContain("R$ 1.234,50"); expect(markup).toContain("Progresso das turmas"); expect(markup).toContain("40%"); expect(markup).toContain("1 de out. de 2026"); });
  it("exibe ações para iniciar quando não há aulas", () => expect(renderToStaticMarkup(<DashboardContent state="ready" dashboard={{ ...dashboard, total_lessons: 0 }} />)).toContain("Crie uma turma ou registre uma aula extra"));
});
