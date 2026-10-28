import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ uid: "a", status: { status: "complete", sync_id: "1" }, failProgress: false }));
vi.mock("./firebase", () => ({ getFirebaseAuth: () => ({ currentUser: { uid: mock.uid } }) }));
vi.mock("./api", () => ({
  manualTeachingApi: { classes: async () => [], students: async () => [] },
  manualOperationsApi: { occurrences: async () => [], attendance: async () => [] },
  manualPedagogyApi: { activities: async () => [] }, tutorPreferencesApi: { get: async () => ({ kodland_enabled: true }) },
  kodlandApi: { notificationSyncStatus: async () => mock.status, groups: async () => ({ items: [] }), students: async () => ({ items: [] }), attendance: async () => ({ items: [] }), lessons: async () => ({ items: [] }), taskProgress: async () => { if (mock.failProgress) throw new Error("network"); return { items: [] }; } },
}));
import { clearStudentNotificationSourceCache, loadStudentNotificationSource, normalizeNotificationSource, type NotificationSourceSnapshot } from "./student-notification-source";
import { defaultNotificationSettings, evaluateStudentNotifications } from "./student-notification-rules";
const settings = { ...defaultNotificationSettings("2026-10-01"), enabled: true, classroom_rule: "more_than" as const, classroom_threshold: 0 };
const snapshot = (): NotificationSourceSnapshot => ({
  manualClasses: [{ id: "c", name: "Turma", active: true, student_ids: ["s"] } as NotificationSourceSnapshot["manualClasses"][number]],
  manualStudents: [{ id: "s", name: "Ana", active: true, guardian_name: "Maria", guardian_phone: "55" } as NotificationSourceSnapshot["manualStudents"][number]],
  manualOccurrences: [{ id: "l", class_id: "c", lesson_date: "2026-10-26", start_time: "18:00", duration_minutes: 60, status: "held", course_code: "M1L1" } as NotificationSourceSnapshot["manualOccurrences"][number]],
  manualAttendance: [{ occurrence_id: "l", class_id: "c", student_id: "s", status: "ABSENT" } as NotificationSourceSnapshot["manualAttendance"][number]],
  manualActivities: [{ id: "t", occurrence_id: "l", class_id: "c", student_id: "s", title: "Exercício", status: "assigned", submission_text: "", submission_url: "", kind: "classroom" } as NotificationSourceSnapshot["manualActivities"][number]],
  groups: [], students: [], lessons: [], attendance: [],
});
beforeEach(() => { mock.uid = "a"; mock.status = { status: "complete", sync_id: "1" }; mock.failProgress = false; clearStudentNotificationSourceCache(); });
describe("fontes de alertas", () => {
  it("liga tarefa atribuída, presença e responsável da turma correta", () => {
    const source = normalizeNotificationSource(snapshot(), settings);
    expect(source.lessons[0]).toMatchObject({ guardian_name: "Maria", guardian_phone: "55", ended_at: "2026-10-26T22:00:00.000Z", attendance: "absent" });
    expect(evaluateStudentNotifications(source.lessons, source.obligations, settings, new Date("2026-10-28T12:00:00Z"))).toHaveLength(2);
    const unrelated = snapshot(); unrelated.manualActivities[0].student_id = "outsider";
    expect(normalizeNotificationSource(unrelated, settings).obligations).toEqual([]);
  });
  it("entrega com conteúdo não vira cobrança e legado fica desconhecido", () => {
    const data = snapshot(); data.manualActivities[0].submission_text = "Minha entrega";
    expect(normalizeNotificationSource(data, settings).obligations[0].state).toBe("delivered");
    delete data.manualActivities[0].kind;
    const source = normalizeNotificationSource(data, settings);
    expect(source.obligations[0].kind).toBe("unknown"); expect(source.warnings).toHaveLength(1);
  });
  it("classifica progresso externo somente por IDs comprovados nos links de materiais", () => {
    const data = snapshot(); data.manualClasses = []; data.manualOccurrences = []; data.manualActivities = [];
    data.groups = [{ external_id: "k", title: "Python", archived: false } as NotificationSourceSnapshot["groups"][number]];
    data.students = [{ external_id: "s", external_class_id: "k", name: "Ana", status: "active", hidden: false, guardian_name: "Maria", guardian_phone: "55" } as NotificationSourceSnapshot["students"][number]];
    data.lessons = [{ id: "k-l", source_lesson_id: "l", external_class_id: "k", lesson_date: "2026-10-26", end_time: "19:00", title: "M1L1", classroom_tasks: [{ title: "Aula", url: "https://learn.kodland.org/pt/task/1/teacher/do" }], homework_url: "https://learn.kodland.org/pt/task/2/teacher/do" } as NotificationSourceSnapshot["lessons"][number]];
    data.taskProgress = ["1", "2", "3"].map(task_id => ({ id: `k-s-l-${task_id}`, external_class_id: "k", external_student_id: "s", lesson_id: "l", task_id, task_title: `Tarefa ${task_id}`, state: "missing" }));
    const source = normalizeNotificationSource(data, settings);
    expect(source.obligations.map(item => item.kind)).toEqual(["classroom", "homework", "unknown"]);
    expect(source.lessons).toHaveLength(1);
    expect(evaluateStudentNotifications(source.lessons, source.obligations, { ...settings, classroom_rule: "none_submitted" }, new Date("2026-10-28T12:00:00Z"))).toEqual([]);
    expect(evaluateStudentNotifications(source.lessons, source.obligations, { ...settings, homework_days_after_lesson: 1 }, new Date("2026-10-28T12:00:00Z")).map(item => item.category)).toEqual(["classroom", "homework"]);
  });
  it("não devolve snapshot vazio bem-sucedido se sincronização ou rede falhar", async () => {
    mock.status.status = "failed";
    await expect(loadStudentNotificationSource("a", settings)).rejects.toThrow("preservados");
    mock.status.status = "complete"; mock.failProgress = true;
    await expect(loadStudentNotificationSource("a", settings, true)).rejects.toThrow("network");
  });
  it("isola cache por UID e rejeita troca de conta", async () => {
    await loadStudentNotificationSource("a", settings);
    mock.uid = "b";
    await expect(loadStudentNotificationSource("a", settings)).rejects.toThrow("alterada");
    expect((await loadStudentNotificationSource("b", settings)).lessons).toEqual([]);
  });
});
