import { describe, expect, it } from "vitest";
import { planManualOccurrences, renderAbsenceMessage } from "./manual-operations";
import { calculateDashboard } from "./api";
import type { ManualClass } from "./manual-teaching";
import type { ManualCourse } from "./manual-courses";

const classroom: ManualClass = {
  id: "class-1", source: "manual", name: "Turma", group_id: "group-1", course_id: "course-1",
  first_lesson_date: "2026-10-05", end_date: "2026-11-02", schedule_slots: [{ id: "monday", week_day: 0, start_time: "19:00", duration_minutes: 60, effective_from: "2026-10-05" }], hourly_rate_cents: null, rate_history: [{ effective_from: "2026-10-05", hourly_rate_cents: 5000 }], initial_default_rate_cents: null, payment_day: 15, payment_day_history: [{ effective_from: "2026-10-05", payment_day: 15 }], student_ids: ["student-1"], active: true, created_at: "2026-10-01", updated_at: "2026-10-01",
};
const lesson = (id: string, title: string) => ({ id, title, activities: "", guide: "", slides: "", homework: "" });
const course: ManualCourse = { id: "course-1", name: "Curso", modules: [
  { id: "module-1", title: "Módulo 1", lessons: [lesson("1-1", "A"), lesson("1-2", "B")] },
  { id: "module-2", title: "Módulo 2", lessons: [lesson("2-1", "C"), lesson("2-2", "D"), lesson("2-3", "E")] },
], created_at: "2026-10-01", updated_at: "2026-10-01" };

describe("operações manuais", () => {
  it("gera códigos pela posição real dentro de módulos com tamanhos diferentes", () => {
    const rows = planManualOccurrences({ classroom, course, from: "2026-10-05", to: "2026-11-02", timestamp: "2026-10-01" });
    expect(rows.map((row) => row.course_code)).toEqual(["M1L1", "M1L2", "M2L1", "M2L2", "M2L3"]);
  });

  it("não consome a sequência quando uma ocorrência é cancelada", () => {
    const initial = planManualOccurrences({ classroom, course, from: "2026-10-05", to: "2026-11-02", timestamp: "2026-10-01" });
    const existing = initial.map((row, index) => index === 1 ? { ...row, status: "cancelled" as const } : row);
    const replanned = planManualOccurrences({ classroom, course, existing, from: "2026-10-05", to: "2026-11-02", timestamp: "2026-10-02" });
    expect(replanned.map((row) => row.course_code)).toEqual(["M1L1", "M1L2", "M1L2", "M2L1", "M2L2"]);
  });

  it("omite o bloco da gravação quando não existe link e usa somente o primeiro nome", () => {
    const message = renderAbsenceMessage({ template: "Olá, {primeiro_nome}!\n{codigo_aula} em {data}\n{gravacao}", studentName: "Ana Maria", lessonCode: "M2L1", date: "19/10/2026" });
    expect(message).toBe("Olá, Ana!\nM2L1 em 19/10/2026");
  });

  it("cobra uma ocorrência uma única vez, independentemente da quantidade de alunos, e ignora canceladas", () => {
    const rows = planManualOccurrences({ classroom: { ...classroom, student_ids: ["a", "b", "c"] }, course, from: "2026-10-05", to: "2026-10-12", timestamp: "2026-10-01" });
    const dashboard = calculateDashboard([{ ...classroom, student_ids: ["a", "b", "c"] }], [], [], [], [], "2026-10-20", [], [], [], [], [], rows.map((item, index) => index ? { ...item, status: "cancelled" } : item));
    expect(dashboard.total_lessons).toBe(1);
    expect(dashboard.total_planned_cents).toBe(5000);
  });
});

describe("controle explícito da sequência curricular", () => {
  it("preserva uma substituição sem consumir a próxima aula automática", () => {
    const initial = planManualOccurrences({ classroom, course, from: "2026-10-05", to: "2026-11-02", timestamp: "2026-10-01" });
    const replacement = { ...initial[1], curriculum_mode: "override" as const, course_lesson_id: "2-3", course_code: "M2L3", title_snapshot: "E" };
    const replanned = planManualOccurrences({ classroom, course, existing: [initial[0], replacement], from: "2026-10-05", to: "2026-11-02", timestamp: "2026-10-02" });
    expect(replanned.map((row) => row.course_code)).toEqual(["M1L1", "M2L3", "M1L2", "M2L1", "M2L2"]);
  });

  it("consome uma aula marcada como pulada", () => {
    const initial = planManualOccurrences({ classroom, course, from: "2026-10-05", to: "2026-11-02", timestamp: "2026-10-01" });
    const skipped = { ...initial[1], curriculum_mode: "skip" as const };
    const replanned = planManualOccurrences({ classroom, course, existing: [initial[0], skipped], from: "2026-10-05", to: "2026-11-02", timestamp: "2026-10-02" });
    expect(replanned.map((row) => row.course_code)).toEqual(["M1L1", "", "M2L1", "M2L2", "M2L3"]);
  });
});
