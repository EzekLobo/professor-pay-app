import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { reauthenticateWithFirebase } from "@/lib/firebase-auth";
import type { KodlandLesson } from "@/lib/kodland-lessons";
import {
  KodlandSyncPersistenceError,
  kodlandSyncNetworkError,
  readKodlandSyncResponse,
} from "@/lib/kodland-sync-response";

export type User = { id: string; name: string; email: string };
export type DashboardLesson = {
  id: string;
  class_id: string | null;
  class_name_snapshot: string;
  number: number;
  lesson_date: string;
  student: string;
  type: string;
  duration_minutes: number;
  hourly_rate_cents: number;
  period: string;
  payment_date: string;
  value_cents: number;
  status: string;
  financial_status?: string;
  financial_source_id?: string;
};
export type DashboardPayment = {
  payment_date: string;
  period: string;
  lesson_count: number;
  normal_count: number;
  extra_count: number;
  normal_total_cents: number;
  extra_total_cents: number;
  total_cents: number;
  status: string;
  lessons: DashboardLesson[];
};
export type DashboardProgress = {
  class_id: string;
  name: string;
  lesson_count: number;
  completed: number;
  remaining: number;
  percent: number;
};
export type DashboardResponse = {
  today: string;
  earned_cents: number;
  received_cents: number;
  normal_lessons: number;
  extra_lessons: number;
  normal_earned_cents: number;
  extra_earned_cents: number;
  planned_cents: number;
  future_lessons: number;
  total_planned_cents: number;
  total_lessons: number;
  last_payment: DashboardPayment | null;
  next_payment: DashboardPayment | null;
  payments: DashboardPayment[];
  progress: DashboardProgress[];
};
export type ClassRecord = {
  id: string;
  name: string;
  week_day: number;
  start_time: string;
  first_lesson_date: string;
  lesson_count: number;
  duration_minutes: number;
  hourly_rate_cents: number;
  active: boolean;
};
export type ClassPayload = Omit<ClassRecord, "id" | "active">;
export type Lesson = DashboardLesson & {
  active: boolean;
  canceled: boolean;
  note: string;
};
export type LessonList = {
  items: Lesson[];
  total: number;
  page: number;
  page_size: number;
};
export type ExtraLessonPayload = {
  student: string;
  lesson_date: string;
  duration_minutes: number;
  hourly_rate_cents: number;
  note: string;
};
export type LessonFilters = {
  type?: "NORMAL" | "EXTRA";
  status?: "ACTIVE" | "CANCELED" | "COMPLETED" | "FUTURE";
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
};
export type PaymentDetail = DashboardPayment & {
  received_at: string | null;
  confirmation_note: string | null;
};
export type ImportReport = {
  export_id: string;
  already_imported: boolean;
  class_count: number;
  lesson_count: number;
  payment_confirmation_count: number;
  total_cents: number;
  imported_at: string | null;
  pedagogical_group_count: number;
  pedagogical_student_count: number;
  pedagogical_review_count: number;
  pedagogical_lesson_count: number;
};
export type DataExport = {
  schema_version: "1.0";
  exported_at: string;
  user: User;
  classes: unknown[];
  lessons: unknown[];
  payment_confirmations: unknown[];
  /** Optional so backups created before the pedagogical snapshot existed remain valid. */
  kodland_groups?: unknown[];
  kodland_students?: unknown[];
  kodland_reviews?: unknown[];
  kodland_lessons?: unknown[];
  kodland_extra_lessons?: unknown[];
  kodland_availability?: unknown[];
  imported_courses?: unknown[];
  imported_course_lessons?: unknown[];
};
export type KodlandGroup = {
  id: string;
  external_id: string;
  title: string;
  course_id?: string;
  course_name: string;
  student_count: number;
  start_date: string;
  next_lesson_date: string;
  next_lesson_number?: number;
  next_lesson_id?: string;
  next_lesson_title?: string;
  next_lesson_url?: string;
  archived: boolean;
  local_class_id: string | null;
  created_at: string;
};
export type KodlandStudent = {
  id: string;
  external_id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  progress_summary: string;
  profile_url: string;
  external_class_id: string;
  external_class_name: string;
  local_note: string;
  guardian_name: string;
  guardian_relationship: string;
  guardian_phone: string;
  guardian_email: string;
  guardian_note: string;
  hidden: boolean;
  created_at: string;
};
export type KodlandReview = {
  id: string;
  external_class_id: string;
  external_class_name: string;
  external_student_id: string;
  student_name: string;
  lesson_id: string;
  lesson_number: number;
  lesson_title: string;
  module_number: string;
  task_id: string;
  task_number: number;
  task_title: string;
  status_key: string;
  status_label: string;
  correction_url: string;
  created_at: string;
};
export type KodlandExtraLesson = {
  id: string;
  external_student_id: string;
  student_name: string;
  external_class_id: string;
  external_class_name: string;
  lesson_date: string;
  start_time: string;
  end_time: string;
  status: string;
  completed: boolean;
  manual_status?: KodlandExtraManualStatus;
  created_at: string;
};
export type KodlandExtraManualStatus = "PENDING" | "ACCOUNTED" | "DONE";
export type KodlandSyncMode =
  | "essential"
  | "schedule"
  | "corrections"
  | "profiles";
export type KodlandSyncResult = {
  group_count: number;
  student_count: number;
  review_count: number;
  lesson_count: number;
  extra_lesson_count: number;
  group_ids?: string[];
};
type KodlandSyncOptions = {
  correctionGroupIds?: string[];
};
export type KodlandAvailability = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  created_at: string;
};
export type ImportedCourse = {
  id: string;
  name: string;
  lesson_count: number;
  source: "course_import";
  imported_at: string;
  updated_at: string;
  created_at: string;
};
export type ImportedCourseLesson = {
  id: string;
  course_id: string;
  source_lesson_id: string;
  source: "course_import";
  lesson_number: number;
  title: string;
  module_number: string;
  external_url: string;
  slides_url: string;
  guide_url: string;
  homework_url: string;
  homework_title: string;
  classroom_tasks: Array<{ title: string; url: string }>;
  created_at: string;
  updated_at: string;
};
export type CourseImportInput = {
  courseId: "roblox" | "scratch" | "python";
  username: string;
  password: string;
};
export type CourseImportOption = {
  id: CourseImportInput["courseId"];
  name: string;
  available: boolean;
};
export type CourseImportResult = {
  course: Pick<ImportedCourse, "id" | "name" | "lesson_count">;
  lessons: Array<
    Omit<ImportedCourseLesson, "id" | "course_id" | "source" | "source_lesson_id" | "created_at" | "updated_at">
    & { id: string }
  >;
};
export type { KodlandLesson } from "@/lib/kodland-lessons";
type KodlandSnapshot = {
  groups: Omit<KodlandGroup, "id" | "local_class_id" | "created_at">[];
  students: Omit<KodlandStudent, "local_note" | "hidden" | "created_at">[];
  reviews: Omit<KodlandReview, "created_at">[];
  lessons: Omit<KodlandLesson, "created_at">[];
  extra_lessons: Omit<KodlandExtraLesson, "created_at">[];
  availability: Omit<KodlandAvailability, "created_at">[];
  review_group_ids?: string[];
  extra_lessons_synced?: boolean;
  availability_synced?: boolean;
};

type KodlandMaterial = {
  group_id: string;
  source_lesson_id: string;
  materials_status: "ready" | "empty";
  slides_url: string;
  guide_url: string;
  homework_url: string;
  homework_title: string;
  classroom_tasks: KodlandLesson["classroom_tasks"];
};

export const kodlandLessonDocumentId = (lesson: {
  id: string;
  external_class_id: string;
}) => `group-${lesson.external_class_id}-lesson-${lesson.id}`;

const hasKodlandMaterials = (lesson: Partial<KodlandLesson>) => Boolean(
  lesson.slides_url || lesson.guide_url || lesson.homework_url || lesson.classroom_tasks?.length,
);

/** Keep manually managed and previously loaded data while the lightweight sync refreshes the timetable. */
export function mergeSyncedKodlandLesson(
  item: Omit<KodlandLesson, "created_at">,
  previous: Partial<KodlandLesson> | undefined,
  createdAt: string,
) {
  const sameSource = !previous?.source_lesson_id ||
    !item.source_lesson_id || previous.source_lesson_id === item.source_lesson_id;
  const preserved = sameSource ? previous : undefined;
  const previousMaterialsStatus = preserved?.materials_status ??
    (preserved && hasKodlandMaterials(preserved) ? "ready" : "pending");
  const materialStatus = previousMaterialsStatus === "ready" || previousMaterialsStatus === "empty"
    ? previousMaterialsStatus
    : item.materials_status ?? previousMaterialsStatus;
  return {
    ...item,
    id: kodlandLessonDocumentId(item),
    source_lesson_id: item.source_lesson_id || preserved?.source_lesson_id || "",
    materials_status: materialStatus,
    financial_status: String(previous?.financial_status ?? ""),
    external_url: item.external_url || preserved?.external_url || "",
    slides_url: item.slides_url || preserved?.slides_url || "",
    guide_url: item.guide_url || preserved?.guide_url || "",
    homework_url: item.homework_url || preserved?.homework_url || "",
    homework_title: item.homework_title || preserved?.homework_title || "",
    classroom_tasks: item.classroom_tasks?.length
      ? item.classroom_tasks : preserved?.classroom_tasks ?? [],
    created_at: String(previous?.created_at ?? createdAt),
  };
}

export function mergeLoadedKodlandMaterials(
  previous: KodlandLesson,
  material: KodlandMaterial,
) {
  if (previous.external_class_id !== material.group_id ||
      previous.source_lesson_id !== material.source_lesson_id) {
    throw new Error("A aula mudou desde a última sincronização. Atualize a página e tente novamente.");
  }
  const retained = hasKodlandMaterials(previous);
  return {
    slides_url: material.slides_url || previous.slides_url || "",
    guide_url: material.guide_url || previous.guide_url || "",
    homework_url: material.homework_url || previous.homework_url || "",
    homework_title: material.homework_title || previous.homework_title || "",
    classroom_tasks: material.classroom_tasks.length
      ? material.classroom_tasks : previous.classroom_tasks ?? [],
    materials_status: material.materials_status === "empty" && retained ? "ready" : material.materials_status,
  };
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

type Row = { id: string } & Record<string, unknown>;
type ImportPayload = Record<string, unknown>;

const authUser = () => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new ApiError(401, "Faça login para continuar.");
  return user;
};
const ref = (name: string, userId = authUser().uid) =>
  collection(getFirebaseDb(), `users/${userId}/${name}`);
const rows = async (name: string): Promise<Row[]> =>
  (await getDocs(query(ref(name), orderBy("created_at")))).docs.map((item) => ({
    ...(item.data() as Row),
    id: item.id,
  }));
type FirebaseWriteBatch = ReturnType<typeof writeBatch>;
const uniqueBy = <T>(items: T[], key: (item: T) => string) => {
  const unique = new Map<string, T>();
  items.forEach((item) => unique.set(key(item), item));
  return [...unique.values()];
};
/** Firestore rejects undefined, while Kodland legitimately omits optional fields by account/course. */
const firestorePayload = <T>(value: T): T => {
  if (Array.isArray(value)) {
    return value.map((item) => firestorePayload(item)) as T;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, firestorePayload(item)]),
    ) as T;
  }
  return value;
};
const commitWrites = async (writes: Array<(batch: FirebaseWriteBatch) => void>) => {
  // Firestore accepts at most 500 operations per batch. A pedagogical snapshot
  // can include hundreds of catalog lessons, reviews and old records.
  for (let index = 0; index < writes.length; index += 400) {
    const batch = writeBatch(getFirebaseDb());
    writes.slice(index, index + 400).forEach((write) => write(batch));
    for (let attempt = 0; ; attempt += 1) {
      try {
        await batch.commit();
        break;
      } catch (error) {
        if (attempt >= 1) throw error;
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
      }
    }
  }
};
const firestoreFailure = (error: unknown) => {
  const code = typeof error === "object" && error && "code" in error
    ? String((error as { code?: unknown }).code ?? "unknown")
    : "unknown";
  if (code === "permission-denied") {
    return { code, detail: "O NexusClass não teve permissão para salvar seus dados. Entre novamente e tente outra vez." };
  }
  if (code === "unavailable" || code === "deadline-exceeded") {
    return { code, detail: "O banco de dados ficou temporariamente indisponível. Aguarde alguns instantes e tente novamente." };
  }
  if (code === "invalid-argument" || code === "failed-precondition") {
    return { code, detail: "A resposta recebida contém dados incompatíveis. Tente novamente; se persistir, informe a referência ao suporte." };
  }
  return { code, detail: "Tente novamente ou informe a referência ao suporte." };
};
const isoToday = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const paymentDate = (value: string) => {
  const d = new Date(`${value}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 15);
  return d.toISOString().slice(0, 10);
};
const period = (value: string) => `${value.slice(5, 7)}/${value.slice(0, 4)}`;
const cents = (row: Row) =>
  Math.round(
    (Number(row.duration_minutes ?? 0) * Number(row.hourly_rate_cents ?? 0)) /
      60,
  );
const isNonBillableFinancialStatus = (status: unknown) =>
  /substitu|replacement|feriado|holiday|cancel/i.test(String(status ?? ""));
const asLesson = (row: Row, today = isoToday()): Lesson => {
  const date = String(row.lesson_date);
  const financialStatus = String(row.financial_status ?? "");
  const canceled =
    Boolean(row.canceled) || isNonBillableFinancialStatus(financialStatus);
  const active = row.active !== false;
  const status =
    !active || canceled ? "CANCELED" : date <= today ? "COMPLETED" : "FUTURE";
  return {
    id: String(row.id),
    class_id: row.class_id ? String(row.class_id) : null,
    class_name_snapshot: String(row.class_name_snapshot ?? ""),
    number: Number(row.number ?? 1),
    lesson_date: date,
    student: String(row.student ?? ""),
    type: String(row.type ?? "NORMAL"),
    duration_minutes: Number(row.duration_minutes ?? 0),
    hourly_rate_cents: Number(row.hourly_rate_cents ?? 0),
    active,
    canceled,
    note: String(row.note ?? ""),
    period: period(date),
    payment_date: paymentDate(date),
    value_cents: cents(row),
    status,
    financial_status: financialStatus,
    financial_source_id: row.financial_source_id
      ? String(row.financial_source_id)
      : undefined,
  };
};
const dateOnly = (value: unknown) => {
  const match = String(value ?? "").match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? "";
};
const minutesFromTime = (value: unknown) => {
  const match = String(value ?? "").match(/(\d{1,2}):(\d{2})/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
const courseDuration = (value: unknown) =>
  Number(String(value ?? "").match(/\[(\d+)\s*min\]/i)?.[1] ?? 90);
const courseLessonCount = (value: unknown) =>
  Number(String(value ?? "").match(/\[(\d+)\s*L\]/i)?.[1] ?? 0);

/**
 * Kodland groups are paid per scheduled meeting. Their schedule is imported
 * separately from manually registered lessons, so turn it into read-only
 * financial lessons at dashboard time instead of asking the teacher to enter
 * the same appointments twice.
 */
const kodlandFinancialLessons = (
  groups: Row[],
  scheduled: Row[],
  localClasses: Row[],
  today: string,
  financialOverrides: Row[] = [],
): Lesson[] => {
  const overrideStatusByLessonId = new Map(
    financialOverrides.map((item) => [
      String(item.financial_lesson_id ?? ""),
      String(item.financial_status ?? ""),
    ]),
  );
  const activeGroups = groups.filter(
    (group) =>
      !Boolean(group.archived) &&
      !localClasses.some(
        (item) => String(item.id) === String(group.local_class_id),
      ),
  );
  const byGroup = new Map(
    activeGroups.map((group) => [String(group.external_id ?? group.id), group]),
  );
  const byGroupAndDate = new Map<string, Row[]>();
  scheduled.forEach((item) => {
    const groupId = String(item.external_class_id ?? "");
    const lessonDate = dateOnly(item.lesson_date);
    if (!byGroup.has(groupId) || !lessonDate) return;
    const key = `${groupId}:${lessonDate}`;
    byGroupAndDate.set(key, [...(byGroupAndDate.get(key) ?? []), item]);
  });
  const toFinancialLesson = (
    group: Row,
    groupId: string,
    lessonDate: string,
    number: number,
    event?: Row,
  ) => {
    const financialLessonId = event
      ? `kodland-${groupId}-${String(event.id)}`
      : `kodland-${groupId}-forecast-${number}`;
    const financialStatus =
      overrideStatusByLessonId.get(financialLessonId) ??
      String(event?.financial_status ?? event?.status ?? "");
    const start = minutesFromTime(event?.start_time);
    const end = minutesFromTime(event?.end_time);
    const duration =
      start !== null && end !== null && end > start
        ? end - start
        : courseDuration(group.course_name);
    return asLesson(
      {
        id: financialLessonId,
        class_id: `kodland:${groupId}`,
        class_name_snapshot: String(group.title),
        number: Number(event?.lesson_number ?? number),
        lesson_date: lessonDate,
        student: "",
        type: "NORMAL",
        duration_minutes: duration,
        hourly_rate_cents: 3000,
        active: true,
        canceled: false,
        financial_status: financialStatus,
        financial_source_id: event ? String(event.id) : "",
        note: event ? "Cronograma Kodland" : "Previsão semanal Kodland",
        created_at: String(event?.created_at ?? group.created_at ?? now()),
      },
      today,
    );
  };

  return activeGroups.flatMap((group) => {
    const groupId = String(group.external_id ?? group.id);
    const firstDate =
      dateOnly(group.start_date) || dateOnly(group.next_lesson_date);
    const count = courseLessonCount(group.course_name) || 52;
    if (!firstDate) return [];
    const first = new Date(`${firstDate}T00:00:00Z`);
    const recurringDates = new Set<string>();
    const recurring = Array.from({ length: count }, (_, index) => {
      const date = new Date(first);
      date.setUTCDate(date.getUTCDate() + index * 7);
      const lessonDate = date.toISOString().slice(0, 10);
      recurringDates.add(lessonDate);
      const events = byGroupAndDate.get(`${groupId}:${lessonDate}`) ?? [];
      const financialLesson = toFinancialLesson(
        group,
        groupId,
        lessonDate,
        index + 1,
        events[0],
      );
      return isNonBillableFinancialStatus(financialLesson.financial_status)
        ? { ...financialLesson, active: false, canceled: true }
        : financialLesson;
    });
    const rescheduled = scheduled
      .filter((item) => String(item.external_class_id ?? "") === groupId)
      .flatMap((item) => {
        const lessonDate = dateOnly(item.lesson_date);
        if (!lessonDate || recurringDates.has(lessonDate)) return [];
        const financialLesson = toFinancialLesson(
          group,
          groupId,
          lessonDate,
          Number(item.lesson_number ?? 1),
          item,
        );
        return [
          isNonBillableFinancialStatus(financialLesson.financial_status)
            ? { ...financialLesson, active: false, canceled: true }
            : financialLesson,
        ];
      });
    return [
      ...recurring.filter((lesson): lesson is Lesson => Boolean(lesson)),
      ...rescheduled,
    ];
  });
};

const kodlandExtraFinancialLessons = (
  extraLessons: Row[],
  today: string,
): Lesson[] =>
  extraLessons
    .filter((item) =>
      item.manual_status
        ? item.manual_status === "DONE" || item.manual_status === "ACCOUNTED"
        : item.completed === true,
    )
    .flatMap((item) => {
      const lessonDate = dateOnly(item.lesson_date);
      if (!lessonDate) return [];
      const start = minutesFromTime(item.start_time);
      const end = minutesFromTime(item.end_time);
      const duration =
        start !== null && end !== null && end > start ? end - start : 60;
      return [
        asLesson(
          {
            id: String(item.id),
            class_id: null,
            class_name_snapshot: `Extra · ${String(item.external_class_name ?? "Kodland")}`,
            number: 1,
            lesson_date: lessonDate,
            student: String(item.student_name ?? ""),
            type: "EXTRA",
            duration_minutes: duration,
            hourly_rate_cents: 3000,
            active: true,
            canceled: false,
            note: "Aula extra concluída na Kodland",
            created_at: String(item.created_at ?? now()),
          },
          today,
        ),
      ];
    });

const dashboardFrom = (
  classRows: Row[],
  lessonRows: Row[],
  confirmations: Row[],
  kodlandGroups: Row[] = [],
  kodlandLessons: Row[] = [],
  today = isoToday(),
  kodlandExtraLessons: Row[] = [],
  financialOverrides: Row[] = [],
): DashboardResponse => {
  const lessons = [
    ...lessonRows.map((row) => asLesson(row, today)),
    ...kodlandFinancialLessons(
      kodlandGroups,
      kodlandLessons,
      classRows,
      today,
      financialOverrides,
    ),
    ...kodlandExtraFinancialLessons(kodlandExtraLessons, today),
  ];
  const billable = lessons.filter((item) => item.active && !item.canceled);
  const lessonsByPaymentDate = new Map<string, Lesson[]>();
  lessons.forEach((item) =>
    lessonsByPaymentDate.set(item.payment_date, [
      ...(lessonsByPaymentDate.get(item.payment_date) ?? []),
      item,
    ]),
  );
  const groups = new Map<string, Lesson[]>();
  billable.forEach((item) =>
    groups.set(item.payment_date, [
      ...(groups.get(item.payment_date) ?? []),
      item,
    ]),
  );
  const payments = [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => {
      const normal = group.filter((item) => item.type === "NORMAL");
      const extra = group.filter((item) => item.type === "EXTRA");
      const confirmation = confirmations.find(
        (item) => String(item.payment_date) === date,
      );
      const manualStatus = String(confirmation?.status ?? "");
      const received = Boolean(confirmation?.received_at) || manualStatus === "RECEIVED";
      return {
        payment_date: date,
        period: period(group[0].lesson_date),
        lesson_count: group.length,
        normal_count: normal.length,
        extra_count: extra.length,
        normal_total_cents: normal.reduce(
          (sum, item) => sum + item.value_cents,
          0,
        ),
        extra_total_cents: extra.reduce(
          (sum, item) => sum + item.value_cents,
          0,
        ),
        total_cents: group.reduce((sum, item) => sum + item.value_cents, 0),
        status: received
          ? "RECEIVED"
          : manualStatus === "OVERDUE"
            ? "OVERDUE"
            : date < today
              ? "OVERDUE"
              : date === today
                ? "DUE_TODAY"
                : "FUTURE",
        lessons: lessonsByPaymentDate.get(date) ?? group,
      };
    });
  const completed = billable.filter((item) => item.lesson_date <= today);
  const future = billable.filter((item) => item.lesson_date > today);
  const received = payments
    .filter((item) => item.payment_date <= today || item.status === "RECEIVED")
    .reduce((sum, item) => sum + item.total_cents, 0);
  const activeClasses = classRows.filter((item) => item.active !== false);
  return {
    today,
    earned_cents: completed.reduce((sum, item) => sum + item.value_cents, 0),
    received_cents: received,
    normal_lessons: completed.filter((item) => item.type === "NORMAL").length,
    extra_lessons: completed.filter((item) => item.type === "EXTRA").length,
    normal_earned_cents: completed
      .filter((item) => item.type === "NORMAL")
      .reduce((sum, item) => sum + item.value_cents, 0),
    extra_earned_cents: completed
      .filter((item) => item.type === "EXTRA")
      .reduce((sum, item) => sum + item.value_cents, 0),
    planned_cents: future.reduce((sum, item) => sum + item.value_cents, 0),
    future_lessons: future.length,
    total_planned_cents: billable.reduce(
      (sum, item) => sum + item.value_cents,
      0,
    ),
    total_lessons: billable.length,
    last_payment:
      payments
        .filter(
          (item) => item.payment_date <= today || item.status === "RECEIVED",
        )
        .at(-1) ?? null,
    next_payment: payments.find((item) => item.payment_date > today) ?? null,
    payments,
    progress: activeClasses.map((item) => {
      const own = billable.filter((lesson) => lesson.class_id === item.id);
      const done = own.filter((lesson) => lesson.lesson_date <= today).length;
      return {
        class_id: String(item.id),
        name: String(item.name),
        lesson_count: own.length,
        completed: done,
        remaining: Math.max(own.length - done, 0),
        percent: own.length ? Math.round((done * 100) / own.length) : 0,
      };
    }),
  };
};

const lessonsForClass = (
  id: string,
  payload: ClassPayload,
  createdAt = now(),
) =>
  Array.from({ length: payload.lesson_count }, (_, index) => {
    const date = new Date(`${payload.first_lesson_date}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index * 7);
    const lessonId = `${id}-lesson-${index + 1}-${date.toISOString().slice(0, 10)}`;
    return {
      id: lessonId,
      class_id: id,
      class_name_snapshot: payload.name,
      number: index + 1,
      lesson_date: date.toISOString().slice(0, 10),
      student: "",
      type: "NORMAL",
      duration_minutes: payload.duration_minutes,
      hourly_rate_cents: payload.hourly_rate_cents,
      active: true,
      canceled: false,
      note: "",
      created_at: createdAt,
    };
  });

const importWeekDay = (value: unknown) => {
  if (typeof value === "number") return value;
  const days: Record<string, number> = {
    segunda: 0,
    terça: 1,
    terca: 1,
    quarta: 2,
    quinta: 3,
    sexta: 4,
    sábado: 5,
    sabado: 5,
    domingo: 6,
  };
  return days[String(value ?? "").toLowerCase()] ?? 0;
};
const toNumber = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalizeClass = (value: Record<string, unknown>): Row => ({
  id: String(value.id ?? crypto.randomUUID()),
  name: String(value.name ?? "Turma sem nome"),
  week_day: importWeekDay(value.week_day ?? value.weekDay),
  start_time: String(value.start_time ?? value.time ?? "08:00").slice(0, 5),
  first_lesson_date: String(
    value.first_lesson_date ?? value.firstLesson ?? isoToday(),
  ),
  lesson_count: toNumber(value.lesson_count ?? value.lessonCount, 1),
  duration_minutes: Math.round(
    toNumber(
      value.duration_minutes ?? toNumber(value.durationHours, 1) * 60,
      60,
    ),
  ),
  hourly_rate_cents: Math.round(
    toNumber(value.hourly_rate_cents ?? toNumber(value.hourlyRate, 0) * 100),
  ),
  active: value.active !== false,
  created_at: String(value.created_at ?? value.createdAt ?? now()),
});
const normalizeLesson = (value: Record<string, unknown>): Row => ({
  id: String(value.id ?? crypto.randomUUID()),
  class_id: value.class_id ?? value.classId ?? null,
  class_name_snapshot: String(
    value.class_name_snapshot ?? value.className ?? "Aula extra",
  ),
  number: toNumber(value.number, 1),
  lesson_date: String(value.lesson_date ?? value.lessonDate ?? isoToday()),
  student: String(value.student ?? ""),
  type:
    String(value.type ?? "EXTRA").toUpperCase() === "NORMAL"
      ? "NORMAL"
      : "EXTRA",
  duration_minutes: Math.round(
    toNumber(
      value.duration_minutes ?? toNumber(value.durationHours, 1) * 60,
      60,
    ),
  ),
  hourly_rate_cents: Math.round(
    toNumber(value.hourly_rate_cents ?? toNumber(value.hourlyRate, 0) * 100),
  ),
  active: value.active !== false,
  canceled: Boolean(value.canceled),
  note: String(value.note ?? ""),
  created_at: String(value.created_at ?? value.createdAt ?? now()),
});
const normalizePayment = (value: Record<string, unknown>): Row => ({
  id: String(
    value.payment_date ?? value.paymentDate ?? value.id ?? crypto.randomUUID(),
  ),
  payment_date: String(value.payment_date ?? value.paymentDate ?? ""),
  received_at: String(value.received_at ?? value.receivedAt ?? ""),
  status: String(value.status ?? "RECEIVED"),
  note: String(value.note ?? ""),
  created_at: String(value.created_at ?? value.createdAt ?? now()),
});
const importRows = (
  payload: ImportPayload,
  name: "classes" | "lessons" | "payments",
) => {
  const source =
    name === "payments"
      ? (payload.payment_confirmations ?? payload.paymentConfirmations)
      : payload[name];
  const values = Array.isArray(source)
    ? source.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
  return values.map(
    name === "classes"
      ? normalizeClass
      : name === "lessons"
        ? normalizeLesson
        : normalizePayment,
  );
};

type PedagogicalCollection =
  | "kodland_groups"
  | "kodland_students"
  | "kodland_reviews"
  | "kodland_lessons"
  | "kodland_extra_lessons"
  | "kodland_availability";

const pedagogicalValues = (
  payload: ImportPayload,
  name: PedagogicalCollection,
) => {
  const source = payload[name];
  return Array.isArray(source)
    ? source.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
};

const normalizePedagogicalRow = (
  value: Record<string, unknown>,
  collection: PedagogicalCollection,
): Row => {
  const fallbackId =
    collection === "kodland_groups" ? value.external_id : value.id;
  const row: Row = {
    ...value,
    id: String(value.id ?? fallbackId ?? crypto.randomUUID()),
    created_at: String(value.created_at ?? value.createdAt ?? now()),
  };
  if (collection === "kodland_students") {
    row.local_note = String(value.local_note ?? value.localNote ?? "");
    row.guardian_name = String(value.guardian_name ?? value.guardianName ?? "");
    row.guardian_relationship = String(
      value.guardian_relationship ?? value.guardianRelationship ?? "",
    );
    row.guardian_phone = String(
      value.guardian_phone ?? value.guardianPhone ?? "",
    );
    row.guardian_email = String(
      value.guardian_email ?? value.guardianEmail ?? "",
    );
    row.guardian_note = String(value.guardian_note ?? value.guardianNote ?? "");
    row.hidden = Boolean(value.hidden);
  }
  if (collection === "kodland_groups") {
    row.local_class_id = value.local_class_id ?? value.localClassId ?? null;
  }
  return row;
};

const importPedagogicalRows = (
  payload: ImportPayload,
  name: PedagogicalCollection,
) =>
  pedagogicalValues(payload, name).map((item) =>
    normalizePedagogicalRow(item, name),
  );

const importedLessonDocumentId = (courseId: string, lessonId: string) =>
  `${courseId}--${encodeURIComponent(lessonId)}`;

/**
 * The route has already filtered provider values. This second boundary keeps
 * Firestore documents predictable even if a malformed response reaches the
 * browser, and deliberately has no fields for credentials or provider tokens.
 */
const normalizeImportedCourseResult = (value: unknown): CourseImportResult => {
  if (!value || typeof value !== "object")
    throw new ApiError(400, "A resposta da importacao e invalida.");
  const payload = value as Record<string, unknown>;
  const course = payload.course;
  if (!course || typeof course !== "object")
    throw new ApiError(400, "O curso importado e invalido.");
  const courseData = course as Record<string, unknown>;
  const id = String(courseData.id ?? "");
  const name = String(courseData.name ?? "").trim();
  const lessonCount = Number(courseData.lesson_count ?? 0);
  if (!/^(roblox|scratch|python)$/.test(id) || !name || !Number.isInteger(lessonCount) || lessonCount < 0 || lessonCount > 80)
    throw new ApiError(400, "O curso importado e invalido.");
  const rawLessons = Array.isArray(payload.lessons) ? payload.lessons : [];
  if (rawLessons.length !== lessonCount || rawLessons.length > 80)
    throw new ApiError(400, "A lista de aulas importadas e invalida.");
  const url = (item: Record<string, unknown>, key: string) => {
    const value = item[key];
    return typeof value === "string" && /^https:\/\//i.test(value) && value.length <= 4096
      ? value
      : "";
  };
  const lessons = rawLessons.map((entry) => {
    if (!entry || typeof entry !== "object")
      throw new ApiError(400, "A lista de aulas importadas e invalida.");
    const item = entry as Record<string, unknown>;
    const sourceId = String(item.id ?? "").trim();
    const title = String(item.title ?? "").trim();
    const lessonNumber = Number(item.lesson_number ?? 0);
    if (!sourceId || sourceId.length > 256 || !title || title.length > 512 || !Number.isFinite(lessonNumber))
      throw new ApiError(400, "A lista de aulas importadas e invalida.");
    return {
      id: sourceId,
      lesson_number: lessonNumber,
      title,
      module_number: String(item.module_number ?? "").slice(0, 128),
      external_url: url(item, "external_url"),
      slides_url: url(item, "slides_url"),
      guide_url: url(item, "guide_url"),
      homework_url: url(item, "homework_url"),
      homework_title: String(item.homework_title ?? "").slice(0, 512),
      classroom_tasks: Array.isArray(item.classroom_tasks)
        ? item.classroom_tasks.flatMap((entry) => {
            if (!entry || typeof entry !== "object") return [];
            const task = entry as Record<string, unknown>;
            const taskUrl = url(task, "url");
            return taskUrl
              ? [{ title: String(task.title ?? "").slice(0, 512), url: taskUrl }]
              : [];
          })
        : [],
    };
  });
  return { course: { id: id as CourseImportInput["courseId"], name, lesson_count: lessonCount }, lessons };
};

export const authApi = {
  me: async (): Promise<User> => {
    const user = authUser();
    return {
      id: user.uid,
      name: user.displayName || user.email?.split("@")[0] || "Professor",
      email: user.email || "",
    };
  },
  login: async () => {
    throw new ApiError(410, "Use o formulário de login do Firebase.");
  },
  logout: async () => undefined,
};
export const dashboardApi = {
  get: async () =>
    dashboardFrom(
      await rows("classes"),
      await rows("lessons"),
      await rows("payments"),
      await rows("kodland_groups"),
      await rows("kodland_lessons"),
      isoToday(),
      await rows("kodland_extra_lessons"),
      await rows("kodland_financial_overrides"),
    ),
};
export const classesApi = {
  list: async (active = true) => {
    const items = (await rows("classes")).filter(
      (item) => !active || item.active !== false,
    ) as unknown as ClassRecord[];
    return { items, total: items.length };
  },
  create: async (payload: ClassPayload) => {
    const id = crypto.randomUUID();
    const createdAt = now();
    const record: ClassRecord & { created_at: string } = {
      id,
      ...payload,
      active: true,
      created_at: createdAt,
    };
    const batch = writeBatch(getFirebaseDb());
    batch.set(doc(ref("classes"), id), record);
    lessonsForClass(id, payload, createdAt).forEach((lesson) =>
      batch.set(doc(ref("lessons"), lesson.id), lesson),
    );
    await batch.commit();
    return record;
  },
  update: async (id: string, payload: Partial<ClassPayload>) => {
    const current = (await rows("classes")).find((item) => item.id === id);
    if (!current) throw new ApiError(404, "Turma não encontrada.");
    const next = { ...current, ...payload, id, active: true } as ClassRecord &
      Row;
    const currentLessons = (await rows("lessons")).filter(
      (item) => item.class_id === id,
    );
    const receivedDates = new Set(
      (await rows("payments")).map((item) => String(item.payment_date)),
    );
    const preserved = currentLessons.filter((lesson) =>
      receivedDates.has(paymentDate(String(lesson.lesson_date))),
    );
    const batch = writeBatch(getFirebaseDb());
    batch.set(doc(ref("classes"), id), {
      ...next,
      created_at: String(current.created_at ?? now()),
      updated_at: now(),
    });
    currentLessons.forEach((lesson) =>
      batch.delete(doc(ref("lessons"), String(lesson.id))),
    );
    preserved.forEach((lesson) =>
      batch.set(doc(ref("lessons"), String(lesson.id)), lesson),
    );
    lessonsForClass(id, next, now())
      .filter((lesson) => !receivedDates.has(paymentDate(lesson.lesson_date)))
      .forEach((lesson) => batch.set(doc(ref("lessons"), lesson.id), lesson));
    await batch.commit();
    return next;
  },
  deactivate: async (id: string) => {
    const receivedDates = new Set(
      (await rows("payments")).map((item) => String(item.payment_date)),
    );
    const classLessons = (await rows("lessons")).filter(
      (item) => item.class_id === id,
    );
    const batch = writeBatch(getFirebaseDb());
    batch.update(doc(ref("classes"), id), { active: false, updated_at: now() });
    classLessons
      .filter(
        (lesson) => !receivedDates.has(paymentDate(String(lesson.lesson_date))),
      )
      .forEach((lesson) =>
        batch.update(doc(ref("lessons"), String(lesson.id)), {
          active: false,
          canceled: true,
        }),
      );
    await batch.commit();
    return { id, active: false };
  },
};
export const lessonsApi = {
  list: async (filters: LessonFilters = {}) => {
    let items = (await rows("lessons")).map((row) => asLesson(row));
    if (filters.type)
      items = items.filter((item) => item.type === filters.type);
    if (filters.from)
      items = items.filter((item) => item.lesson_date >= filters.from!);
    if (filters.to)
      items = items.filter((item) => item.lesson_date <= filters.to!);
    if (filters.status === "ACTIVE")
      items = items.filter(
        (item) => item.status === "COMPLETED" || item.status === "FUTURE",
      );
    else if (filters.status)
      items = items.filter((item) => item.status === filters.status);
    items.sort((a, b) => b.lesson_date.localeCompare(a.lesson_date));
    const page = filters.page ?? 1;
    const pageSize = filters.page_size ?? 50;
    return {
      items: items.slice((page - 1) * pageSize, page * pageSize),
      total: items.length,
      page,
      page_size: pageSize,
    };
  },
  createExtra: async (payload: ExtraLessonPayload) => {
    const id = crypto.randomUUID();
    const record = {
      id,
      class_id: null,
      class_name_snapshot: "Aula extra",
      number: 1,
      ...payload,
      type: "EXTRA",
      active: true,
      canceled: false,
      created_at: now(),
    };
    await setDoc(doc(ref("lessons"), id), record);
    return asLesson(record);
  },
  cancel: async (id: string) => {
    const item = (await rows("lessons")).find((row) => row.id === id);
    if (!item) throw new ApiError(404, "Aula não encontrada.");
    const paymentRows = await rows("payments");
    if (
      paymentRows.some(
        (row) =>
          String(row.payment_date) === paymentDate(String(item.lesson_date)),
      )
    )
      throw new ApiError(
        409,
        "Aulas de pagamento recebido não podem ser canceladas.",
      );
    await updateDoc(doc(ref("lessons"), id), { active: false, canceled: true });
    return asLesson({ ...item, active: false, canceled: true });
  },
};
const paymentDetail = async (date: string): Promise<PaymentDetail> => {
  const dashboard = await dashboardApi.get();
  const payment = dashboard.payments.find((item) => item.payment_date === date);
  if (!payment) throw new ApiError(404, "Pagamento não encontrado.");
  const confirmation = (await rows("payments")).find(
    (item) => item.payment_date === date,
  );
  return {
    ...payment,
    received_at: confirmation ? String(confirmation.received_at) : null,
    confirmation_note: confirmation ? String(confirmation.note ?? "") : null,
  };
};
export const paymentsApi = {
  list: async () => {
    const items = (await dashboardApi.get()).payments;
    return { items, total: items.length };
  },
  get: paymentDetail,
  confirm: async (date: string, note = "") => {
    const payment = await paymentDetail(date);
    await setDoc(doc(ref("payments"), date), {
      payment_date: date,
      status: "RECEIVED",
      received_at: now(),
      note,
      created_at: now(),
    });
    return {
      payment: { ...payment, status: "RECEIVED" },
      received_at: now(),
      note,
    };
  },
  reverse: async (date: string) => {
    await deleteDoc(doc(ref("payments"), date));
  },
  setStatus: async (date: string, status: "RECEIVED" | "OVERDUE") => {
    if (status === "RECEIVED") return paymentsApi.confirm(date);
    await setDoc(doc(ref("payments"), date), {
      payment_date: date,
      status: "OVERDUE",
      received_at: "",
      created_at: now(),
    });
  },
  updateLessonFinancialStatus: async (
    paymentDate: string,
    financialLessonId: string,
    sourceLessonId: string | undefined,
    status: "" | "SUBSTITUTION" | "HOLIDAY" | "CANCELED",
  ) => {
    if (
      (await rows("payments")).some(
        (row) => String(row.payment_date) === paymentDate,
      )
    )
      throw new ApiError(
        409,
        "CompetÃªncias recebidas nÃ£o podem ter aulas alteradas.",
      );
    const localLesson = (await rows("lessons")).find(
      (lesson) => String(lesson.id) === financialLessonId,
    );
    if (localLesson) {
      await updateDoc(doc(ref("lessons"), financialLessonId), {
        financial_status: status,
        updated_at: now(),
      });
      return;
    }
    if (sourceLessonId) {
      await updateDoc(doc(ref("kodland_lessons"), sourceLessonId), {
        financial_status: status,
        updated_at: now(),
      });
      return;
    }
    const id = encodeURIComponent(financialLessonId);
    await setDoc(doc(ref("kodland_financial_overrides"), id), {
      id,
      financial_lesson_id: financialLessonId,
      financial_status: status,
      created_at: now(),
      updated_at: now(),
    });
  },
};
export const kodlandApi = {
  groups: async () => ({
    items: (await rows("kodland_groups")) as unknown as KodlandGroup[],
  }),
  students: async () => ({
    items: (await rows("kodland_students")).filter(
      (item) => !item.hidden,
    ) as unknown as KodlandStudent[],
  }),
  reviews: async () => ({
    items: (await rows("kodland_reviews")) as unknown as KodlandReview[],
  }),
  lessons: async () => ({
    items: (await rows("kodland_lessons")) as unknown as KodlandLesson[],
  }),
  extraLessons: async () => ({
    items: (await rows(
      "kodland_extra_lessons",
    )) as unknown as KodlandExtraLesson[],
  }),
  availability: async () => ({
    items: (await rows(
      "kodland_availability",
    )) as unknown as KodlandAvailability[],
  }),
  updateLessonFinancialStatus: async (id: string, status: string) => {
    await updateDoc(doc(ref("kodland_lessons"), id), {
      financial_status: status,
      updated_at: now(),
    });
  },
  updateExtraStatus: async (
    id: string,
    manualStatus: KodlandExtraManualStatus,
  ) => {
    const current = (await rows("kodland_extra_lessons")).find(
      (item) => String(item.id) === id,
    );
    if (!current) throw new Error("A aula extra não foi encontrada.");
    const updated = {
      ...current,
      manual_status: manualStatus,
      completed: manualStatus === "DONE",
      updated_at: now(),
    };
    await updateDoc(doc(ref("kodland_extra_lessons"), id), updated);
    return updated as unknown as KodlandExtraLesson;
  },
  sync: async (
    username: string,
    password: string,
    mode: KodlandSyncMode = "essential",
    options: KodlandSyncOptions = {},
  ): Promise<KodlandSyncResult> => {
    const firebaseUser = authUser();
    const firebaseUserId = firebaseUser.uid;
    const syncCollection = (name: string) => ref(name, firebaseUserId);
    const syncStatusRef = doc(syncCollection("sync_status"), "kodland");
    const pendingExtraStudentIds = [
      ...new Set(
        (await rows("kodland_extra_lessons"))
          .filter(
            (lesson) =>
              lesson.completed !== true &&
              lesson.manual_status !== "PENDING" &&
              lesson.manual_status !== "DONE" &&
              lesson.manual_status !== "ACCOUNTED",
          )
          .map((lesson) => String(lesson.external_student_id ?? ""))
          .filter(Boolean),
      ),
    ];
    const token = await (
      firebaseUser as unknown as { getIdToken: () => Promise<string> }
    ).getIdToken();
    const syncId = crypto.randomUUID();
    let response: Response;
    try {
      response = await fetch("/api/kodland/sync", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${token}`,
          "x-sync-id": syncId,
        },
        body: JSON.stringify({
          username,
          password,
          mode,
          pending_extra_student_ids: pendingExtraStudentIds,
          correction_group_ids: options.correctionGroupIds,
        }),
      });
    } catch {
      throw kodlandSyncNetworkError(syncId);
    }
    const snapshot = await readKodlandSyncResponse<KodlandSnapshot>(response, syncId);
    let persistencePhase: "leitura" | "gravação" = "leitura";
    try {
    const createdAt = now();
    await setDoc(syncStatusRef, {
      status: "running",
      sync_id: syncId,
      mode,
      started_at: createdAt,
    });
    const finish = async <T,>(result: T) => {
      await setDoc(syncStatusRef, {
        status: "complete",
        sync_id: syncId,
        mode,
        completed_at: now(),
      });
      return result;
    };
    if (mode === "corrections") {
      const previousReviews = await rows("kodland_reviews");
      const reviews = uniqueBy(snapshot.reviews, (item) => item.id);
      const upserts: Array<(batch: FirebaseWriteBatch) => void> = reviews.map(
        (item) => (batch) =>
          batch.set(doc(syncCollection("kodland_reviews"), item.id), firestorePayload({
            ...item,
            created_at: createdAt,
          })),
      );
      const incoming = new Set(reviews.map((item) => item.id));
      const reviewedGroupIds = new Set(
        snapshot.review_group_ids?.map(String) ??
          reviews.map((review) => String(review.external_class_id)),
      );
      const deletes: Array<(batch: FirebaseWriteBatch) => void> = previousReviews
        .filter(
          (item) =>
            reviewedGroupIds.has(String(item.external_class_id)) &&
            !incoming.has(String(item.id)),
        )
        .map((item) => (batch) =>
          batch.delete(doc(syncCollection("kodland_reviews"), String(item.id))));
      persistencePhase = "gravação";
      await commitWrites(upserts);
      await commitWrites(deletes);
      return finish({ group_count: 0, student_count: 0, review_count: reviews.length, lesson_count: 0, extra_lesson_count: 0 });
    }
    if (mode === "profiles") {
      const previousStudents = await rows("kodland_students");
      const students = uniqueBy(snapshot.students, (item) => item.id);
      const previousById = new Map(
        previousStudents.map((student) => [String(student.id), student]),
      );
      const writes: Array<(batch: FirebaseWriteBatch) => void> = students
        .filter((student) => previousById.has(student.id))
        .map((student) => {
          const previous = previousById.get(student.id)!;
          return (batch) => batch.update(doc(syncCollection("kodland_students"), student.id), {
            guardian_name: student.guardian_name || previous.guardian_name || "",
            guardian_relationship: student.guardian_relationship || previous.guardian_relationship || "",
            guardian_phone: student.guardian_phone || previous.guardian_phone || "",
            guardian_email: student.guardian_email || previous.guardian_email || "",
            updated_at: createdAt,
          });
        });
      persistencePhase = "gravação";
      await commitWrites(writes);
      return finish({ group_count: 0, student_count: writes.length, review_count: 0, lesson_count: 0, extra_lesson_count: 0 });
    }
    const oldGroups = await rows("kodland_groups");
    const links = new Map(
      oldGroups.map((item) => [
        String(item.external_id),
        item.local_class_id ?? null,
      ]),
    );
    const oldStudents = await rows("kodland_students");
    const oldLessons = await rows("kodland_lessons");
    const oldExtraLessons = await rows("kodland_extra_lessons");
    const oldAvailability = await rows("kodland_availability");
    const groups = uniqueBy(snapshot.groups, (item) => item.external_id);
    const students = uniqueBy(snapshot.students, (item) => item.id);
    const lessons = uniqueBy(
      snapshot.lessons,
      (item) => kodlandLessonDocumentId(item),
    );
    const extraLessons = uniqueBy(snapshot.extra_lessons, (item) => item.id);
    const availability = uniqueBy(snapshot.availability, (item) => item.id);
    const upserts: Array<(batch: FirebaseWriteBatch) => void> = [];
    const deletes: Array<(batch: FirebaseWriteBatch) => void> = [];
    groups.forEach((item) =>
      upserts.push((batch) =>
        batch.set(doc(syncCollection("kodland_groups"), item.external_id), firestorePayload({
          ...item,
          id: item.external_id,
          local_class_id: links.get(item.external_id) ?? null,
          created_at: createdAt,
        })),
      ),
    );
    students.forEach((item) => {
      const previous = oldStudents.find(
        (student) => String(student.id) === item.id,
      );
      upserts.push((batch) => batch.set(doc(syncCollection("kodland_students"), item.id), firestorePayload({
        ...item,
        local_note: String(previous?.local_note ?? ""),
        // Contact fields come from the latest read-only profile snapshot.
        // Keep the last value only when the profile has no value, so a
        // temporary omission does not erase a previously synchronized contact.
        guardian_name: String(
          item.guardian_name || previous?.guardian_name || "",
        ),
        guardian_relationship: String(
          item.guardian_relationship || previous?.guardian_relationship || "",
        ),
        guardian_phone: String(
          item.guardian_phone || previous?.guardian_phone || "",
        ),
        guardian_email: String(
          item.guardian_email || previous?.guardian_email || "",
        ),
        guardian_note: String(previous?.guardian_note ?? ""),
        hidden: Boolean(previous?.hidden ?? false),
        created_at: String(previous?.created_at ?? createdAt),
      })));
    });
    lessons.forEach((item) => {
      const documentId = kodlandLessonDocumentId(item);
      const previous = oldLessons.find(
        (lesson) =>
          String(lesson.id) === documentId ||
          (String(lesson.id) === item.id &&
            String(lesson.external_class_id) === item.external_class_id),
      ) as Partial<KodlandLesson> | undefined;
      upserts.push((batch) => batch.set(doc(syncCollection("kodland_lessons"), documentId),
        firestorePayload(mergeSyncedKodlandLesson(item, previous, createdAt))));
    });
    // Lesson endpoints are optional during the lightweight refresh. Keep an
    // older lesson rather than treating a temporary upstream omission as a
    // deletion; a future full reconciliation can remove confirmed stale rows.
    if (snapshot.extra_lessons_synced === true) {
      const incomingExtraIds = new Set(extraLessons.map((item) => item.id));
      oldExtraLessons
        .filter((item) =>
          item.completed !== true &&
          !item.manual_status &&
          !incomingExtraIds.has(String(item.id)),
        )
        .forEach((item) =>
          deletes.push((batch) =>
            batch.delete(doc(syncCollection("kodland_extra_lessons"), String(item.id))),
          ),
        );
      extraLessons.forEach((item) => {
        const previous = oldExtraLessons.find(
          (lesson) => String(lesson.id) === item.id,
        );
        const previousManualStatus = previous?.manual_status as
          | KodlandExtraManualStatus
          | undefined;
        const manualStatus =
          previousManualStatus === "ACCOUNTED" ? "DONE" : previousManualStatus;
        upserts.push((batch) => batch.set(doc(syncCollection("kodland_extra_lessons"), item.id), firestorePayload({
          ...item,
          manual_status: manualStatus,
          completed:
            manualStatus === "DONE"
              ? true
              : manualStatus === "PENDING"
                ? false
                : item.completed,
          created_at: String(previous?.created_at ?? createdAt),
          updated_at: createdAt,
        })));
      });
    }
    if (snapshot.availability_synced === true) {
      const incomingAvailabilityIds = new Set(availability.map((item) => item.id));
      oldAvailability
        .filter((item) => !incomingAvailabilityIds.has(String(item.id)))
        .forEach((item) =>
        deletes.push((batch) =>
          batch.delete(doc(syncCollection("kodland_availability"), String(item.id))),
        ),
      );
      availability.forEach((item) =>
        upserts.push((batch) => batch.set(doc(syncCollection("kodland_availability"), item.id), firestorePayload({
          ...item,
          created_at: createdAt,
        }))),
      );
    }
    persistencePhase = "gravação";
    await commitWrites(upserts);
    await commitWrites(deletes);
    return finish({
      group_count: groups.length,
      student_count: students.length,
      review_count: 0,
      lesson_count: lessons.length,
      extra_lesson_count: extraLessons.length,
      group_ids: groups
        .filter((group) => !group.archived)
        .map((group) => group.external_id),
    });
    } catch (error) {
      const failure = firestoreFailure(error);
      console.error("[kodland-sync-persistence]", JSON.stringify({
        syncId,
        phase: persistencePhase,
        code: failure.code,
      }));
      try {
        await setDoc(syncStatusRef, {
          status: "failed",
          sync_id: syncId,
          mode,
          failed_at: now(),
          phase: persistencePhase,
        });
      } catch {
        // Preserve the original persistence error when even the status marker cannot be saved.
      }
      throw new KodlandSyncPersistenceError(syncId, persistencePhase, failure.detail);
    }
  },
  syncAll: async (
    username: string,
    password: string,
    onProgress?: (message: string) => void,
    options: KodlandSyncOptions = {},
  ): Promise<KodlandSyncResult> => {
    onProgress?.("Atualizando turmas, alunos, agenda e aulas…");
    const core = await kodlandApi.sync(username, password, "essential", options);
    const groupIds = core.group_ids ?? [];
    let reviewCount = 0;
    for (let index = 0; index < groupIds.length; index += 1) {
      onProgress?.(`Atualizando correções: ${index + 1} de ${groupIds.length} turma(s)…`);
      const result = await kodlandApi.sync(username, password, "corrections", {
        correctionGroupIds: [groupIds[index]],
      });
      reviewCount += result.review_count;
    }
    return {
      ...core,
      review_count: reviewCount,
    };
  },
  loadLessonMaterials: async (
    lesson: Pick<KodlandLesson, "id" | "external_class_id" | "source_lesson_id">,
    username: string,
    password: string,
  ) => {
    if (!lesson.source_lesson_id || !lesson.external_class_id) {
      throw new ApiError(409, "Sincronize as turmas novamente para identificar esta aula na Kodland.");
    }
    const lessonRef = doc(ref("kodland_lessons"), lesson.id);
    const currentSnapshot = await getDoc(lessonRef);
    const current = currentSnapshot.data() as KodlandLesson | undefined;
    if (!currentSnapshot.exists() || !current ||
        current.external_class_id !== lesson.external_class_id ||
        current.source_lesson_id !== lesson.source_lesson_id) {
      throw new ApiError(409, "A aula mudou desde a última sincronização. Atualize a página e tente novamente.");
    }
    const hadLoadedMaterials = hasKodlandMaterials(current);
    const token = await (
      authUser() as unknown as { getIdToken: () => Promise<string> }
    ).getIdToken();
    const syncId = crypto.randomUUID();
    try {
      let response: Response;
      try {
        response = await fetch("/api/kodland/sync", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
            "x-sync-id": syncId,
          },
          body: JSON.stringify({
            username,
            password,
            mode: "materials",
            group_id: lesson.external_class_id,
            source_lesson_id: lesson.source_lesson_id,
          }),
        });
      } catch {
        throw kodlandSyncNetworkError(syncId);
      }
      const result = await readKodlandSyncResponse<KodlandSnapshot & { material: KodlandMaterial }>(response, syncId);
      if (!result.material || result.material.group_id !== lesson.external_class_id ||
          result.material.source_lesson_id !== lesson.source_lesson_id) {
        throw new Error("O servidor retornou materiais de outra aula. Tente novamente.");
      }
      const updates = mergeLoadedKodlandMaterials(current, result.material);
      await updateDoc(lessonRef, { ...updates, updated_at: now() });
      return { ...current, ...updates };
    } catch (reason) {
      if (!hadLoadedMaterials) {
        try {
          await updateDoc(lessonRef, { materials_status: "error", updated_at: now() });
        } catch {
          // Preserve the original failure; existing links remain untouched.
        }
      }
      throw reason;
    }
  },
  linkGroup: async (externalId: string, localClassId: string | null) => {
    await updateDoc(doc(ref("kodland_groups"), externalId), {
      local_class_id: localClassId,
      updated_at: now(),
    });
  },
  updateStudent: async (
    id: string,
    payload: Partial<
      Pick<
        KodlandStudent,
        | "name"
        | "email"
        | "phone"
        | "status"
        | "profile_url"
        | "local_note"
        | "guardian_name"
        | "guardian_relationship"
        | "guardian_phone"
        | "guardian_email"
        | "guardian_note"
      >
    >,
  ) => {
    await updateDoc(doc(ref("kodland_students"), id), {
      ...payload,
      updated_at: now(),
    });
  },
  hideStudent: async (id: string) => {
    await updateDoc(doc(ref("kodland_students"), id), {
      hidden: true,
      updated_at: now(),
    });
  },
};

export const lessonNotesApi = {
  get: async (lessonKey: string) => {
    const snapshot = await getDoc(doc(ref("lesson_notes"), lessonKey));
    const data = snapshot.data();
    return snapshot.exists() && data ? String(data.content ?? "") : "";
  },
  save: async (lessonKey: string, content: string) => {
    const timestamp = now();
    await setDoc(
      doc(ref("lesson_notes"), lessonKey),
      {
        content,
        updated_at: timestamp,
        created_at: timestamp,
      },
    );
  },
};
export const courseImportApi = {
  catalog: async (): Promise<CourseImportOption[]> => {
    const user = authUser() as unknown as { getIdToken: () => Promise<string> };
    const response = await fetch("/api/courses/import", {
      headers: { authorization: `Bearer ${await user.getIdToken()}` },
      cache: "no-store",
    });
    const payload = await response.json() as { courses?: unknown[]; message?: unknown };
    if (!response.ok)
      throw new ApiError(response.status, String(payload.message ?? "Nao foi possivel carregar os cursos."));
    const allowed = new Set<CourseImportInput["courseId"]>(["roblox", "scratch", "python"]);
    return (payload.courses ?? []).flatMap((value) => {
      if (!value || typeof value !== "object") return [];
      const item = value as Record<string, unknown>;
      if (typeof item.id !== "string" || !allowed.has(item.id as CourseImportInput["courseId"])) return [];
      return [{
        id: item.id as CourseImportInput["courseId"],
        name: typeof item.name === "string" ? item.name : item.id,
        available: item.available === true,
      }];
    });
  },
  courses: async () => ({
    items: (await rows("imported_courses")) as unknown as ImportedCourse[],
  }),
  lessons: async (courseId?: string) => ({
    items: (await rows("imported_course_lessons"))
      .filter((item) => !courseId || item.course_id === courseId)
      .map((item) => item as unknown as ImportedCourseLesson),
  }),
  import: async (input: CourseImportInput): Promise<CourseImportResult> => {
    const user = authUser() as unknown as { getIdToken: () => Promise<string> };
    const response = await fetch("/api/courses/import", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${await user.getIdToken()}`,
      },
      // Credentials are sent only to the import request and never persisted.
      body: JSON.stringify(input),
    });
    const payload = await response.json() as Record<string, unknown>;
    if (!response.ok)
      throw new ApiError(response.status, String(payload.message ?? "Nao foi possivel importar o curso."));
    const result = normalizeImportedCourseResult(payload);
    const timestamp = now();
    const [existing, importedCourses] = await Promise.all([
      rows("imported_course_lessons"),
      rows("imported_courses"),
    ]);
    const previousCourse = importedCourses.find((course) => course.id === result.course.id);
    const batch = writeBatch(getFirebaseDb());

    // Only entries created by this course-import source are replaced. The
    // synchronized schedule remains in kodland_lessons and is never touched.
    existing
      .filter((lesson) => lesson.course_id === result.course.id && lesson.source === "course_import")
      .forEach((lesson) => batch.delete(doc(ref("imported_course_lessons"), String(lesson.id))));
    batch.set(doc(ref("imported_courses"), result.course.id), {
      ...result.course,
      source: "course_import",
      imported_at: timestamp,
      updated_at: timestamp,
      created_at: String(previousCourse?.created_at ?? timestamp),
    });
    result.lessons.forEach((lesson) => {
      const id = importedLessonDocumentId(result.course.id, lesson.id);
      batch.set(doc(ref("imported_course_lessons"), id), {
        ...lesson,
        id,
        source_lesson_id: lesson.id,
        course_id: result.course.id,
        source: "course_import",
        created_at: timestamp,
        updated_at: timestamp,
      });
    });
    await batch.commit();
    return result;
  },
};
export const dataApi = {
  export: async (): Promise<DataExport> => ({
    schema_version: "1.0",
    exported_at: now(),
    user: await authApi.me(),
    classes: await rows("classes"),
    lessons: await rows("lessons"),
    payment_confirmations: await rows("payments"),
    kodland_groups: await rows("kodland_groups"),
    kodland_students: await rows("kodland_students"),
    kodland_reviews: await rows("kodland_reviews"),
    kodland_lessons: await rows("kodland_lessons"),
    kodland_extra_lessons: await rows("kodland_extra_lessons"),
    imported_courses: await rows("imported_courses"),
    imported_course_lessons: await rows("imported_course_lessons"),
  }),
  previewImport: async (payload: unknown): Promise<ImportReport> => {
    const value = payload as ImportPayload;
    const exportId = String(
      value.export_id ??
        value.exportId ??
        value.exported_at ??
        value.exportedAt ??
        crypto.randomUUID(),
    );
    const imported = await getDoc(doc(ref("imports"), exportId));
    const classes = importRows(value, "classes");
    const lessons = importRows(value, "lessons");
    const payments = importRows(value, "payments");
    const groups = importPedagogicalRows(value, "kodland_groups");
    const students = importPedagogicalRows(value, "kodland_students");
    const reviews = importPedagogicalRows(value, "kodland_reviews");
    const pedagogicalLessons = importPedagogicalRows(value, "kodland_lessons");
    return {
      export_id: exportId,
      already_imported: imported.exists(),
      class_count: classes.length,
      lesson_count: lessons.length,
      payment_confirmation_count: payments.length,
      total_cents: lessons.reduce((total, lesson) => total + cents(lesson), 0),
      imported_at: imported.data()?.imported_at
        ? String(imported.data()?.imported_at)
        : null,
      pedagogical_group_count: groups.length,
      pedagogical_student_count: students.length,
      pedagogical_review_count: reviews.length,
      pedagogical_lesson_count: pedagogicalLessons.length,
    };
  },
  import: async (payload: unknown): Promise<ImportReport> => {
    const value = payload as ImportPayload;
    const preview = await dataApi.previewImport(value);
    if (preview.already_imported) return preview;
    const batch = writeBatch(getFirebaseDb());
    importRows(value, "classes").forEach((item) =>
      batch.set(doc(ref("classes"), String(item.id)), item),
    );
    importRows(value, "lessons").forEach((item) =>
      batch.set(doc(ref("lessons"), String(item.id)), item),
    );
    importRows(value, "payments").forEach((item) =>
      batch.set(doc(ref("payments"), String(item.id)), item),
    );
    importPedagogicalRows(value, "kodland_groups").forEach((item) =>
      batch.set(doc(ref("kodland_groups"), String(item.id)), item),
    );
    importPedagogicalRows(value, "kodland_students").forEach((item) =>
      batch.set(doc(ref("kodland_students"), String(item.id)), item),
    );
    importPedagogicalRows(value, "kodland_reviews").forEach((item) =>
      batch.set(doc(ref("kodland_reviews"), String(item.id)), item),
    );
    importPedagogicalRows(value, "kodland_lessons").forEach((item) =>
      batch.set(doc(ref("kodland_lessons"), String(item.id)), item),
    );
    importPedagogicalRows(value, "kodland_extra_lessons").forEach((item) =>
      batch.set(doc(ref("kodland_extra_lessons"), String(item.id)), item),
    );
    batch.set(doc(ref("imports"), preview.export_id), {
      imported_at: now(),
      created_at: now(),
    });
    await batch.commit();
    return { ...preview, imported_at: now() };
  },
  reset: async (password: string) => {
    if (!password) throw new ApiError(400, "Informe sua senha para confirmar.");
    await reauthenticateWithFirebase(password);
    const batch = writeBatch(getFirebaseDb());
    for (const name of [
      "classes",
      "lessons",
      "payments",
      "imports",
      "kodland_groups",
      "kodland_students",
      "kodland_reviews",
      "kodland_lessons",
      "kodland_extra_lessons",
      "imported_courses",
      "imported_course_lessons",
    ])
      (await rows(name)).forEach((item) =>
        batch.delete(doc(ref(name), String(item.id))),
      );
    await batch.commit();
  },
};
export const __test = {
  period,
  paymentDate,
  dashboardFrom,
  normalizeClass,
  normalizeLesson,
  normalizePayment,
  normalizePedagogicalRow,
  importPedagogicalRows,
  normalizeImportedCourseResult,
  importedLessonDocumentId,
  firestorePayload,
};
