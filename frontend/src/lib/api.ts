import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  runTransaction,
  setDoc,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { reauthenticateWithFirebase } from "@/lib/firebase-auth";
import {
  customHolidayDocumentId,
  type CustomHoliday,
  type FinancialOverrideStatus,
  resolveFinancialStatus,
} from "@/lib/holidays";
import type { KodlandLesson } from "@/lib/kodland-lessons";
import { isHttpUrl, type ManualActivity, type ManualLessonContent } from "@/lib/manual-pedagogy";
import {
  KodlandSyncPersistenceError,
  kodlandSyncNetworkError,
  readKodlandSyncResponse,
} from "@/lib/kodland-sync-response";
import {
  effectiveHourlyRate,
  generateRecurringOccurrences,
  lessonValueCents,
  nextMonthPaymentDate,
  saoPauloLocalTimestamp,
  type RatePeriod,
  type RecurringClass,
  type WeeklySlot,
} from "@/lib/teaching-finance";
import {
  effectivePaymentDay,
  reconcileWeeklySlots,
  tomorrowCivilDate,
  validateManualClassInput,
  type KodlandClassSettings,
  type ManualClass,
  type ManualClassGroup,
  type ManualClassGroupInput,
  type ManualClassInput,
  type ManualStudent,
  type PaymentDayPeriod,
} from "@/lib/manual-teaching";

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
  holiday?: { date: string; name: string; source: "NATIONAL" | "CUSTOM" };
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
  schedule_slots?: WeeklySlot[];
  rate_history?: RatePeriod[];
  payment_day?: number;
  end_date?: string | null;
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
  manual_student_count: number;
  manual_class_group_count: number;
  manual_class_count: number;
  manual_lesson_count: number;
  manual_activity_count: number;
};
export type DataExport = {
  schema_version: "2.0";
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
  manual_students: unknown[];
  manual_class_groups: unknown[];
  manual_classes: unknown[];
  manual_lesson_content: unknown[];
  manual_activities: unknown[];
  teaching_settings: Record<string, unknown> | null;
  kodland_class_settings: unknown[];
  kodland_financial_overrides: unknown[];
  holidays: unknown[];
  lesson_notes: unknown[];
  tutorials: unknown[];
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
  request_id?: string;
  recording_booking_id?: string;
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
  material_count?: number;
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
  extra_lessons_complete?: boolean;
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

type KodlandMaterialRequest = Pick<
  KodlandMaterial,
  "group_id" | "source_lesson_id"
>;

const KODLAND_MATERIAL_BATCH_SIZE = 4;

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

const materialKey = (material: KodlandMaterialRequest) =>
  `${material.group_id}:${material.source_lesson_id}`;

async function requestKodlandMaterials(
  username: string,
  password: string,
  requested: KodlandMaterialRequest[],
): Promise<KodlandMaterial[]> {
  const requests = uniqueBy(
    requested.filter((item) => item.group_id && item.source_lesson_id),
    materialKey,
  );
  if (!requests.length) return [];
  if (requests.length > KODLAND_MATERIAL_BATCH_SIZE) {
    throw new Error("A sincronizaÃ§Ã£o de materiais excedeu o tamanho seguro do lote.");
  }
  const token = await (
    authUser() as unknown as { getIdToken: () => Promise<string> }
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
        mode: "materials",
        material_requests: requests,
      }),
    });
  } catch {
    throw kodlandSyncNetworkError(syncId);
  }
  const result = await readKodlandSyncResponse<KodlandSnapshot & {
    material?: KodlandMaterial;
    materials?: KodlandMaterial[];
  }>(response, syncId);
  const materials = Array.isArray(result.materials)
    ? result.materials
    : result.material
      ? [result.material]
      : [];
  const returned = uniqueBy(materials, materialKey);
  const expectedKeys = new Set(requests.map(materialKey));
  if (returned.length !== requests.length ||
      returned.some((material) => !expectedKeys.has(materialKey(material)))) {
    throw new Error("O servidor retornou materiais incompletos. Tente sincronizar novamente.");
  }
  return returned;
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
const allRows = async (name: string): Promise<Row[]> =>
  (await getDocs(ref(name))).docs.map((item) => ({
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
const isoToday = () => saoPauloLocalTimestamp().slice(0, 10);
const now = () => new Date().toISOString();
const paymentDate = nextMonthPaymentDate;
const period = (value: string) => `${value.slice(5, 7)}/${value.slice(0, 4)}`;
const cents = (row: Row) => lessonValueCents(
  Number(row.duration_minutes ?? 0), Number(row.hourly_rate_cents ?? 0),
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
    payment_date: String(row.payment_date ?? paymentDate(date, Number(row.payment_day ?? 15))),
    value_cents: cents(row),
    status,
    financial_status: financialStatus,
    financial_source_id: row.financial_source_id
      ? String(row.financial_source_id)
      : undefined,
  };
};
export type CustomHolidayPayload = {
  date: string;
  name: string;
};
const paymentWasReceived = (row: Row | undefined) =>
  Boolean(row?.received_at) || String(row?.status ?? "") === "RECEIVED";
const reconcileExtraSyncState = (
  previousManualStatus: KodlandExtraManualStatus | undefined,
  platformCompleted: boolean,
  platformVerificationComplete: boolean,
) => {
  // "Pendente" is a local provisional choice: the next platform sync must be
  // able to confirm that the occurrence was conducted. A manually completed
  // extra remains protected as an explicit financial decision.
  const manual_status = previousManualStatus === "ACCOUNTED"
    ? "DONE"
    : previousManualStatus === "PENDING"
      // Do not replace a human decision with an absence of provider data.
      // A confirmed completion remains enough to promote the lesson even if
      // an unrelated calendar source had a transient failure.
      ? platformCompleted || platformVerificationComplete ? undefined : "PENDING"
      : previousManualStatus;
  return {
    manual_status,
    completed: manual_status === "DONE" ? true : platformCompleted,
  };
};
const samePersistedExtra = (
  previous: Row,
  incoming: Omit<KodlandExtraLesson, "created_at">,
) => {
  if (String(previous.id) === incoming.id) return true;
  const previousRequestId = String(previous.request_id ?? "");
  if (previousRequestId && incoming.request_id) {
    return previousRequestId === incoming.request_id;
  }
  return Boolean(
    previous.external_student_id &&
      String(previous.external_student_id) === incoming.external_student_id &&
      String(previous.lesson_date ?? "") === incoming.lesson_date &&
      String(previous.start_time ?? "") === incoming.start_time,
  );
};
const shouldDeleteStaleExtra = (
  item: Row,
  incomingExtraIds: ReadonlySet<string>,
  platformVerificationComplete: boolean,
) =>
  platformVerificationComplete &&
  item.completed !== true &&
  !item.manual_status &&
  !incomingExtraIds.has(String(item.id));
const applyHolidayFinancialResolution = (
  lesson: Lesson,
  customHolidays: readonly CustomHoliday[],
  paymentReceived: boolean,
): Lesson => {
  const resolution = resolveFinancialStatus({
    lessonDate: lesson.lesson_date,
    financialStatus: lesson.financial_status,
    customHolidays,
    paymentReceived,
  });
  // Received competencies are a historical record: automatic calendar changes
  // must not alter their persisted financial result.
  if (paymentReceived) return lesson;
  const canceled = lesson.canceled || !resolution.isBillable;
  return {
    ...lesson,
    active: lesson.active && !canceled,
    canceled,
    status: !lesson.active || canceled ? "CANCELED" : lesson.status,
    financial_status: resolution.financialStatus || lesson.financial_status,
    holiday: resolution.holiday ?? undefined,
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
const rateHistory = (value: unknown): RatePeriod[] =>
  Array.isArray(value) ? value as RatePeriod[] : [];
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
  defaultRateHistory: RatePeriod[] = [],
  kodlandSettings: Row[] = [],
): Lesson[] => {
  const settingsByGroup = new Map(kodlandSettings.map((item) => [String(item.id), item]));
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
    activeGroups.map((group) => {
      const groupId = String(group.external_id ?? group.id);
      const settings = settingsByGroup.get(groupId);
      return [groupId, settings ? {
        ...group,
        rate_history: rateHistory(settings.rate_history).length
          ? rateHistory(settings.rate_history) : rateHistory(group.rate_history),
      } : group] as const;
    }),
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
        hourly_rate_cents: effectiveHourlyRate(
          lessonDate,
          group.hourly_rate_cents == null ? null : Number(group.hourly_rate_cents),
          rateHistory(group.rate_history),
          defaultRateHistory,
          3000,
          String(event?.start_time ?? group.start_time ?? "00:00").slice(0, 5),
        ),
        payment_day: effectivePaymentDay(
          lessonDate,
          (settingsByGroup.get(groupId)?.payment_day_history ?? []) as PaymentDayPeriod[],
          Number(group.payment_day ?? 15),
        ),
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

  return [...byGroup.values()].flatMap((group) => {
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
  kodlandGroups: Row[] = [],
  defaultRateHistory: RatePeriod[] = [],
  kodlandSettings: Row[] = [],
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
      const group = kodlandGroups.find((candidate) =>
        String(candidate.external_id ?? candidate.id) === String(item.external_class_id ?? ""),
      );
      const settings = kodlandSettings.find((candidate) =>
        String(candidate.id) === String(item.external_class_id ?? ""),
      );
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
            hourly_rate_cents: item.hourly_rate_cents == null
              ? effectiveHourlyRate(
                  lessonDate,
                  group?.hourly_rate_cents == null ? null : Number(group.hourly_rate_cents),
                  rateHistory(settings?.rate_history).length
                    ? rateHistory(settings?.rate_history) : rateHistory(group?.rate_history),
                  defaultRateHistory,
                  3000,
                  String(item.start_time ?? "00:00").slice(0, 5),
                )
              : Number(item.hourly_rate_cents),
            payment_day: effectivePaymentDay(
              lessonDate,
              (settings?.payment_day_history ?? []) as PaymentDayPeriod[],
              Number(group?.payment_day ?? 15),
            ),
            active: true,
            canceled: false,
            note: "Aula extra concluída na Kodland",
            created_at: String(item.created_at ?? now()),
          },
          today,
        ),
      ];
    });

const confirmedSnapshot = (confirmation: Row | undefined): DashboardPayment | null => {
  if (!confirmation || !paymentWasReceived(confirmation)) return null;
  const value = confirmation.payment_snapshot;
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const snapshot = value as Partial<DashboardPayment>;
  if (snapshot.payment_date !== confirmation.payment_date ||
      !Number.isInteger(snapshot.total_cents) || !Array.isArray(snapshot.lessons)) return null;
  return { ...snapshot, status: "RECEIVED" } as DashboardPayment;
};

/** Shared pure financial calculation; callers provide rows without persistence. */
export const calculateDashboard = (
  classRows: Row[],
  lessonRows: Row[],
  confirmations: Row[],
  kodlandGroups: Row[] = [],
  kodlandLessons: Row[] = [],
  today = isoToday(),
  kodlandExtraLessons: Row[] = [],
  financialOverrides: Row[] = [],
  customHolidays: CustomHoliday[] = [],
  defaultRateHistory: RatePeriod[] = [],
  kodlandSettings: Row[] = [],
): DashboardResponse => {
  const receivedPaymentDates = new Set(
    confirmations.filter(paymentWasReceived).map((item) => String(item.payment_date)),
  );
  const forecastEnd = new Date(`${today}T12:00:00Z`);
  forecastEnd.setUTCFullYear(forecastEnd.getUTCFullYear() + 1);
  const recurringLessons = classRows.flatMap((row) => {
    if (!Array.isArray(row.schedule_slots) || !row.schedule_slots.length) return [];
    const classRecord = row as unknown as RecurringClass;
    const from = String(row.first_lesson_date ?? today);
    const to = row.active === false && !row.end_date
      ? today
      : forecastEnd.toISOString().slice(0, 10);
    if (from > to) return [];
    return generateRecurringOccurrences(
      classRecord,
      from,
      to,
      lessonRows,
      row.source === "manual" && Number.isInteger(row.initial_default_rate_cents)
        ? [{ effective_from: from, hourly_rate_cents: Number(row.initial_default_rate_cents) }, ...defaultRateHistory]
        : defaultRateHistory,
    ).map((occurrence) => asLesson({
      ...occurrence,
      payment_date: nextMonthPaymentDate(
        occurrence.lesson_date,
        effectivePaymentDay(
          occurrence.lesson_date,
          (row.payment_day_history ?? []) as PaymentDayPeriod[],
          Number(row.payment_day ?? 15),
        ),
      ),
      number: 1,
      student: "",
      type: "NORMAL",
      active: true,
      canceled: false,
      note: "Horário semanal",
      financial_status: financialOverrides.find((item) =>
        item.financial_lesson_id === occurrence.id)?.financial_status ?? "",
    }, today));
  });
  const lessons = [
    ...lessonRows.map((row) => asLesson(row, today)),
    ...recurringLessons,
    ...kodlandFinancialLessons(
      kodlandGroups,
      kodlandLessons,
      classRows,
      today,
      financialOverrides,
      defaultRateHistory,
      kodlandSettings,
    ),
    ...kodlandExtraFinancialLessons(kodlandExtraLessons, today, kodlandGroups, defaultRateHistory, kodlandSettings),
  ].map((lesson) => applyHolidayFinancialResolution(
    lesson,
    customHolidays,
    receivedPaymentDates.has(lesson.payment_date),
  ));
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
  const paymentDates = new Set([
    ...groups.keys(),
    ...confirmations.filter((item) => confirmedSnapshot(item)).map((item) => String(item.payment_date)),
  ]);
  const payments = [...paymentDates]
    .map((date) => [date, groups.get(date) ?? []] as const)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, group]) => {
      const normal = group.filter((item) => item.type === "NORMAL");
      const extra = group.filter((item) => item.type === "EXTRA");
      const confirmation = confirmations.find(
        (item) => String(item.payment_date) === date,
      );
      const manualStatus = String(confirmation?.status ?? "");
      const received = Boolean(confirmation?.received_at) || manualStatus === "RECEIVED";
      const snapshot = confirmedSnapshot(confirmation);
      if (snapshot) return snapshot;
      return {
        payment_date: date,
        period: group.length ? period(group[0].lesson_date) : period(date),
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

const dashboardFrom = calculateDashboard;

// A received payment created before snapshots existed must be closed against
// the financial view the teacher sees on the first access. A transaction keeps
// a second tab from replacing a snapshot written by the first one.
const legacySnapshotWrites = new Map<string, Promise<Map<string, DashboardPayment>>>();
const backfillReceivedSnapshots = async (
  confirmations: Row[],
  dashboard: DashboardResponse,
): Promise<Row[]> => {
  const missing = confirmations.filter((item) =>
    paymentWasReceived(item) && !confirmedSnapshot(item) &&
    dashboard.payments.some((payment) => payment.payment_date === item.payment_date),
  );
  if (!missing.length) return confirmations;
  const userId = authUser().uid;
  const previous = legacySnapshotWrites.get(userId);
  if (previous) await previous;
  const writes = Promise.all(missing.map(async (item) => {
    const candidate = dashboard.payments.find((payment) => payment.payment_date === item.payment_date)!;
    const reference = doc(ref("payments", userId), String(item.id));
    let snapshot: DashboardPayment | null = null;
    try {
      snapshot = await runTransaction(getFirebaseDb(), async (transaction) => {
        const current = await transaction.get(reference);
        if (!current.exists() || !paymentWasReceived(current.data() as Row)) return null;
        const closed = confirmedSnapshot(current.data() as Row);
        if (closed) return closed;
        // Preserve an unexpected pre-existing snapshot instead of overwriting it.
        if (current.data()?.payment_snapshot != null) return null;
        const closedCandidate = { ...candidate, status: "RECEIVED" };
        transaction.update(reference, {
          payment_snapshot: firestorePayload(closedCandidate),
          snapshot_migrated_at: now(),
        });
        return closedCandidate;
      });
    } catch (error) {
      // A temporarily unavailable write must not hide the financial view.
      console.warn("Não foi possível congelar um recibo antigo; nova tentativa no próximo acesso.", error);
    }
    return [String(item.id), snapshot] as const;
  })).then((entries) => new Map(entries.filter((entry): entry is readonly [string, DashboardPayment] => entry[1] !== null)));
  legacySnapshotWrites.set(userId, writes);
  try {
    const snapshots = await writes;
    return confirmations.map((item) => {
      const snapshot = snapshots.get(String(item.id));
      return snapshot ? { ...item, payment_snapshot: snapshot } : item;
    });
  } finally {
    if (legacySnapshotWrites.get(userId) === writes) legacySnapshotWrites.delete(userId);
  }
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
  ...(value.payment_snapshot && typeof value.payment_snapshot === "object"
    ? { payment_snapshot: value.payment_snapshot }
    : {}),
  created_at: String(value.created_at ?? value.createdAt ?? now()),
});
const backupCollectionNames = [
  "classes", "lessons", "payments", "kodland_groups", "kodland_students",
  "kodland_reviews", "kodland_lessons", "kodland_extra_lessons",
  "kodland_availability", "imported_courses", "imported_course_lessons",
  "manual_students", "manual_class_groups", "manual_classes", "manual_lesson_content",
  "manual_activities", "kodland_class_settings",
  "kodland_financial_overrides", "holidays", "lesson_notes", "tutorials",
] as const;
type BackupCollection = typeof backupCollectionNames[number];

const backupPayload = (payload: unknown): ImportPayload => {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ApiError(400, "O arquivo de backup é inválido.");
  }
  const value = payload as ImportPayload;
  if (value.schema_version !== "1.0" && value.schema_version !== "2.0") {
    throw new ApiError(400, "Versão de backup não suportada.");
  }
  if (typeof value.exported_at !== "string" || !value.exported_at) {
    throw new ApiError(400, "O arquivo de backup não tem data de exportação.");
  }
  return value;
};

const backupRows = (payload: ImportPayload, name: BackupCollection): Row[] => {
  const source = name === "payments"
    ? payload.payment_confirmations ?? payload.paymentConfirmations ?? payload.payments
    : payload[name];
  if (source == null) return [];
  if (!Array.isArray(source)) throw new ApiError(400, `A lista ${name} do backup é inválida.`);
  const entries = source.map((item, index) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new ApiError(400, `O registro ${index + 1} de ${name} é inválido.`);
    }
    const value = item as Record<string, unknown>;
    const id = name === "payments"
      ? value.payment_date ?? value.paymentDate ?? value.id
      : value.id ?? (name === "kodland_groups" ? value.external_id : undefined);
    if (typeof id !== "string" || !id.trim() || id.includes("/")) {
      throw new ApiError(400, `O registro ${index + 1} de ${name} não tem identificador válido.`);
    }
    const normalized = name === "classes" ? normalizeClass(value)
      : name === "lessons" ? normalizeLesson(value)
      : name === "payments" ? normalizePayment(value)
      : name.startsWith("kodland_") && ["kodland_groups", "kodland_students", "kodland_reviews", "kodland_lessons", "kodland_extra_lessons", "kodland_availability"].includes(name)
        ? normalizePedagogicalRow(value, name as PedagogicalCollection)
        : {};
    return firestorePayload({ ...value, ...normalized, id: String(id),
      created_at: String(value.created_at ?? value.createdAt ?? now()) }) as Row;
  });
  return uniqueBy(entries, (item) => item.id);
};

const backupFinance = (payload: ImportPayload): Row | null => {
  const source = payload.teaching_settings;
  if (source == null) return null;
  const finance = Array.isArray(source)
    ? source.find((item) => item && typeof item === "object" && item.id === "finance")
    : source;
  if (!finance || typeof finance !== "object" || Array.isArray(finance)) {
    throw new ApiError(400, "A configuração financeira do backup é inválida.");
  }
  return firestorePayload({ ...(finance as Record<string, unknown>), id: "finance",
    created_at: String((finance as Record<string, unknown>).created_at ?? now()) }) as Row;
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
  get: async () => {
    const [legacyClasses, manualClasses, settings, kodlandSettings,
      lessons, payments, groups, kodlandLessons, extras, overrides, holidays] = await Promise.all([
      rows("classes"), rows("manual_classes"),
      getDoc(doc(ref("teaching_settings"), "finance")),
      rows("kodland_class_settings"),
      rows("lessons"), rows("payments"), rows("kodland_groups"),
      rows("kodland_lessons"), rows("kodland_extra_lessons"),
      rows("kodland_financial_overrides"), rows("holidays"),
    ]);
    const today = isoToday();
    const calculate = (confirmations: Row[]) => dashboardFrom(
      [...legacyClasses, ...manualClasses], lessons, confirmations,
      groups, kodlandLessons, today, extras, overrides,
      holidays as unknown as CustomHoliday[],
      rateHistory(settings.data()?.rate_history),
      kodlandSettings,
    );
    const initial = calculate(payments);
    const migrated = await backfillReceivedSnapshots(payments, initial);
    return migrated === payments ? initial : calculate(migrated);
  },
};
export const holidaysApi = {
  list: async (): Promise<CustomHoliday[]> =>
    (await rows("holidays"))
      .filter((item) => item.source === "CUSTOM")
      .map((item) => ({
        id: String(item.id),
        date: String(item.date),
        name: String(item.name),
        source: "CUSTOM" as const,
        affects_financial_total: true as const,
        created_at: String(item.created_at),
        updated_at: String(item.updated_at ?? item.created_at),
      })),
  save: async ({ date, name }: CustomHolidayPayload): Promise<CustomHoliday> => {
    const id = customHolidayDocumentId(date);
    const normalizedName = name.trim().slice(0, 120);
    if (!normalizedName) throw new ApiError(400, "Informe o nome do feriado.");
    const existing = await getDoc(doc(ref("holidays"), id));
    const existingData = existing.data();
    const createdAt = existing.exists()
      ? String(existingData?.created_at ?? now())
      : now();
    const record: CustomHoliday = {
      id,
      date,
      name: normalizedName,
      source: "CUSTOM",
      affects_financial_total: true,
      created_at: createdAt,
      updated_at: now(),
    };
    await setDoc(doc(ref("holidays"), id), record);
    return record;
  },
  remove: async (date: string) => {
    const id = customHolidayDocumentId(date);
    await deleteDoc(doc(ref("holidays"), id));
  },
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
const validRate = (value: number) => {
  if (!Number.isInteger(value) || value <= 0) {
    throw new ApiError(400, "Informe um valor por hora maior que zero.");
  }
};
const nextRatePeriod = (hourlyRateCents: number | null): RatePeriod => {
  const local = saoPauloLocalTimestamp();
  return {
    effective_from: local.slice(0, 10),
    effective_from_local: local,
    hourly_rate_cents: hourlyRateCents,
  };
};
export const teachingSettingsApi = {
  get: async (): Promise<{ rate_history: RatePeriod[]; default_hourly_rate_cents: number | null }> => {
    const snapshot = await getDoc(doc(ref("teaching_settings"), "finance"));
    const history = rateHistory(snapshot.data()?.rate_history);
    return {
      rate_history: history,
      default_hourly_rate_cents: history.at(-1)?.hourly_rate_cents ?? null,
    };
  },
  setDefaultRate: async (hourlyRateCents: number) => {
    validRate(hourlyRateCents);
    await dashboardApi.get();
    const existing = await teachingSettingsApi.get();
    const rate_history = [...existing.rate_history, nextRatePeriod(hourlyRateCents)];
    await setDoc(doc(ref("teaching_settings"), "finance"), {
      rate_history,
      updated_at: now(),
      created_at: now(),
    });
    return { rate_history, default_hourly_rate_cents: hourlyRateCents };
  },
};
export const manualTeachingApi = {
  groups: async (): Promise<ManualClassGroup[]> =>
    ((await rows("manual_class_groups")) as unknown as ManualClassGroup[])
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name)),
  students: async (): Promise<ManualStudent[]> =>
    (await rows("manual_students")) as unknown as ManualStudent[],
  saveStudent: async (payload: { id?: string; name: string; email?: string; phone?: string; active?: boolean }): Promise<ManualStudent> => {
    if (!payload.name.trim()) throw new ApiError(400, "Informe o nome do aluno.");
    const id = payload.id || crypto.randomUUID();
    const previous = await getDoc(doc(ref("manual_students"), id));
    const record: ManualStudent = {
      id,
      name: payload.name.trim(),
      email: payload.email?.trim() ?? "",
      phone: payload.phone?.trim() ?? "",
      active: payload.active ?? true,
      created_at: String(previous.data()?.created_at ?? now()),
      updated_at: now(),
    };
    await setDoc(doc(ref("manual_students"), id), record);
    return record;
  },
  deactivateStudent: async (id: string) => {
    const snapshot = await getDoc(doc(ref("manual_students"), id));
    if (!snapshot.exists()) throw new ApiError(404, "Aluno não encontrado.");
    await updateDoc(doc(ref("manual_students"), id), { active: false, updated_at: now() });
  },
  saveGroup: async (payload: ManualClassGroupInput): Promise<ManualClassGroup> => {
    if (!payload.name.trim()) throw new ApiError(400, "Informe o nome do grupo.");
    if (payload.order != null && (!Number.isInteger(payload.order) || payload.order < 0)) {
      throw new ApiError(400, "Informe uma ordem de grupo válida.");
    }
    const id = payload.id || crypto.randomUUID();
    const reference = doc(ref("manual_class_groups"), id);
    const snapshot = await getDoc(reference);
    if (payload.id && !snapshot.exists()) throw new ApiError(404, "Grupo não encontrado.");
    const previous = snapshot.data() as ManualClassGroup | undefined;
    const order = payload.order ?? previous?.order ?? (await manualTeachingApi.groups()).length;
    const record: ManualClassGroup = {
      id,
      name: payload.name.trim(),
      order,
      active: payload.active ?? previous?.active ?? true,
      created_at: previous?.created_at ?? now(),
      updated_at: now(),
    };
    await setDoc(reference, record);
    return record;
  },
  deleteGroup: async (id: string) => {
    const reference = doc(ref("manual_class_groups"), id);
    const [snapshot, classrooms] = await Promise.all([
      getDoc(reference), manualTeachingApi.classes(),
    ]);
    if (!snapshot.exists()) throw new ApiError(404, "Grupo não encontrado.");
    if (classrooms.some((item) => item.group_id === id)) {
      throw new ApiError(409, "Mova as turmas deste grupo antes de excluí-lo.");
    }
    await deleteDoc(reference);
  },
  classes: async (): Promise<ManualClass[]> =>
    (await rows("manual_classes")) as unknown as ManualClass[],
  saveClass: async (payload: ManualClassInput & { id?: string }): Promise<ManualClass> => {
    if (payload.id) await dashboardApi.get();
    const [settings, students] = await Promise.all([
      teachingSettingsApi.get(), manualTeachingApi.students(),
    ]);
    validateManualClassInput(payload, settings.default_hourly_rate_cents != null);
    const validStudentIds = new Set(students.filter((student) => student.active).map((student) => student.id));
    if (payload.student_ids.some((id) => !validStudentIds.has(id))) {
      throw new ApiError(400, "Selecione alunos próprios ativos.");
    }
    const id = payload.id || crypto.randomUUID();
    const snapshot = payload.id ? await getDoc(doc(ref("manual_classes"), id)) : null;
    if (payload.id && !snapshot?.exists()) throw new ApiError(404, "Turma não encontrada.");
    const previous = snapshot?.data() as ManualClass | undefined;
    const groupId = payload.group_id ?? previous?.group_id ?? null;
    if (!previous && !groupId) {
      throw new ApiError(400, "Selecione ou crie um grupo para a nova turma.");
    }
    if (groupId) {
      const groupSnapshot = await getDoc(doc(ref("manual_class_groups"), groupId));
      const group = groupSnapshot.data() as ManualClassGroup | undefined;
      if (!groupSnapshot.exists() || !group) throw new ApiError(400, "O grupo selecionado não existe.");
      if (group.active === false && previous?.group_id !== groupId) {
        throw new ApiError(400, "Não é possível adicionar uma turma a um grupo desativado.");
      }
    }
    const today = isoToday();
    const schedule_slots = previous
      ? reconcileWeeklySlots(previous.schedule_slots ?? [], payload.schedule_slots, today)
      : payload.schedule_slots.map((slot) => ({
          ...slot, effective_from: payload.first_lesson_date,
        }));
    const changedRate = previous &&
      (previous.rate_history?.at(-1)?.hourly_rate_cents ?? null) !== payload.hourly_rate_cents;
    const rate_history: RatePeriod[] = previous
      ? [...(previous.rate_history ?? []), ...(changedRate ? [nextRatePeriod(payload.hourly_rate_cents)] : [])]
      : payload.hourly_rate_cents == null ? [] : [{
          effective_from: payload.first_lesson_date,
          hourly_rate_cents: payload.hourly_rate_cents,
        }];
    const record: ManualClass = {
      id,
      source: "manual",
      group_id: groupId,
      name: payload.name.trim(),
      first_lesson_date: previous?.first_lesson_date ?? payload.first_lesson_date,
      end_date: previous?.end_date && previous.end_date < today
        ? previous.end_date : payload.end_date || null,
      schedule_slots,
      hourly_rate_cents: null,
      rate_history,
      initial_default_rate_cents: previous?.initial_default_rate_cents ?? settings.default_hourly_rate_cents,
      payment_day: payload.payment_day,
      payment_day_history: previous
        ? [...(previous.payment_day_history ?? [{ effective_from: previous.first_lesson_date, payment_day: previous.payment_day ?? 15 }]),
            ...(previous.payment_day === payload.payment_day ? [] : [{ effective_from: tomorrowCivilDate(today), payment_day: payload.payment_day }])]
        : [{ effective_from: payload.first_lesson_date, payment_day: payload.payment_day }],
      student_ids: [...new Set(payload.student_ids)],
      active: previous?.active ?? true,
      created_at: previous?.created_at ?? now(),
      updated_at: now(),
    };
    await setDoc(doc(ref("manual_classes"), id), record);
    return record;
  },
  deactivateClass: async (id: string) => {
    const snapshot = await getDoc(doc(ref("manual_classes"), id));
    if (!snapshot.exists()) throw new ApiError(404, "Turma não encontrada.");
    const current = snapshot.data() as ManualClass;
    await updateDoc(doc(ref("manual_classes"), id), {
      active: false,
      end_date: isoToday(),
      updated_at: now(),
      schedule_slots: (current.schedule_slots ?? []).map((slot) =>
        slot.effective_until && slot.effective_until < isoToday()
          ? slot : { ...slot, effective_until: isoToday() }),
    });
  },
};
export const manualPedagogyApi = {
  lessons: async (): Promise<ManualLessonContent[]> =>
    (await rows("manual_lesson_content")) as unknown as ManualLessonContent[],
  activities: async (): Promise<ManualActivity[]> =>
    (await rows("manual_activities")) as unknown as ManualActivity[],
  saveLesson: async (input: {
    id?: string; class_id: string; occurrence_id?: string | null;
    title: string; content?: string; guide?: string;
    links?: { label: string; url: string }[];
  }): Promise<ManualLessonContent> => {
    const ownClass = (await manualTeachingApi.classes()).find((item) => item.id === input.class_id);
    if (!ownClass) throw new ApiError(404, "Turma própria não encontrada.");
    if (!input.title.trim()) throw new ApiError(400, "Informe o título da aula.");
    if (input.occurrence_id) {
      const date = input.occurrence_id.split(":").at(-1) ?? "";
      let valid = false;
      try { valid = generateRecurringOccurrences(ownClass, date, date).some((item) => item.id === input.occurrence_id); }
      catch { /* invalid civil date */ }
      if (!valid) throw new ApiError(400, "Ocorrência incompatível com a turma.");
    }
    const links = (input.links ?? []).map((item) => ({ label: item.label.trim(), url: item.url.trim() }));
    if (links.some((item) => !item.label || !isHttpUrl(item.url))) {
      throw new ApiError(400, "Informe nome e endereço http(s) válido para cada link.");
    }
    const id = input.id || crypto.randomUUID();
    const reference = doc(ref("manual_lesson_content"), id);
    const previous = await getDoc(reference);
    if (input.id && (!previous.exists() || previous.data()?.class_id !== ownClass.id)) {
      throw new ApiError(404, "Aula própria não encontrada.");
    }
    const record: ManualLessonContent = {
      id, class_id: ownClass.id, occurrence_id: input.occurrence_id || null,
      title: input.title.trim(), content: input.content?.trim() ?? "",
      guide: input.guide?.trim() ?? "", links,
      created_at: String(previous.data()?.created_at ?? now()), updated_at: now(),
    };
    await setDoc(reference, record);
    return record;
  },
  saveActivity: async (input: {
    id?: string; class_id: string; student_id: string; occurrence_id: string;
    title: string; description?: string; submission_text?: string;
    submission_url?: string; feedback?: string; status?: "pending" | "completed";
  }): Promise<ManualActivity> => {
    const [ownClass, students] = await Promise.all([
      manualTeachingApi.classes().then((items) => items.find((item) => item.id === input.class_id)),
      manualTeachingApi.students(),
    ]);
    if (!ownClass) throw new ApiError(404, "Turma própria não encontrada.");
    if (!ownClass.student_ids.includes(input.student_id) || !students.some((item) => item.id === input.student_id)) {
      throw new ApiError(400, "Selecione um aluno desta turma.");
    }
    const occurrenceDate = input.occurrence_id.split(":").at(-1) ?? "";
    let validOccurrence = false;
    try { validOccurrence = generateRecurringOccurrences(ownClass, occurrenceDate, occurrenceDate)
      .some((item) => item.id === input.occurrence_id); }
    catch { /* invalid civil date */ }
    if (!validOccurrence) throw new ApiError(400, "Selecione uma ocorrência desta turma.");
    if (!input.title.trim()) throw new ApiError(400, "Informe a atividade.");
    if (input.submission_url?.trim() && !isHttpUrl(input.submission_url.trim())) {
      throw new ApiError(400, "Informe um link de entrega http(s) válido.");
    }
    const id = input.id || crypto.randomUUID();
    const reference = doc(ref("manual_activities"), id);
    const previous = await getDoc(reference);
    if (input.id && (!previous.exists() || previous.data()?.class_id !== ownClass.id)) {
      throw new ApiError(404, "Atividade própria não encontrada.");
    }
    const record: ManualActivity = {
      id, class_id: ownClass.id, student_id: input.student_id,
      occurrence_id: input.occurrence_id, title: input.title.trim(),
      description: input.description?.trim() ?? "", submission_text: input.submission_text?.trim() ?? "",
      submission_url: input.submission_url?.trim() ?? "", feedback: input.feedback?.trim() ?? "",
      status: input.status ?? "pending",
      created_at: String(previous.data()?.created_at ?? now()), updated_at: now(),
    };
    await setDoc(reference, record);
    return record;
  },
};
export const kodlandClassSettingsApi = {
  list: async (): Promise<KodlandClassSettings[]> =>
    (await rows("kodland_class_settings")) as unknown as KodlandClassSettings[],
  save: async (externalId: string, input: { hourly_rate_cents: number | null; payment_day: number }) => {
    await dashboardApi.get();
    const group = (await rows("kodland_groups")).find((item) => String(item.external_id) === externalId);
    if (!group) throw new ApiError(404, "Turma Kodland não encontrada.");
    if (!Number.isInteger(input.payment_day) || input.payment_day < 1 || input.payment_day > 31) {
      throw new ApiError(400, "O dia de recebimento deve estar entre 1 e 31.");
    }
    if (input.hourly_rate_cents != null) validRate(input.hourly_rate_cents);
    const reference = doc(ref("kodland_class_settings"), externalId);
    const snapshot = await getDoc(reference);
    const previous = snapshot.data();
    const history = rateHistory(previous?.rate_history);
    const latest = history.length ? history.at(-1)?.hourly_rate_cents : null;
    const record: KodlandClassSettings = {
      id: externalId,
      rate_history: latest === input.hourly_rate_cents
        ? history : [...history, nextRatePeriod(input.hourly_rate_cents)],
      payment_day: input.payment_day,
      payment_day_history: [
        ...((previous?.payment_day_history ?? []) as PaymentDayPeriod[]),
        ...(Number(previous?.payment_day ?? 15) === input.payment_day ? []
          : [{ effective_from: tomorrowCivilDate(isoToday()), payment_day: input.payment_day }]),
      ],
      created_at: String(previous?.created_at ?? now()),
      updated_at: now(),
    };
    await setDoc(reference, record);
    return record;
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
    const receivedAt = now();
    const snapshot: DashboardPayment = {
      ...payment,
      status: "RECEIVED",
      lessons: payment.lessons.map((lesson) => ({ ...lesson })),
    };
    await setDoc(doc(ref("payments"), date), {
      payment_date: date,
      status: "RECEIVED",
      received_at: receivedAt,
      note,
      payment_snapshot: firestorePayload(snapshot),
      created_at: receivedAt,
    });
    return {
      payment: snapshot,
      received_at: receivedAt,
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
    status: "" | FinancialOverrideStatus,
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
  scheduleLastUpdatedAt: async (): Promise<string | null> => {
    const status = await getDoc(doc(ref("sync_status"), "schedule"));
    const completedAt = status.data()?.completed_at;
    return typeof completedAt === "string" && !Number.isNaN(Date.parse(completedAt))
      ? completedAt
      : null;
  },
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
      const completedAt = now();
      await setDoc(syncStatusRef, {
        status: "complete",
        sync_id: syncId,
        mode,
        completed_at: completedAt,
      });
      if (mode === "schedule" || mode === "essential") {
        await setDoc(doc(syncCollection("sync_status"), "schedule"), {
          completed_at: completedAt,
        });
      }
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
          shouldDeleteStaleExtra(
            item,
            incomingExtraIds,
            snapshot.extra_lessons_complete === true,
          ) && !extraLessons.some((incoming) => samePersistedExtra(item, incoming)),
        )
        .forEach((item) =>
          deletes.push((batch) =>
            batch.delete(doc(syncCollection("kodland_extra_lessons"), String(item.id))),
          ),
        );
      const updatedExtraIds = new Set<string>();
      extraLessons.forEach((item) => {
        const previous = oldExtraLessons.find((lesson) =>
          samePersistedExtra(lesson, item),
        );
        const documentId = String(previous?.id ?? item.id);
        if (updatedExtraIds.has(documentId)) return;
        updatedExtraIds.add(documentId);
        const previousManualStatus = previous?.manual_status as
          | KodlandExtraManualStatus
          | undefined;
        const syncState = reconcileExtraSyncState(
          previousManualStatus,
          item.completed,
          snapshot.extra_lessons_complete === true,
        );
        upserts.push((batch) => batch.set(doc(syncCollection("kodland_extra_lessons"), documentId), firestorePayload({
          ...item,
          id: documentId,
          ...syncState,
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
    const lessons = (await rows("kodland_lessons")) as unknown as KodlandLesson[];
    const pendingLessons = lessons
      .filter((lesson): lesson is KodlandLesson & { source_lesson_id: string } =>
        Boolean(lesson.external_class_id && lesson.source_lesson_id) &&
        lesson.materials_status !== "ready" &&
        lesson.materials_status !== "empty" &&
        !hasKodlandMaterials(lesson),
      )
      .sort((left, right) =>
        String(left.source_lesson_id).localeCompare(String(right.source_lesson_id)) ||
        String(left.external_class_id).localeCompare(String(right.external_class_id)),
      );
    const materialLessons = uniqueBy(pendingLessons, (lesson) => materialKey({
      group_id: lesson.external_class_id,
      source_lesson_id: lesson.source_lesson_id,
    }));
    const lessonsByMaterial = new Map(
      materialLessons.map((lesson) => [materialKey({
        group_id: lesson.external_class_id,
        source_lesson_id: lesson.source_lesson_id,
      }), lesson]),
    );
    let materialCount = 0;
    for (let index = 0; index < materialLessons.length; index += KODLAND_MATERIAL_BATCH_SIZE) {
      const batch = materialLessons.slice(index, index + KODLAND_MATERIAL_BATCH_SIZE);
      const end = Math.min(index + batch.length, materialLessons.length);
      onProgress?.(`Atualizando materiais: ${index + 1}â€“${end} de ${materialLessons.length} aula(s)â€¦`);
      const materials = await requestKodlandMaterials(
        username,
        password,
        batch.map((lesson) => ({
          group_id: lesson.external_class_id,
          source_lesson_id: lesson.source_lesson_id,
        })),
      );
      const writes: Array<(batch: FirebaseWriteBatch) => void> = [];
      materials.forEach((material) => {
        const lesson = lessonsByMaterial.get(materialKey(material));
        if (!lesson) return;
        const updates = mergeLoadedKodlandMaterials(lesson, material);
        writes.push((firestoreBatch) => firestoreBatch.update(
          doc(ref("kodland_lessons"), lesson.id),
          firestorePayload({ ...updates, updated_at: now() }),
        ));
      });
      await commitWrites(writes);
      materialCount += writes.length;
    }
    return {
      ...core,
      review_count: reviewCount,
      material_count: materialCount,
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
    try {
      const [material] = await requestKodlandMaterials(username, password, [{
        group_id: lesson.external_class_id,
        source_lesson_id: lesson.source_lesson_id,
      }]);
      if (!material || material.group_id !== lesson.external_class_id ||
          material.source_lesson_id !== lesson.source_lesson_id) {
        throw new Error("O servidor retornou materiais de outra aula. Tente novamente.");
      }
      const updates = mergeLoadedKodlandMaterials(current, material);
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
  export: async (): Promise<DataExport> => {
    const dashboard = await dashboardApi.get();
    const collections = await Promise.all(backupCollectionNames.map((name) => allRows(name)));
    const contents = Object.fromEntries(backupCollectionNames.map((name, index) => [name, collections[index]]));
    const finance = await getDoc(doc(ref("teaching_settings"), "finance"));
    return {
      schema_version: "2.0",
      exported_at: now(),
      user: await authApi.me(),
      ...contents,
      classes: contents.classes,
      lessons: contents.lessons,
      payment_confirmations: contents.payments.map((item) => {
        const displayed = dashboard.payments.find((payment) => payment.payment_date === item.payment_date);
        return paymentWasReceived(item) && !confirmedSnapshot(item) && displayed
          ? { ...item, payment_snapshot: { ...displayed, status: "RECEIVED" } }
          : item;
      }),
      manual_students: contents.manual_students,
      manual_class_groups: contents.manual_class_groups,
      manual_classes: contents.manual_classes,
      manual_lesson_content: contents.manual_lesson_content,
      manual_activities: contents.manual_activities,
      teaching_settings: finance.exists() ? { ...finance.data(), id: "finance" } : null,
      kodland_class_settings: contents.kodland_class_settings,
      kodland_financial_overrides: contents.kodland_financial_overrides,
      holidays: contents.holidays,
      lesson_notes: contents.lesson_notes,
      tutorials: contents.tutorials,
    };
  },
  previewImport: async (payload: unknown): Promise<ImportReport> => {
    const value = backupPayload(payload);
    const collections = Object.fromEntries(backupCollectionNames.map((name) => [name, backupRows(value, name)])) as Record<BackupCollection, Row[]>;
    backupFinance(value);
    const exportId = String(
      value.export_id ??
        value.exportId ??
        value.exported_at ??
        value.exportedAt ??
        crypto.randomUUID(),
    );
    const imported = await getDoc(doc(ref("imports"), exportId));
    return {
      export_id: exportId,
      already_imported: imported.exists(),
      class_count: collections.classes.length,
      lesson_count: collections.lessons.length,
      payment_confirmation_count: collections.payments.length,
      total_cents: collections.lessons.reduce((total, lesson) => total + cents(lesson), 0),
      imported_at: imported.data()?.imported_at
        ? String(imported.data()?.imported_at)
        : null,
      pedagogical_group_count: collections.kodland_groups.length,
      pedagogical_student_count: collections.kodland_students.length,
      pedagogical_review_count: collections.kodland_reviews.length,
      pedagogical_lesson_count: collections.kodland_lessons.length,
      manual_student_count: collections.manual_students.length,
      manual_class_group_count: collections.manual_class_groups.length,
      manual_class_count: collections.manual_classes.length,
      manual_lesson_count: collections.manual_lesson_content.length,
      manual_activity_count: collections.manual_activities.length,
    };
  },
  import: async (payload: unknown): Promise<ImportReport> => {
    const value = backupPayload(payload);
    const preview = await dataApi.previewImport(value);
    if (preview.already_imported) return preview;
    const writes = backupCollectionNames.flatMap((name) => backupRows(value, name).map((item) =>
      (batch: FirebaseWriteBatch) => batch.set(doc(ref(name), item.id), item, { merge: true }),
    ));
    const finance = backupFinance(value);
    if (finance) writes.push((batch) =>
      batch.set(doc(ref("teaching_settings"), "finance"), finance, { merge: true }));
    await commitWrites(writes);
    const importedAt = now();
    await setDoc(doc(ref("imports"), preview.export_id), {
      imported_at: importedAt,
      created_at: importedAt,
      schema_version: value.schema_version,
    });
    return { ...preview, imported_at: importedAt };
  },
  reset: async (password: string) => {
    if (!password) throw new ApiError(400, "Informe sua senha para confirmar.");
    await reauthenticateWithFirebase(password);
    const names: string[] = [...backupCollectionNames, "imports", "teaching_settings", "sync_status"];
    const collections = await Promise.all(names.map((name) => allRows(name)));
    await commitWrites(names.flatMap((name, index) => collections[index].map((item) =>
      (batch: FirebaseWriteBatch) => batch.delete(doc(ref(name), String(item.id))),
    )));
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
  reconcileExtraSyncState,
  samePersistedExtra,
  shouldDeleteStaleExtra,
};
