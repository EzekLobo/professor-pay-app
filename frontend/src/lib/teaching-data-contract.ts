/**
 * Shared data boundary for the public demo and the private teacher area.
 * Implementations may persist locally or remotely, but consumers never need
 * to know which transport is behind this contract.
 */
export type RecordSource = "demo" | "manual" | "kodland";

export type Student = {
  id: string;
  source: RecordSource;
  name: string;
  email: string;
  phone: string;
  guardian_name: string;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type Classroom = {
  id: string;
  source: RecordSource;
  name: string;
  course_name: string;
  student_ids: string[];
  week_days: number[];
  start_time: string;
  duration_minutes: number;
  hourly_rate_cents: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type LessonType = "REGULAR" | "EXTRA";
export type LessonStatus = "SCHEDULED" | "COMPLETED" | "CANCELED";

export type Lesson = {
  id: string;
  source: RecordSource;
  class_id: string | null;
  student_ids: string[];
  title: string;
  lesson_date: string;
  start_time: string;
  duration_minutes: number;
  value_cents: number;
  type: LessonType;
  status: LessonStatus;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type PaymentStatus = "PENDING" | "RECEIVED" | "OVERDUE";

export type Payment = {
  id: string;
  source: RecordSource;
  period: string;
  due_date: string;
  lesson_ids: string[];
  total_cents: number;
  status: PaymentStatus;
  received_at: string | null;
  note: string;
  created_at: string;
  updated_at: string;
};

export type DashboardIndicators = {
  active_students: number;
  active_classes: number;
  scheduled_lessons: number;
  completed_lessons: number;
  expected_cents: number;
  received_cents: number;
  overdue_cents: number;
  total_payment_cents: number;
};

export type CreateStudentInput = Omit<
  Student,
  "id" | "source" | "created_at" | "updated_at"
>;
export type UpdateStudentInput = Partial<CreateStudentInput>;

export type CreateClassroomInput = Omit<
  Classroom,
  "id" | "source" | "created_at" | "updated_at"
>;
export type UpdateClassroomInput = Partial<CreateClassroomInput>;

export type CreateLessonInput = Omit<
  Lesson,
  "id" | "source" | "created_at" | "updated_at"
>;
export type UpdateLessonInput = Partial<CreateLessonInput>;

export type CreatePaymentInput = Omit<
  Payment,
  "id" | "source" | "created_at" | "updated_at"
>;
export type UpdatePaymentInput = Partial<CreatePaymentInput>;

export type ListOptions = {
  active?: boolean;
};

export type TeachingDataSnapshot = {
  students: Student[];
  classrooms: Classroom[];
  lessons: Lesson[];
  payments: Payment[];
  indicators: DashboardIndicators;
};

/**
 * The private Firestore adapter and the public demo adapter share this API.
 * Mutations are asynchronous so a browser-only store can be swapped for a
 * remote implementation without changing its consumers.
 */
export interface TeachingDataAdapter {
  getSnapshot(): Promise<TeachingDataSnapshot>;
  getIndicators(): Promise<DashboardIndicators>;

  listStudents(options?: ListOptions): Promise<Student[]>;
  getStudent(id: string): Promise<Student | null>;
  createStudent(input: CreateStudentInput): Promise<Student>;
  updateStudent(id: string, input: UpdateStudentInput): Promise<Student>;
  deleteStudent(id: string): Promise<void>;

  listClassrooms(options?: ListOptions): Promise<Classroom[]>;
  getClassroom(id: string): Promise<Classroom | null>;
  createClassroom(input: CreateClassroomInput): Promise<Classroom>;
  updateClassroom(id: string, input: UpdateClassroomInput): Promise<Classroom>;
  deleteClassroom(id: string): Promise<void>;

  listLessons(options?: ListOptions): Promise<Lesson[]>;
  getLesson(id: string): Promise<Lesson | null>;
  createLesson(input: CreateLessonInput): Promise<Lesson>;
  updateLesson(id: string, input: UpdateLessonInput): Promise<Lesson>;
  deleteLesson(id: string): Promise<void>;

  listPayments(): Promise<Payment[]>;
  getPayment(id: string): Promise<Payment | null>;
  createPayment(input: CreatePaymentInput): Promise<Payment>;
  updatePayment(id: string, input: UpdatePaymentInput): Promise<Payment>;
  deletePayment(id: string): Promise<void>;
}

export function indicatorsFrom(
  students: readonly Student[],
  classrooms: readonly Classroom[],
  lessons: readonly Lesson[],
  payments: readonly Payment[],
): DashboardIndicators {
  return {
    active_students: students.filter((item) => item.active).length,
    active_classes: classrooms.filter((item) => item.active).length,
    scheduled_lessons: lessons.filter(
      (item) => item.active && item.status === "SCHEDULED",
    ).length,
    completed_lessons: lessons.filter(
      (item) => item.active && item.status === "COMPLETED",
    ).length,
    expected_cents: payments
      .filter((item) => item.status !== "RECEIVED")
      .reduce((total, item) => total + item.total_cents, 0),
    received_cents: payments
      .filter((item) => item.status === "RECEIVED")
      .reduce((total, item) => total + item.total_cents, 0),
    overdue_cents: payments
      .filter((item) => item.status === "OVERDUE")
      .reduce((total, item) => total + item.total_cents, 0),
    total_payment_cents: payments.reduce(
      (total, item) => total + item.total_cents,
      0,
    ),
  };
}
