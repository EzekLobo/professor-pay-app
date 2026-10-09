import {
  indicatorsFrom,
  type Classroom,
  type CreateClassroomInput,
  type CreateLessonInput,
  type CreatePaymentInput,
  type CreateStudentInput,
  type DashboardIndicators,
  type Lesson,
  type ListOptions,
  type Payment,
  type Student,
  type TeachingDataAdapter,
  type TeachingDataSnapshot,
  type UpdateClassroomInput,
  type UpdateLessonInput,
  type UpdatePaymentInput,
  type UpdateStudentInput,
} from "@/lib/teaching-data-contract";

export const DEMO_SCENARIO_VERSION = "1";
export const DEMO_STORAGE_KEY = `nexusclass:demo-data:v${DEMO_SCENARIO_VERSION}`;

export type DemoDataStore = Pick<
  Storage,
  "getItem" | "setItem" | "removeItem"
>;

type DemoDatabase = {
  scenario_version: typeof DEMO_SCENARIO_VERSION;
  students: Student[];
  classrooms: Classroom[];
  lessons: Lesson[];
  payments: Payment[];
};

const demoSeed: DemoDatabase = {
  scenario_version: DEMO_SCENARIO_VERSION,
  students: [
    {
      id: "demo-student-luna",
      source: "demo",
      name: "Luna Ribeiro",
      email: "luna.ribeiro@example.test",
      phone: "+55 11 90000-0101",
      guardian_name: "Marina Ribeiro",
      active: true,
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-01T12:00:00.000Z",
    },
    {
      id: "demo-student-theo",
      source: "demo",
      name: "Theo Martins",
      email: "theo.martins@example.test",
      phone: "+55 11 90000-0102",
      guardian_name: "Rafael Martins",
      active: true,
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-01T12:00:00.000Z",
    },
    {
      id: "demo-student-alice",
      source: "demo",
      name: "Alice Nascimento",
      email: "alice.nascimento@example.test",
      phone: "+55 11 90000-0103",
      guardian_name: "Renata Nascimento",
      active: true,
      created_at: "2026-09-02T12:00:00.000Z",
      updated_at: "2026-09-02T12:00:00.000Z",
    },
    {
      id: "demo-student-caio",
      source: "demo",
      name: "Caio Monteiro",
      email: "caio.monteiro@example.test",
      phone: "+55 11 90000-0104",
      guardian_name: "Patrícia Monteiro",
      active: true,
      created_at: "2026-09-02T12:00:00.000Z",
      updated_at: "2026-09-02T12:00:00.000Z",
    },
  ],
  classrooms: [
    {
      id: "demo-class-creativity",
      source: "demo",
      name: "Criatividade Digital",
      course_name: "Design e criatividade",
      student_ids: ["demo-student-luna", "demo-student-theo"],
      week_days: [1],
      start_time: "18:00",
      duration_minutes: 60,
      hourly_rate_cents: 6500,
      active: true,
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-01T12:00:00.000Z",
    },
    {
      id: "demo-class-games",
      source: "demo",
      name: "Laboratório de Jogos",
      course_name: "Programação de jogos",
      student_ids: ["demo-student-alice", "demo-student-caio"],
      week_days: [3],
      start_time: "19:00",
      duration_minutes: 90,
      hourly_rate_cents: 7000,
      active: true,
      created_at: "2026-09-02T12:00:00.000Z",
      updated_at: "2026-09-02T12:00:00.000Z",
    },
  ],
  lessons: [
    {
      id: "demo-lesson-creativity-1",
      source: "demo",
      class_id: "demo-class-creativity",
      student_ids: ["demo-student-luna", "demo-student-theo"],
      title: "Cores e composição",
      lesson_date: "2026-10-05",
      start_time: "18:00",
      duration_minutes: 60,
      value_cents: 6500,
      type: "REGULAR",
      status: "COMPLETED",
      active: true,
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-10-05T21:00:00.000Z",
    },
    {
      id: "demo-lesson-games-1",
      source: "demo",
      class_id: "demo-class-games",
      student_ids: ["demo-student-alice", "demo-student-caio"],
      title: "Personagem e movimento",
      lesson_date: "2026-10-07",
      start_time: "19:00",
      duration_minutes: 90,
      value_cents: 10500,
      type: "REGULAR",
      status: "COMPLETED",
      active: true,
      created_at: "2026-09-02T12:00:00.000Z",
      updated_at: "2026-10-07T22:30:00.000Z",
    },
    {
      id: "demo-lesson-creativity-2",
      source: "demo",
      class_id: "demo-class-creativity",
      student_ids: ["demo-student-luna", "demo-student-theo"],
      title: "Protótipo do cartaz",
      lesson_date: "2026-10-12",
      start_time: "18:00",
      duration_minutes: 60,
      value_cents: 6500,
      type: "REGULAR",
      status: "SCHEDULED",
      active: true,
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-01T12:00:00.000Z",
    },
    {
      id: "demo-lesson-games-2",
      source: "demo",
      class_id: "demo-class-games",
      student_ids: ["demo-student-alice", "demo-student-caio"],
      title: "Fases e desafios",
      lesson_date: "2026-10-14",
      start_time: "19:00",
      duration_minutes: 90,
      value_cents: 10500,
      type: "REGULAR",
      status: "SCHEDULED",
      active: true,
      created_at: "2026-09-02T12:00:00.000Z",
      updated_at: "2026-09-02T12:00:00.000Z",
    },
    {
      id: "demo-lesson-extra",
      source: "demo",
      class_id: null,
      student_ids: ["demo-student-luna"],
      title: "Mentoria de portfólio",
      lesson_date: "2026-10-16",
      start_time: "17:00",
      duration_minutes: 60,
      value_cents: 8000,
      type: "EXTRA",
      status: "SCHEDULED",
      active: true,
      created_at: "2026-10-01T12:00:00.000Z",
      updated_at: "2026-10-01T12:00:00.000Z",
    },
  ],
  payments: [
    {
      id: "demo-payment-august",
      source: "demo",
      period: "Agosto de 2026",
      due_date: "2026-09-15",
      lesson_ids: ["demo-lesson-creativity-1"],
      total_cents: 13000,
      status: "RECEIVED",
      received_at: "2026-09-15T15:30:00.000Z",
      note: "Pagamento fictício confirmado.",
      created_at: "2026-09-01T12:00:00.000Z",
      updated_at: "2026-09-15T15:30:00.000Z",
    },
    {
      id: "demo-payment-september",
      source: "demo",
      period: "Setembro de 2026",
      due_date: "2026-10-15",
      lesson_ids: ["demo-lesson-creativity-1", "demo-lesson-games-1"],
      total_cents: 17000,
      status: "PENDING",
      received_at: null,
      note: "Competência fictícia em aberto.",
      created_at: "2026-10-01T12:00:00.000Z",
      updated_at: "2026-10-01T12:00:00.000Z",
    },
    {
      id: "demo-payment-july",
      source: "demo",
      period: "Julho de 2026",
      due_date: "2026-08-15",
      lesson_ids: [],
      total_cents: 6500,
      status: "OVERDUE",
      received_at: null,
      note: "Exemplo fictício de acompanhamento.",
      created_at: "2026-08-01T12:00:00.000Z",
      updated_at: "2026-08-16T12:00:00.000Z",
    },
  ],
};

const clone = <Value>(value: Value): Value =>
  value === undefined
    ? value
    : (JSON.parse(JSON.stringify(value)) as Value);

/** Returns a fresh copy so UI mutations never alter the versioned base scenario. */
export function createDemoSeed(): DemoDataStoreSnapshot {
  return clone(demoSeed);
}

export type DemoDataStoreSnapshot = DemoDatabase;

export class DemoDataNotFoundError extends Error {
  constructor(entity: string, id: string) {
    super(`${entity} não encontrado: ${id}`);
    this.name = "DemoDataNotFoundError";
  }
}

export type LocalDemoDataAdapterOptions = {
  storage?: DemoDataStore;
  now?: () => string;
  create_id?: (entity: "student" | "classroom" | "lesson" | "payment") => string;
};

const browserStorage = (): DemoDataStore | undefined => {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
};

const isDemoDatabase = (value: unknown): value is DemoDatabase => {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    record.scenario_version === DEMO_SCENARIO_VERSION &&
    Array.isArray(record.students) &&
    Array.isArray(record.classrooms) &&
    Array.isArray(record.lessons) &&
    Array.isArray(record.payments)
  );
};

const activeFilter = <Entity extends { active: boolean }>(
  items: Entity[],
  options: ListOptions | undefined,
) =>
  options?.active === undefined
    ? items
    : items.filter((item) => item.active === options.active);

/**
 * Browser-only persistence for the public demo. It intentionally has no
 * transport, Firebase, or external-platform dependency. When imported during
 * SSR it uses an ephemeral in-memory copy instead of touching `window`.
 */
export class LocalDemoDataAdapter implements TeachingDataAdapter {
  private readonly storage: DemoDataStore | undefined;
  private readonly now: () => string;
  private readonly createId: NonNullable<LocalDemoDataAdapterOptions["create_id"]>;
  private fallback: DemoDatabase | undefined;

  constructor(options: LocalDemoDataAdapterOptions = {}) {
    this.storage = options.storage ?? browserStorage();
    this.now = options.now ?? (() => new Date().toISOString());
    this.createId = options.create_id ?? ((entity) => {
      const uuid = globalThis.crypto?.randomUUID?.();
      return `${entity}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
    });
  }

  async getSnapshot(): Promise<TeachingDataSnapshot> {
    const database = this.read();
    return {
      students: clone(database.students),
      classrooms: clone(database.classrooms),
      lessons: clone(database.lessons),
      payments: clone(database.payments),
      indicators: indicatorsFrom(
        database.students,
        database.classrooms,
        database.lessons,
        database.payments,
      ),
    };
  }

  async getIndicators(): Promise<DashboardIndicators> {
    const database = this.read();
    return indicatorsFrom(
      database.students,
      database.classrooms,
      database.lessons,
      database.payments,
    );
  }

  async listStudents(options?: ListOptions): Promise<Student[]> {
    return clone(activeFilter(this.read().students, options));
  }

  async getStudent(id: string): Promise<Student | null> {
    return clone(this.read().students.find((item) => item.id === id) ?? null);
  }

  async createStudent(input: CreateStudentInput): Promise<Student> {
    return this.mutate((database) => {
      const timestamp = this.now();
      const item: Student = {
        ...clone(input),
        id: this.createId("student"),
        source: "demo",
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.students.push(item);
      return item;
    });
  }

  async updateStudent(id: string, input: UpdateStudentInput): Promise<Student> {
    return this.update<Student>("Aluno", id, input, (database) => database.students);
  }

  async deleteStudent(id: string): Promise<void> {
    this.mutate((database) => {
      this.requireIndex(database.students, id, "Aluno");
      database.students = database.students.filter((item) => item.id !== id);
      database.classrooms = database.classrooms.map((item) => ({
        ...item,
        student_ids: item.student_ids.filter((studentId) => studentId !== id),
        updated_at: item.student_ids.includes(id) ? this.now() : item.updated_at,
      }));
      database.lessons = database.lessons.map((item) => ({
        ...item,
        student_ids: item.student_ids.filter((studentId) => studentId !== id),
        updated_at: item.student_ids.includes(id) ? this.now() : item.updated_at,
      }));
    });
  }

  async listClassrooms(options?: ListOptions): Promise<Classroom[]> {
    return clone(activeFilter(this.read().classrooms, options));
  }

  async getClassroom(id: string): Promise<Classroom | null> {
    return clone(this.read().classrooms.find((item) => item.id === id) ?? null);
  }

  async createClassroom(input: CreateClassroomInput): Promise<Classroom> {
    return this.mutate((database) => {
      const timestamp = this.now();
      const item: Classroom = {
        ...clone(input),
        id: this.createId("classroom"),
        source: "demo",
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.classrooms.push(item);
      return item;
    });
  }

  async updateClassroom(id: string, input: UpdateClassroomInput): Promise<Classroom> {
    return this.update<Classroom>("Turma", id, input, (database) => database.classrooms);
  }

  async deleteClassroom(id: string): Promise<void> {
    this.mutate((database) => {
      this.requireIndex(database.classrooms, id, "Turma");
      database.classrooms = database.classrooms.filter((item) => item.id !== id);
      database.lessons = database.lessons.filter((item) => item.class_id !== id);
      const remainingLessonIds = new Set(database.lessons.map((item) => item.id));
      database.payments = database.payments.map((item) => ({
        ...item,
        lesson_ids: item.lesson_ids.filter((lessonId) => remainingLessonIds.has(lessonId)),
      }));
    });
  }

  async listLessons(options?: ListOptions): Promise<Lesson[]> {
    return clone(activeFilter(this.read().lessons, options));
  }

  async getLesson(id: string): Promise<Lesson | null> {
    return clone(this.read().lessons.find((item) => item.id === id) ?? null);
  }

  async createLesson(input: CreateLessonInput): Promise<Lesson> {
    return this.mutate((database) => {
      const timestamp = this.now();
      const item: Lesson = {
        ...clone(input),
        id: this.createId("lesson"),
        source: "demo",
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.lessons.push(item);
      return item;
    });
  }

  async updateLesson(id: string, input: UpdateLessonInput): Promise<Lesson> {
    return this.update<Lesson>("Aula", id, input, (database) => database.lessons);
  }

  async deleteLesson(id: string): Promise<void> {
    this.mutate((database) => {
      this.requireIndex(database.lessons, id, "Aula");
      database.lessons = database.lessons.filter((item) => item.id !== id);
      database.payments = database.payments.map((item) => ({
        ...item,
        lesson_ids: item.lesson_ids.filter((lessonId) => lessonId !== id),
      }));
    });
  }

  async listPayments(): Promise<Payment[]> {
    return clone(this.read().payments);
  }

  async getPayment(id: string): Promise<Payment | null> {
    return clone(this.read().payments.find((item) => item.id === id) ?? null);
  }

  async createPayment(input: CreatePaymentInput): Promise<Payment> {
    return this.mutate((database) => {
      const timestamp = this.now();
      const item: Payment = {
        ...clone(input),
        id: this.createId("payment"),
        source: "demo",
        created_at: timestamp,
        updated_at: timestamp,
      };
      database.payments.push(item);
      return item;
    });
  }

  async updatePayment(id: string, input: UpdatePaymentInput): Promise<Payment> {
    return this.update<Payment>("Pagamento", id, input, (database) => database.payments);
  }

  async deletePayment(id: string): Promise<void> {
    this.mutate((database) => {
      const index = this.requireIndex(database.payments, id, "Pagamento");
      database.payments.splice(index, 1);
    });
  }

  async resetToSeed(): Promise<TeachingDataSnapshot> {
    this.write(createDemoSeed());
    return this.getSnapshot();
  }

  private update<Entity extends { id: string; updated_at: string }>(
    entity: string,
    id: string,
    input: Partial<Entity>,
    select: (database: DemoDatabase) => Entity[],
  ): Promise<Entity> {
    return this.mutate((database) => {
      const items = select(database);
      const index = this.requireIndex(items, id, entity);
      const updated = {
        ...items[index],
        ...clone(input),
        id,
        updated_at: this.now(),
      } as Entity;
      items[index] = updated;
      return updated;
    });
  }

  private requireIndex<Entity extends { id: string }>(
    items: Entity[],
    id: string,
    entity: string,
  ) {
    const index = items.findIndex((item) => item.id === id);
    if (index < 0) throw new DemoDataNotFoundError(entity, id);
    return index;
  }

  private mutate<Result>(change: (database: DemoDatabase) => Result): Promise<Result> {
    const database = this.read();
    const result = change(database);
    this.write(database);
    return Promise.resolve(clone(result));
  }

  private read(): DemoDatabase {
    try {
      const raw = this.storage?.getItem(DEMO_STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isDemoDatabase(parsed)) return clone(parsed);
      }
    } catch {
      // Storage may be disabled by browser policy; use the session-local copy.
    }
    this.fallback ??= createDemoSeed();
    return clone(this.fallback);
  }

  private write(database: DemoDatabase) {
    const next = clone(database);
    try {
      this.storage?.setItem(DEMO_STORAGE_KEY, JSON.stringify(next));
      if (this.storage) return;
    } catch {
      // The demo remains usable when the browser refuses local storage.
    }
    this.fallback = next;
  }
}
