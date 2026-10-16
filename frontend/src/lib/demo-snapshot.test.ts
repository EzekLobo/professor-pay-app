import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoSnapshot, demoDashboard, demoFinancialInputs, demoFinancialLessonId, demoToday } from "./demo-snapshot";
import { calculateDashboard } from "./api";
import { activeStudentsRankedByPoints, kodlandStudentPoints } from "./student-ranking";
import { restoreDemoState } from "./demo-storage";

afterEach(() => vi.useRealTimers());
describe("public faithful demonstration", () => {
  it("uses São Paulo date and fictional data with no external account links", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-15T01:00:00Z"));
    const seed = createDemoSnapshot();
    expect(demoToday()).toBe("2026-10-14");
    expect(seed.groups).toHaveLength(3);
    expect(seed.students).toHaveLength(12);
    expect(seed.manualClassGroups).toContainEqual(expect.objectContaining({ name: "Turmas autônomas" }));
    expect(seed.manualClasses).toContainEqual(expect.objectContaining({
      name: "Matemática particular", group_id: seed.manualClassGroups[0].id,
    }));
    expect(seed.manualStudents).toContainEqual(expect.objectContaining({ name: "Helena Nogueira" }));
    expect(seed.students.every((item) => item.email.endsWith("@example.test") && item.profile_url === "" && item.phone === "")).toBe(true);
    expect(seed.lessons.every((item) => item.materials_status === "ready" && item.external_url.startsWith("#demo-material"))).toBe(true);
    expect(seed.extras.some((item) => item.lesson_date === "2026-10-14" && !item.completed)).toBe(true);
    expect(kodlandStudentPoints(activeStudentsRankedByPoints(seed.students)[0].progress_summary)).toBe(940);
  });
  it("reconciles simulated extra status, financial classification and payment status locally", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const seed = createDemoSnapshot();
    const before = demoDashboard(seed);
    expect(before.payments.every((payment) => payment.payment_date.endsWith("-15"))).toBe(true);
    const extra = seed.extras.find((item) => !item.completed)!;
    const after = demoDashboard({ ...seed, extras: seed.extras.map((item) => item.id === extra.id ? { ...item, completed: true, manual_status: "DONE" } : item) });
    expect(after.extra_lessons).toBe(before.extra_lessons + 1);
    expect(after.total_planned_cents - before.total_planned_cents).toBe(3000);
    const lesson = seed.lessons[0];
    const omitted = demoDashboard({ ...seed, financialStatus: { [lesson.id]: "CANCELED" } });
    expect(before.total_planned_cents - omitted.total_planned_cents).toBe(4500);
    const date = before.next_payment!.payment_date;
    const paid = demoDashboard({ ...seed, paymentStatus: { [date]: "RECEIVED" } });
    expect(paid.payments.find((payment) => payment.payment_date === date)?.status).toBe("RECEIVED");
    expect(createDemoSnapshot().paymentStatus).toEqual({});
  });
  it("excludes a custom holiday from an open payment and allows an explicit billable override", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const seed = createDemoSnapshot();
    const lesson = seed.lessons.find((item) => item.lesson_date === "2026-10-15")!;
    const holiday = { id: "demo-holiday", date: lesson.lesson_date, name: "Feriado fictício", source: "CUSTOM" as const, affects_financial_total: true as const, created_at: seed.today, updated_at: seed.today };
    const original = demoDashboard(seed);
    expect(demoDashboard(seed, [holiday]).total_planned_cents).toBe(original.total_planned_cents - 4500);
    expect(demoDashboard({ ...seed, financialStatus: { [lesson.id]: "BILLABLE" } }, [holiday]).total_planned_cents).toBe(original.total_planned_cents);
  });
  it("restores only permitted local changes and keeps seeded account links and identities", () => {
    const seed = createDemoSnapshot();
    const raw = JSON.stringify({ version: 2, snapshot: { ...seed, groups: [{ external_id: "real-account" }], students: [{ profile_url: "https://private.example" }], financialStatus: { [seed.lessons[0].id]: "CANCELED", unknown: "BILLABLE" }, reviews: [] } });
    const restored = restoreDemoState(seed, raw).snapshot;
    expect(restored.groups).toEqual(seed.groups);
    expect(restored.students).toEqual(seed.students);
    expect(restored.financialStatus).toEqual({ [demoFinancialLessonId(seed.lessons[0])]: "CANCELED" });
    expect(restored.reviews).toEqual([]);
    expect(restoreDemoState(seed, "{bad-json").snapshot).toEqual(seed);
  });
  it("restores the visitor's personal groups together with their classes", () => {
    const seed = createDemoSnapshot();
    const restored = restoreDemoState(seed, JSON.stringify({
      version: 2,
      snapshot: {
        ...seed,
        manualClassGroups: [{
          id: "demo-manual-group-persisted", name: "Reforço", order: 2, active: true,
          created_at: seed.today, updated_at: seed.today,
        }],
        manualStudents: [{
          id: "demo-manual-student-persisted", name: "Ravi", email: "", phone: "", active: true,
          created_at: seed.today, updated_at: seed.today,
        }],
        manualClasses: [{
          id: "demo-manual-class-persisted", source: "manual", name: "Reforço de matemática",
          group_id: "demo-manual-group-persisted", first_lesson_date: "2026-10-01", end_date: null,
          schedule_slots: [{ id: "qua", week_day: 2, start_time: "18:00", duration_minutes: 60, effective_from: "2026-10-01" }],
          hourly_rate_cents: null, rate_history: [{ effective_from: "2026-10-01", hourly_rate_cents: 6000 }],
          initial_default_rate_cents: null, payment_day: 15,
          payment_day_history: [{ effective_from: "2026-10-01", payment_day: 15 }],
          student_ids: ["demo-manual-student-persisted"], active: true,
          created_at: seed.today, updated_at: seed.today,
        }],
      },
      holidays: [],
    })).snapshot;
    expect(restored.manualClassGroups).toEqual([expect.objectContaining({ name: "Reforço" })]);
    expect(restored.manualClasses).toEqual([expect.objectContaining({ group_id: "demo-manual-group-persisted" })]);
  });
  it("uses exactly the private financial engine with raw Kodland rows and no assumed payment confirmations", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const seed = createDemoSnapshot();
    const inputs = demoFinancialInputs(seed);
    expect(inputs[2]).toEqual([]);
    const result = demoDashboard(seed);
    expect(result).toEqual(calculateDashboard(...inputs));
    expect(result.payments.some((payment) => payment.status === "RECEIVED")).toBe(false);
    expect(demoDashboard({ ...seed, today: "2026-10-16" }).payments.find((payment) => payment.payment_date === "2026-10-15")?.status).toBe("OVERDUE");
    expect(result.payments.flatMap((payment) => payment.lessons)
      .filter((lesson) => lesson.type === "NORMAL" && lesson.id.startsWith("kodland-"))).toHaveLength(24);
    const lesson = result.payments.flatMap((payment) => payment.lessons).find((item) => item.financial_source_id === seed.lessons[0].id)!;
    expect(lesson.id).toBe(demoFinancialLessonId(seed.lessons[0]));
    expect(lesson.duration_minutes).toBe(90);
    expect(lesson.period).toBe("09/2026");
  });
  it.each(["PENDING", "DONE", "ACCOUNTED"] as const)("uses private date and extra rules for %s", (manualStatus) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const seed = createDemoSnapshot();
    const extras = seed.extras.map((extra) => ({ ...extra, completed: true, manual_status: manualStatus }));
    const scenario = { ...seed, extras };
    const result = demoDashboard(scenario);
    expect(result).toEqual(calculateDashboard(...demoFinancialInputs(scenario)));
    const financialExtras = result.payments.flatMap((payment) => payment.lessons).filter((lesson) => lesson.type === "EXTRA");
    expect(financialExtras).toHaveLength(manualStatus === "PENDING" ? 0 : 3);
    if (manualStatus !== "PENDING") {
      expect(financialExtras.find((lesson) => lesson.lesson_date === seed.today)?.status).toBe("COMPLETED");
      expect(financialExtras.find((lesson) => lesson.lesson_date > seed.today)?.status).toBe("FUTURE");
      expect(result.extra_lessons).toBe(2);
    }
  });
  it("preserves received competencies against automatic calendar changes through the same engine", () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const seed = createDemoSnapshot();
    const lesson = seed.lessons.find((item) => item.lesson_date === "2026-10-15")!;
    const holiday = { id: "demo-holiday", date: lesson.lesson_date, name: "Feriado fictício", source: "CUSTOM" as const, affects_financial_total: true as const, created_at: seed.today, updated_at: seed.today };
    const paymentDate = "2026-11-15";
    const received = { ...seed, paymentStatus: { [paymentDate]: "RECEIVED" as const } };
    expect(demoDashboard(received, [holiday])).toEqual(calculateDashboard(...demoFinancialInputs(received, [holiday])));
    expect(demoDashboard(received, [holiday]).payments.find((payment) => payment.payment_date === paymentDate)?.total_cents).toBe(demoDashboard(received).payments.find((payment) => payment.payment_date === paymentDate)?.total_cents);
  });
});
