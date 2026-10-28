import { describe, expect, it } from "vitest";
import { defaultNotificationSettings, evaluateStudentNotifications, notificationLocalInstant, notificationMessage, notificationTarget, validateNotificationSettings, type NotificationLesson, type NotificationObligation } from "./student-notification-rules";
import { manualActivityNotificationFields } from "./manual-pedagogy";
import { kodlandDeliveryState } from "./kodland-task-progress";
const lesson: NotificationLesson = { source: "manual", class_id: "class", class_name: "Python", student_id: "student", student_name: "Ana", occurrence_id: "lesson", lesson_label: "M1L1", lesson_date: "2026-10-26", ended_at: "2026-10-26T21:00:00Z", active: true, cancelled: false, attendance: "other", guardian_name: "Maria", guardian_phone: "5511999999999" };
const settings = { ...defaultNotificationSettings("2026-10-01"), enabled: true };
const now = new Date("2026-10-28T15:00:00Z");
const activity = (id: string, changes: Partial<NotificationObligation> = {}): NotificationObligation => ({ id, source: "manual", class_id: "class", student_id: "student", occurrence_id: "lesson", title: `Atividade ${id}`, kind: "classroom", due_at: null, state: "missing", required: true, exempt: false, ...changes });
describe("regras de acompanhamento", () => {
  it("não confunde nenhuma atribuição com nenhuma entrega", () => {
    expect(evaluateStudentNotifications([lesson], [], settings, now)).toEqual([]);
    expect(evaluateStudentNotifications([lesson], [activity("1")], settings, now)[0].category).toBe("classroom");
  });
  it("mais de dois significa três, sem duplicar a mesma tarefa", () => {
    const rule = { ...settings, classroom_rule: "more_than" as const };
    expect(evaluateStudentNotifications([lesson], [activity("1"), activity("2"), activity("2")], rule, now)).toEqual([]);
    expect(evaluateStudentNotifications([lesson], [activity("1"), activity("2"), activity("3")], rule, now)[0].activities).toHaveLength(3);
  });
  it("entregue aguardando correção e estado desconhecido impedem zero entregas", () => {
    for (const state of ["delivered", "unknown"] as const) expect(evaluateStudentNotifications([lesson], [activity("1"), activity("2", { state })], settings, now)).toEqual([]);
    expect(evaluateStudentNotifications([lesson], [activity("1"), activity("2", { kind: "unknown" })], settings, now)).toEqual([]);
  });
  it("modo somente casa ignora tarefas da aula e respeita vencimento", () => {
    const rule = { ...settings, classroom_rule: "off" as const };
    const items = [activity("1"), activity("2", { kind: "homework", due_at: "2026-10-29T10:00:00Z" }), activity("3", { kind: "homework", due_at: "2026-10-27T10:00:00Z" })];
    expect(evaluateStudentNotifications([lesson], items, rule, now).map(item => [item.category, item.activities.map(task => task.id)])).toEqual([["homework", ["3"]]]);
  });
  it("casa sem prazo não cobra até definir política explícita no fuso escolhido", () => {
    const items = [activity("1", { kind: "homework" })];
    expect(evaluateStudentNotifications([lesson], items, settings, now)).toEqual([]);
    expect(evaluateStudentNotifications([lesson], items, { ...settings, homework_days_after_lesson: 1 }, now)[0].category).toBe("homework");
    expect(evaluateStudentNotifications([lesson], items, { ...settings, homework_days_after_lesson: 2 }, now)).toEqual([]);
  });
  it("não alerta antes do fim e aplica tolerância em minutos", () => {
    const items = [activity("1")];
    expect(evaluateStudentNotifications([lesson], items, settings, new Date("2026-10-26T20:59:00Z"))).toEqual([]);
    expect(evaluateStudentNotifications([lesson], items, { ...settings, tolerance_minutes: 60 }, new Date("2026-10-26T21:59:00Z"))).toEqual([]);
    expect(evaluateStudentNotifications([lesson], items, { ...settings, tolerance_minutes: 60 }, new Date("2026-10-26T22:00:00Z"))).toHaveLength(1);
  });
  it("falta explícita após a aula alerta e outros estados não", () => {
    expect(evaluateStudentNotifications([{ ...lesson, attendance: "absent" }], [], settings, now)[0].category).toBe("absence");
    for (const attendance of ["other", "unknown"] as const) expect(evaluateStudentNotifications([{ ...lesson, attendance }], [], settings, now)).toEqual([]);
  });
  it("ignora canceladas, inativos, anteriores ao início e dados sem fim confiável", () => {
    for (const patch of [{ cancelled: true }, { active: false }, { ended_at: null }, { lesson_date: "2026-09-30" }]) expect(evaluateStudentNotifications([{ ...lesson, ...patch }], [activity("1")], settings, now)).toEqual([]);
  });
  it("dispensadas/opcionais não contam e não mistura alunos", () => {
    expect(evaluateStudentNotifications([lesson], [activity("1", { exempt: true }), activity("2", { required: false }), activity("3", { student_id: "other" })], settings, now)).toEqual([]);
  });
  it("chaves e revisões são estáveis independentemente da ordem", () => {
    const first = evaluateStudentNotifications([lesson], [activity("1"), activity("2")], settings, now)[0];
    const second = evaluateStudentNotifications([lesson], [activity("2"), activity("1")], settings, now)[0];
    expect(first.id).toBe(second.id); expect(first.revision).toBe(second.revision);
    expect(notificationTarget(first)).toContain("tab=activities");
    expect(notificationTarget(first, true)).toContain("#corrections");
    expect(notificationTarget(first)).not.toContain("Ana");
    expect(notificationMessage(first, "{responsavel}: {aluno}, {atividades}")).toBe("Maria: Ana, Atividade 1, Atividade 2");
  });
  it("valida configurações e conversões civis sem depender do fuso do servidor", () => {
    expect(validateNotificationSettings(settings)).toEqual(settings);
    for (const patch of [{ classroom_threshold: -1 }, { classroom_threshold: 2.5 }, { tolerance_minutes: -1 }, { time_zone: "invalid" }, { start_date: "2026-02-30" }]) expect(() => validateNotificationSettings({ ...settings, ...patch })).toThrow();
    expect(notificationLocalInstant("2026-10-26", "18:00", "America/Sao_Paulo")).toBe("2026-10-26T21:00:00.000Z");
    expect(notificationLocalInstant("2026-02-30", "18:00", "America/Sao_Paulo")).toBeNull();
  });
  it("legados não ganham classificação automática e edições preservam metadados", () => {
    expect(manualActivityNotificationFields({})).toEqual({ kind: "unknown", due_at: null, required: true, exempt: false });
    expect(manualActivityNotificationFields({}, { kind: "homework", due_at: "2026-10-28T20:00:00Z", exempt: true }).kind).toBe("homework");
    expect(() => manualActivityNotificationFields({ due_at: "2026-10-28T20:00" })).toThrow();
  });
  it("mapeia apenas os estados documentados do progresso externo", () => {
    expect(kodlandDeliveryState("TASK_NOT_SUBMITTED")).toBe("missing");
    for (const status of ["TASK_SUBMITTED", "TASK_SUBMITTED_LATE", "TASK_CHECKED"]) expect(kodlandDeliveryState(status)).toBe("delivered");
    for (const status of ["TASK_NOT_GRADED", "new_status", null]) expect(kodlandDeliveryState(status)).toBe("unknown");
  });
});
