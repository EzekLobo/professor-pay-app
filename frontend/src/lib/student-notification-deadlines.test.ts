import { describe, expect, it } from "vitest";
import { defaultNotificationSettings, evaluateStudentNotifications, nextStudentNotificationEvaluationAt, type NotificationLesson, type NotificationObligation } from "./student-notification-rules";
import { reconcileNotificationCases } from "./student-notification-store";
const lesson: NotificationLesson = { source: "manual", class_id: "group", class_name: "Python", student_id: "student", student_name: "Ana", occurrence_id: "lesson", lesson_label: "Aula", lesson_date: "2026-10-29", ended_at: "2026-10-29T21:00:00Z", active: true, cancelled: false, attendance: "absent", guardian_name: "", guardian_phone: "" };
const settings = { ...defaultNotificationSettings("2026-10-01"), enabled: true, tolerance_minutes: 15 };
const task = (patch: Partial<NotificationObligation> = {}): NotificationObligation => ({ id: "task", source: "manual", class_id: "group", student_id: "student", occurrence_id: "lesson", title: "Homework", kind: "homework", due_at: "2026-10-29T23:00:00Z", state: "missing", required: true, exempt: false, ...patch });
const at = Date.parse;
describe("local notification deadlines", () => {
  it("advances from end+tolerance to homework deadline using the same cached data", () => {
    const tasks = [task()];
    expect(nextStudentNotificationEvaluationAt([lesson], tasks, settings, at("2026-10-29T20:00:00Z"))).toBe(at("2026-10-29T21:15:00Z"));
    const first = new Date("2026-10-29T21:15:00Z");
    const initial = reconcileNotificationCases([], evaluateStudentNotifications([lesson], tasks, settings, first), first.toISOString());
    expect(initial.map(item => item.notification.category)).toEqual(["absence"]);
    initial[0].confirmed_revisions = ["absence"]; initial[0].read_revision = "absence";
    expect(nextStudentNotificationEvaluationAt([lesson], tasks, settings, first.getTime())).toBe(at("2026-10-29T23:15:00Z"));
    const second = new Date("2026-10-29T23:15:00Z");
    const updated = reconcileNotificationCases(initial, evaluateStudentNotifications([lesson], tasks, settings, second), second.toISOString());
    expect(updated).toHaveLength(2);
    expect(updated.find(item => item.notification.category === "absence")?.confirmed_revisions).toEqual(["absence"]);
    expect(updated.find(item => item.notification.category === "absence")?.read_revision).toBe("absence");
    expect(nextStudentNotificationEvaluationAt([lesson], tasks, settings, second.getTime())).toBeNull();
  });
  it("uses the configured local date for homework without an explicit deadline", () => {
    const config = { ...settings, homework_days_after_lesson: 1 };
    expect(nextStudentNotificationEvaluationAt([{ ...lesson, attendance: "other" }], [task({ due_at: null })], config, at("2026-10-29T22:00:00Z"))).toBe(at("2026-10-31T03:14:00Z"));
  });
  it("never schedules missing dates, exempt/delivered work, disabled rules or cancelled lessons", () => {
    const now = at("2026-10-29T22:00:00Z"); const other = { ...lesson, attendance: "other" as const };
    for (const item of [task({ exempt: true }), task({ state: "delivered" }), task({ due_at: "bad" })]) expect(nextStudentNotificationEvaluationAt([other], [item], settings, now)).toBeNull();
    expect(nextStudentNotificationEvaluationAt([{ ...lesson, cancelled: true }], [task()], settings, now)).toBeNull();
    expect(nextStudentNotificationEvaluationAt([lesson], [task()], { ...settings, enabled: false }, now)).toBeNull();
    expect(nextStudentNotificationEvaluationAt([{ ...lesson, ended_at: null }], [task()], settings, now)).toBeNull();
  });
  it("classroom delivery deadlines wait for both the lesson end and tolerance", () => {
    const config = { ...settings, attendance_enabled: false };
    expect(nextStudentNotificationEvaluationAt([lesson], [task({ kind: "classroom", due_at: "2026-10-29T22:00:00Z" })], config, at("2026-10-29T20:00:00Z"))).toBe(at("2026-10-29T22:15:00Z"));
    expect(nextStudentNotificationEvaluationAt([lesson], [task({ kind: "classroom", due_at: null })], config, at("2026-10-29T20:00:00Z"))).toBe(at("2026-10-29T21:15:00Z"));
  });
});
