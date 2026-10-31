import { describe, expect, it, vi } from "vitest";
import { createKodlandAutoSync, type AutoSyncContext, type AutoSyncStatus } from "./kodland-auto-sync";
import { defaultNotificationSettings, evaluateStudentNotifications, needsNotificationContact, notificationMessage, type NotificationLesson, type NotificationObligation } from "./student-notification-rules";
import { reconcileNotificationCases } from "./student-notification-store";

function setup() {
  let time = Date.parse("2026-10-31T22:00:00Z");
  let owner = true;
  const context: AutoSyncContext = { enabled: true, groups: ["a", "b"], updatedAt: {} };
  const status = vi.fn<(value: AutoSyncStatus) => void>();
  const sync = vi.fn<(id: string) => Promise<void>>(async () => undefined);
  const credentials = vi.fn(async () => ({ username: "demo", password: "not-real" }));
  const controller = createKodlandAutoSync({ owner: () => owner, context: vi.fn(async () => context), credentials, sync, status, now: () => time });
  const tick = (options = {}) => controller.tick({ active: true, online: true, following: true, ...options });
  return { context, sync, status, credentials, tick, advance: (minutes: number) => { time += minutes * 60000; }, owner: (value: boolean) => { owner = value; } };
}
describe("atualização automática da Kodland", () => {
  it("atualiza por turma e respeita 5 minutos em acompanhamento e 15 fora dele", async () => {
    const app = setup(); await app.tick(); expect(app.sync.mock.calls.map(call => call[0])).toEqual(["a", "b"]);
    app.advance(4); await app.tick(); expect(app.sync).toHaveBeenCalledTimes(2);
    app.advance(1); await app.tick(); expect(app.sync).toHaveBeenCalledTimes(4);
    app.advance(6); await app.tick({ following: false }); expect(app.sync).toHaveBeenCalledTimes(4);
    app.advance(9); await app.tick({ following: false }); expect(app.sync).toHaveBeenCalledTimes(6);
  });
  it("não consulta sem conexão, na aba oculta, conta trocada ou integração desativada", async () => {
    const app = setup(); await app.tick({ online: false }); await app.tick({ active: false }); app.owner(false); await app.tick();
    expect(app.credentials).not.toHaveBeenCalled(); app.owner(true); app.context.enabled = false; await app.tick();
    expect(app.sync).not.toHaveBeenCalled(); expect(app.status).toHaveBeenLastCalledWith({ phase: "disabled" });
  });
  it("não importa cadastros sem turmas, nem insiste quando faltam credenciais", async () => {
    const app = setup(); app.context.groups = []; await app.tick(); expect(app.credentials).not.toHaveBeenCalled();
    app.advance(1); app.context.groups = ["a"]; app.credentials.mockResolvedValue(null as never); await app.tick();
    expect(app.sync).not.toHaveBeenCalled(); expect(app.status.mock.lastCall?.[0].phase).toBe("credentials");
  });
  it("respeita atualização manual já persistida e não sobrepõe execuções", async () => {
    const app = setup(); app.context.updatedAt.a = "2026-10-31T21:59:00Z";
    let finish!: () => void; app.sync.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    const running = app.tick(); await vi.waitFor(() => expect(app.sync).toHaveBeenCalledTimes(1)); await app.tick();
    expect(app.sync.mock.calls[0][0]).toBe("b"); finish(); await running; expect(app.sync).toHaveBeenCalledTimes(1);
  });
  it("repara uma gravação incompleta mesmo se houver uma atualização recente em cache", async () => {
    const app = setup(); await app.tick();
    app.context.blockedGroups = ["a"]; app.advance(1); await app.tick();
    expect(app.sync.mock.calls.map(call => call[0])).toEqual(["a", "b", "a"]);
  });
  it("para na falha e faz nova tentativa com espera progressiva", async () => {
    const app = setup(); app.sync.mockRejectedValueOnce(new Error("offline")); await app.tick();
    expect(app.sync).toHaveBeenCalledTimes(1); expect(app.status.mock.lastCall?.[0].message).toContain("preservados");
    app.advance(1); await app.tick(); expect(app.sync).toHaveBeenCalledTimes(1);
    app.advance(1); await app.tick(); expect(app.sync).toHaveBeenCalledTimes(3);
  });
  it("abandona a sequência quando a conta muda durante a sincronização", async () => {
    const app = setup(); app.sync.mockImplementation(async () => { app.owner(false); }); await app.tick(); expect(app.sync).toHaveBeenCalledTimes(1);
    expect(app.status.mock.calls.some(([value]) => value.phase === "ready")).toBe(false);
  });
  it("reavalia faltas e entregas após atualizar, sem duplicar nem presumir envio", async () => {
    const settings = { ...defaultNotificationSettings("2026-10-01"), enabled: true, activity_message_template: "{responsavel}: {aluno} deve {atividades}" };
    let lesson: NotificationLesson = { source: "kodland", class_id: "a", class_name: "Python", student_id: "s", student_name: "Ana", occurrence_id: "l", lesson_label: "M1L1", lesson_date: "2026-10-31", ended_at: "2026-10-31T21:00:00Z", active: true, cancelled: false, attendance: "unknown", guardian_name: "Maria", guardian_phone: "5511999990000" };
    let obligations: NotificationObligation[] = [];
    let cases: ReturnType<typeof reconcileNotificationCases> = [];
    const app = setup(); app.context.groups = ["a"];
    app.sync.mockImplementation(async () => {
      lesson = { ...lesson, attendance: "absent" };
      obligations = [{ id: "task", source: "kodland", class_id: "a", student_id: "s", occurrence_id: "l", title: "Projeto", kind: "classroom", due_at: null, state: "missing", required: true, exempt: false }];
      const stamp = "2026-10-31T22:00:00Z";
      cases = reconcileNotificationCases(cases, evaluateStudentNotifications([lesson], obligations, settings, new Date(stamp)), stamp);
    });
    await app.tick(); expect(cases.filter(needsNotificationContact)).toHaveLength(2);
    const activity = cases.find(item => item.notification.category === "classroom")!;
    expect(notificationMessage(activity.notification, settings.activity_message_template)).toBe("Maria: Ana deve Projeto");
    app.advance(5); await app.tick(); expect(cases).toHaveLength(2);
    lesson.attendance = "other"; obligations[0].state = "delivered";
    cases = reconcileNotificationCases(cases, evaluateStudentNotifications([lesson], obligations, settings, new Date("2026-10-31T22:10:00Z")), "2026-10-31T22:10:00Z");
    expect(cases.filter(needsNotificationContact)).toHaveLength(0); expect(cases).toHaveLength(2);
  });
});
