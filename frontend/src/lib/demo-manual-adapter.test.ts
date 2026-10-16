import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoManualAdapter } from "./demo-manual-adapter";
import { createDemoSnapshot, demoDashboard } from "./demo-snapshot";
import { restoreDemoState } from "./demo-storage";

afterEach(() => vi.useRealTimers());

describe("visitor's local manual-management adapter", () => {
  const setup = () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    let snapshot = createDemoSnapshot();
    const adapter = createDemoManualAdapter(() => snapshot, (change) => { snapshot = change(snapshot); });
    return { adapter, read: () => snapshot };
  };

  it("uses the private recurrence/payment calculation and persists a class and student across reload", async () => {
    const { adapter, read } = setup();
    await adapter.settings.setDefaultRate(6000);
    const group = await adapter.teaching.saveGroup({ name: "Particulares" });
    const student = await adapter.teaching.saveStudent({ name: "Joana Fictícia", email: "joana@example.test" });
    const classroom = await adapter.teaching.saveClass({
      name: "Matemática particular", first_lesson_date: "2026-10-12", end_date: null,
      schedule_slots: [{ id: "quarta", week_day: 2, start_time: "18:00", duration_minutes: 90 }],
      student_ids: [student.id], hourly_rate_cents: null, payment_day: 20, group_id: group.id,
    });
    expect(classroom.initial_default_rate_cents).toBe(6000);
    const result = demoDashboard(read());
    const first = result.payments.flatMap((payment) => payment.lessons).find((lesson) => lesson.id === `manual:${classroom.id}:quarta:2026-10-14`);
    expect(first).toMatchObject({ value_cents: 9000, payment_date: "2026-11-20", status: "COMPLETED" });
    const reloaded = restoreDemoState(createDemoSnapshot(), JSON.stringify({ version: 2, snapshot: read(), holidays: [] })).snapshot;
    expect(reloaded.manualClasses).toHaveLength(1);
    expect(reloaded.manualStudents).toHaveLength(1);
    expect(reloaded.manualClassGroups).toContainEqual(expect.objectContaining({ id: group.id, name: "Particulares" }));
    expect(demoDashboard(reloaded).payments.flatMap((payment) => payment.lessons).find((lesson) => lesson.id === first?.id)?.value_cents).toBe(9000);
  });

  it("keeps historical rate, submits and corrects an activity without Firestore", async () => {
    const { adapter, read } = setup();
    await adapter.settings.setDefaultRate(5000);
    const group = await adapter.teaching.saveGroup({ name: "Redação" });
    const student = await adapter.teaching.saveStudent({ name: "Aluno Fictício" });
    const classroom = await adapter.teaching.saveClass({ name: "Redação", first_lesson_date: "2026-10-12", schedule_slots: [{ id: "qua", week_day: 2, start_time: "08:00", duration_minutes: 60 }], student_ids: [student.id], hourly_rate_cents: null, payment_day: 15, group_id: group.id });
    const occurrenceId = `manual:${classroom.id}:qua:2026-10-14`;
    const content = await adapter.pedagogy.saveLesson({ class_id: classroom.id, occurrence_id: occurrenceId, title: "Texto argumentativo", content: "Escreva um parágrafo." });
    const activity = await adapter.pedagogy.saveActivity({ class_id: classroom.id, student_id: student.id, occurrence_id: occurrenceId, title: "Atividade 1", submission_text: "Minha resposta", status: "pending" });
    expect(read().manualLessons).toContainEqual(content);
    expect(demoDashboard(read()).payments.flatMap((payment) => payment.lessons).find((lesson) => lesson.id === occurrenceId)?.value_cents).toBe(5000);
    await adapter.settings.setDefaultRate(7000);
    expect(demoDashboard(read()).payments.flatMap((payment) => payment.lessons).find((lesson) => lesson.id === occurrenceId)?.value_cents).toBe(5000);
    await adapter.pedagogy.saveActivity({ ...activity, feedback: "Bom trabalho", status: "completed" });
    const restored = restoreDemoState(createDemoSnapshot(), JSON.stringify({ version: 2, snapshot: read(), holidays: [] })).snapshot;
    expect(restored.manualActivities[0]).toMatchObject({ feedback: "Bom trabalho", status: "completed" });
    expect(restored.manualLessons[0].title).toBe("Texto argumentativo");
  });

  it("preserves visitor records when the next day changes the fictional seed", async () => {
    const { adapter, read } = setup();
    const group = await adapter.teaching.saveGroup({ name: "Persistentes" });
    const student = await adapter.teaching.saveStudent({ name: "Aluno persistente" });
    await adapter.teaching.saveClass({ name: "Turma persistente", first_lesson_date: "2026-10-14", schedule_slots: [{ id: "qua", week_day: 2, start_time: "08:00", duration_minutes: 60 }], student_ids: [student.id], hourly_rate_cents: 5000, payment_day: 15, group_id: group.id });
    const stored = JSON.stringify({ version: 2, snapshot: read(), holidays: [] });
    vi.setSystemTime(new Date("2026-10-15T12:00:00Z"));
    const restored = restoreDemoState(createDemoSnapshot(), stored).snapshot;
    expect(restored.today).toBe("2026-10-15");
    expect(restored.manualStudents.map((item) => item.name)).toContain("Aluno persistente");
    expect(restored.manualClasses.map((item) => item.name)).toContain("Turma persistente");
  });

  it("organizes groups locally, blocks deletion while a class is assigned and keeps old classes ungrouped", async () => {
    const { adapter, read } = setup();
    const later = await adapter.teaching.saveGroup({ name: "Depois", order: 5 });
    const first = await adapter.teaching.saveGroup({ name: "Primeiro", order: 1 });
    expect((await adapter.teaching.groups()).map((item) => item.id)).toEqual([first.id, later.id]);
    const renamed = await adapter.teaching.saveGroup({ id: first.id, name: "Autônomas", order: 0, active: false });
    expect(renamed).toMatchObject({ name: "Autônomas", active: false, order: 0 });
    await expect(adapter.teaching.saveClass({ name: "Sem grupo", first_lesson_date: "2026-10-14", schedule_slots: [{ id: "qua", week_day: 2, start_time: "08:00", duration_minutes: 60 }], student_ids: [], hourly_rate_cents: 5000, payment_day: 15 })).rejects.toThrow(/grupo/);
    const classroom = await adapter.teaching.saveClass({ name: "Vinculada", first_lesson_date: "2026-10-14", schedule_slots: [{ id: "qua", week_day: 2, start_time: "08:00", duration_minutes: 60 }], student_ids: [], hourly_rate_cents: 5000, payment_day: 15, group_id: later.id });
    await expect(adapter.teaching.deleteGroup(later.id)).rejects.toThrow(/Mova/);
    const legacy = { ...classroom, id: "demo-manual-legacy", group_id: null };
    const restored = restoreDemoState(createDemoSnapshot(), JSON.stringify({ version: 2, snapshot: { ...read(), manualClasses: [legacy] }, holidays: [] })).snapshot;
    expect(restored.manualClasses[0].group_id).toBeNull();
  });

  it("does not restore foreign or unsafe local records", () => {
    const { read } = setup();
    const poisoned = { ...read(), manualStudents: [{ id: "real-account", name: "Privado" }], manualClasses: [{ id: "real-class", name: "Privado", schedule_slots: [] }], manualLessons: [{ id: "demo-manual-lesson", class_id: "real-class", title: "Privado" }] };
    const restored = restoreDemoState(createDemoSnapshot(), JSON.stringify({ version: 2, snapshot: poisoned, holidays: [] })).snapshot;
    expect(restored.manualStudents).toEqual([]);
    expect(restored.manualClasses).toEqual([]);
    expect(restored.manualLessons).toEqual([]);
  });
});
