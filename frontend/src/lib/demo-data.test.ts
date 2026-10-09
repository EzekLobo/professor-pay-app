import { describe, expect, it } from "vitest";
import {
  DEMO_STORAGE_KEY,
  LocalDemoDataAdapter,
  createDemoSeed,
  type DemoDataStore,
} from "./demo-data";

class MemoryStore implements DemoDataStore {
  private readonly entries = new Map<string, string>();

  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }

  removeItem(key: string) {
    this.entries.delete(key);
  }
}

const adapterFor = (storage = new MemoryStore()) => {
  let sequence = 0;
  return {
    storage,
    adapter: new LocalDemoDataAdapter({
      storage,
      now: () => "2026-10-09T12:00:00.000Z",
      create_id: (entity) => `${entity}-created-${++sequence}`,
    }),
  };
};

describe("LocalDemoDataAdapter", () => {
  it("executes CRUD for students, classrooms, lessons, and payments", async () => {
    const { adapter } = adapterFor();
    const student = await adapter.createStudent({
      name: "Joana Teste",
      email: "joana@example.test",
      phone: "",
      guardian_name: "",
      active: true,
    });
    const classroom = await adapter.createClassroom({
      name: "Turma de teste",
      course_name: "Curso fictício",
      student_ids: [student.id],
      week_days: [5],
      start_time: "16:00",
      duration_minutes: 60,
      hourly_rate_cents: 5000,
      active: true,
    });
    const lesson = await adapter.createLesson({
      class_id: classroom.id,
      student_ids: [student.id],
      title: "Aula de teste",
      lesson_date: "2026-10-10",
      start_time: "16:00",
      duration_minutes: 60,
      value_cents: 5000,
      type: "REGULAR",
      status: "SCHEDULED",
      active: true,
    });
    const payment = await adapter.createPayment({
      period: "Outubro de 2026",
      due_date: "2026-11-15",
      lesson_ids: [lesson.id],
      total_cents: 5000,
      status: "PENDING",
      received_at: null,
      note: "",
    });

    await expect(adapter.updateStudent(student.id, { active: false })).resolves.toMatchObject({ active: false });
    await expect(adapter.updateClassroom(classroom.id, { name: "Turma alterada" })).resolves.toMatchObject({ name: "Turma alterada" });
    await expect(adapter.updateLesson(lesson.id, { status: "COMPLETED" })).resolves.toMatchObject({ status: "COMPLETED" });
    await expect(adapter.updatePayment(payment.id, { status: "RECEIVED", received_at: "2026-10-10T12:00:00.000Z" })).resolves.toMatchObject({ status: "RECEIVED" });

    await adapter.deletePayment(payment.id);
    await adapter.deleteLesson(lesson.id);
    await adapter.deleteClassroom(classroom.id);
    await adapter.deleteStudent(student.id);

    await expect(adapter.getStudent(student.id)).resolves.toBeNull();
    await expect(adapter.getClassroom(classroom.id)).resolves.toBeNull();
    await expect(adapter.getLesson(lesson.id)).resolves.toBeNull();
    await expect(adapter.getPayment(payment.id)).resolves.toBeNull();
  });

  it("persists browser changes and calculates dashboard indicators", async () => {
    const { adapter, storage } = adapterFor();
    await adapter.createPayment({
      period: "Outubro de 2026",
      due_date: "2026-11-15",
      lesson_ids: [],
      total_cents: 9900,
      status: "RECEIVED",
      received_at: "2026-10-09T12:00:00.000Z",
      note: "Pagamento de teste",
    });

    const restoredAdapter = new LocalDemoDataAdapter({ storage });
    const snapshot = await restoredAdapter.getSnapshot();

    expect(storage.getItem(DEMO_STORAGE_KEY)).not.toBeNull();
    expect(snapshot.payments).toEqual(expect.arrayContaining([
      expect.objectContaining({ note: "Pagamento de teste", total_cents: 9900 }),
    ]));
    expect(snapshot.indicators.received_cents).toBe(22900);
    expect(snapshot.indicators.expected_cents).toBe(23500);
  });

  it("restores the versioned seed and remains usable without browser storage", async () => {
    const { adapter, storage } = adapterFor();
    await adapter.createStudent({
      name: "Mudança local",
      email: "mudanca@example.test",
      phone: "",
      guardian_name: "",
      active: true,
    });

    const reset = await adapter.resetToSeed();
    expect(reset.students).toEqual(createDemoSeed().students);
    expect(JSON.parse(storage.getItem(DEMO_STORAGE_KEY) ?? "{}")).toMatchObject({ scenario_version: "1" });

    const ssrSafeAdapter = new LocalDemoDataAdapter();
    await expect(ssrSafeAdapter.getSnapshot()).resolves.toMatchObject({
      students: expect.any(Array),
      classrooms: expect.any(Array),
    });
  });
});
