import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, updateDoc, writeBatch } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { reauthenticateWithFirebase } from "@/lib/firebase-auth";

export type User = { id: string; name: string; email: string };
export type DashboardLesson = { id: string; class_id: string | null; class_name_snapshot: string; number: number; lesson_date: string; student: string; type: string; duration_minutes: number; hourly_rate_cents: number; period: string; payment_date: string; value_cents: number; status: string };
export type DashboardPayment = { payment_date: string; period: string; lesson_count: number; normal_count: number; extra_count: number; normal_total_cents: number; extra_total_cents: number; total_cents: number; status: string; lessons: DashboardLesson[] };
export type DashboardProgress = { class_id: string; name: string; lesson_count: number; completed: number; remaining: number; percent: number };
export type DashboardResponse = { today: string; earned_cents: number; received_cents: number; normal_lessons: number; extra_lessons: number; normal_earned_cents: number; extra_earned_cents: number; planned_cents: number; future_lessons: number; total_planned_cents: number; total_lessons: number; last_payment: DashboardPayment | null; next_payment: DashboardPayment | null; payments: DashboardPayment[]; progress: DashboardProgress[] };
export type ClassRecord = { id: string; name: string; week_day: number; start_time: string; first_lesson_date: string; lesson_count: number; duration_minutes: number; hourly_rate_cents: number; active: boolean };
export type ClassPayload = Omit<ClassRecord, "id" | "active">;
export type Lesson = DashboardLesson & { active: boolean; canceled: boolean; note: string };
export type LessonList = { items: Lesson[]; total: number; page: number; page_size: number };
export type ExtraLessonPayload = { student: string; lesson_date: string; duration_minutes: number; hourly_rate_cents: number; note: string };
export type LessonFilters = { type?: "NORMAL" | "EXTRA"; status?: "ACTIVE" | "CANCELED" | "COMPLETED" | "FUTURE"; from?: string; to?: string; page?: number; page_size?: number };
export type PaymentDetail = DashboardPayment & { received_at: string | null; confirmation_note: string | null };
export type ImportReport = { export_id: string; already_imported: boolean; class_count: number; lesson_count: number; payment_confirmation_count: number; total_cents: number; imported_at: string | null };
export type DataExport = { schema_version: "1.0"; exported_at: string; user: User; classes: unknown[]; lessons: unknown[]; payment_confirmations: unknown[] };
export type KodlandGroup = { id: string; external_id: string; title: string; course_name: string; student_count: number; start_date: string; next_lesson_date: string; archived: boolean; local_class_id: string | null; created_at: string };
export type KodlandStudent = { id: string; external_id: string; name: string; email: string; phone: string; status: string; progress_summary: string; profile_url: string; external_class_id: string; external_class_name: string; local_note: string; hidden: boolean; created_at: string };
export type KodlandReview = { id: string; external_class_id: string; external_class_name: string; external_student_id: string; student_name: string; lesson_id: string; lesson_number: number; lesson_title: string; module_number: string; task_id: string; task_number: number; task_title: string; status_key: string; status_label: string; correction_url: string; created_at: string };
type KodlandSnapshot = { groups: Omit<KodlandGroup, "id" | "local_class_id" | "created_at">[]; students: Omit<KodlandStudent, "local_note" | "hidden" | "created_at">[]; reviews: Omit<KodlandReview, "created_at">[] };
export class ApiError extends Error { constructor(public readonly status: number, message: string) { super(message); } }

type Row = { id: string } & Record<string, unknown>;
type ImportPayload = Record<string, unknown>;

const authUser = () => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new ApiError(401, "Faça login para continuar.");
  return user;
};
const userRoot = () => `users/${authUser().uid}`;
const ref = (name: string) => collection(getFirebaseDb(), `${userRoot()}/${name}`);
const rows = async (name: string): Promise<Row[]> => (await getDocs(query(ref(name), orderBy("created_at")))).docs.map((item) => ({ ...(item.data() as Row), id: item.id }));
const isoToday = () => new Date().toISOString().slice(0, 10);
const now = () => new Date().toISOString();
const paymentDate = (value: string) => { const d = new Date(`${value}T00:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1, 15); return d.toISOString().slice(0, 10); };
const period = (value: string) => `${value.slice(5, 7)}/${value.slice(0, 4)}`;
const cents = (row: Row) => Math.round(Number(row.duration_minutes ?? 0) * Number(row.hourly_rate_cents ?? 0) / 60);
const asLesson = (row: Row, today = isoToday()): Lesson => {
  const date = String(row.lesson_date);
  const canceled = Boolean(row.canceled);
  const active = row.active !== false;
  const status = !active || canceled ? "CANCELED" : date <= today ? "COMPLETED" : "FUTURE";
  return { id: String(row.id), class_id: row.class_id ? String(row.class_id) : null, class_name_snapshot: String(row.class_name_snapshot ?? ""), number: Number(row.number ?? 1), lesson_date: date, student: String(row.student ?? ""), type: String(row.type ?? "NORMAL"), duration_minutes: Number(row.duration_minutes ?? 0), hourly_rate_cents: Number(row.hourly_rate_cents ?? 0), active, canceled, note: String(row.note ?? ""), period: period(date), payment_date: paymentDate(date), value_cents: cents(row), status };
};
const dashboardFrom = (classRows: Row[], lessonRows: Row[], confirmations: Row[], today = isoToday()): DashboardResponse => {
  const lessons = lessonRows.map((row) => asLesson(row, today));
  const billable = lessons.filter((item) => item.active && !item.canceled);
  const groups = new Map<string, Lesson[]>();
  billable.forEach((item) => groups.set(item.payment_date, [...(groups.get(item.payment_date) ?? []), item]));
  const payments = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, group]) => {
    const normal = group.filter((item) => item.type === "NORMAL");
    const extra = group.filter((item) => item.type === "EXTRA");
    const received = confirmations.some((item) => String(item.payment_date) === date);
    return { payment_date: date, period: period(group[0].lesson_date), lesson_count: group.length, normal_count: normal.length, extra_count: extra.length, normal_total_cents: normal.reduce((sum, item) => sum + item.value_cents, 0), extra_total_cents: extra.reduce((sum, item) => sum + item.value_cents, 0), total_cents: group.reduce((sum, item) => sum + item.value_cents, 0), status: received ? "RECEIVED" : date < today ? "OVERDUE" : date === today ? "DUE_TODAY" : "FUTURE", lessons: group };
  });
  const completed = billable.filter((item) => item.lesson_date <= today);
  const future = billable.filter((item) => item.lesson_date > today);
  const received = payments.filter((item) => item.payment_date <= today || item.status === "RECEIVED").reduce((sum, item) => sum + item.total_cents, 0);
  const activeClasses = classRows.filter((item) => item.active !== false);
  return { today, earned_cents: completed.reduce((sum, item) => sum + item.value_cents, 0), received_cents: received, normal_lessons: completed.filter((item) => item.type === "NORMAL").length, extra_lessons: completed.filter((item) => item.type === "EXTRA").length, normal_earned_cents: completed.filter((item) => item.type === "NORMAL").reduce((sum, item) => sum + item.value_cents, 0), extra_earned_cents: completed.filter((item) => item.type === "EXTRA").reduce((sum, item) => sum + item.value_cents, 0), planned_cents: future.reduce((sum, item) => sum + item.value_cents, 0), future_lessons: future.length, total_planned_cents: billable.reduce((sum, item) => sum + item.value_cents, 0), total_lessons: billable.length, last_payment: payments.filter((item) => item.payment_date <= today || item.status === "RECEIVED").at(-1) ?? null, next_payment: payments.find((item) => item.payment_date > today) ?? null, payments, progress: activeClasses.map((item) => { const own = billable.filter((lesson) => lesson.class_id === item.id); const done = own.filter((lesson) => lesson.lesson_date <= today).length; return { class_id: String(item.id), name: String(item.name), lesson_count: own.length, completed: done, remaining: Math.max(own.length - done, 0), percent: own.length ? Math.round(done * 100 / own.length) : 0 }; }) };
};

const lessonsForClass = (id: string, payload: ClassPayload, createdAt = now()) => Array.from({ length: payload.lesson_count }, (_, index) => {
  const date = new Date(`${payload.first_lesson_date}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + index * 7);
  const lessonId = `${id}-lesson-${index + 1}-${date.toISOString().slice(0, 10)}`;
  return { id: lessonId, class_id: id, class_name_snapshot: payload.name, number: index + 1, lesson_date: date.toISOString().slice(0, 10), student: "", type: "NORMAL", duration_minutes: payload.duration_minutes, hourly_rate_cents: payload.hourly_rate_cents, active: true, canceled: false, note: "", created_at: createdAt };
});

const importWeekDay = (value: unknown) => {
  if (typeof value === "number") return value;
  const days: Record<string, number> = { segunda: 0, "terça": 1, terca: 1, quarta: 2, quinta: 3, sexta: 4, "sábado": 5, sabado: 5, domingo: 6 };
  return days[String(value ?? "").toLowerCase()] ?? 0;
};
const toNumber = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const normalizeClass = (value: Record<string, unknown>): Row => ({ id: String(value.id ?? crypto.randomUUID()), name: String(value.name ?? "Turma sem nome"), week_day: importWeekDay(value.week_day ?? value.weekDay), start_time: String(value.start_time ?? value.time ?? "08:00").slice(0, 5), first_lesson_date: String(value.first_lesson_date ?? value.firstLesson ?? isoToday()), lesson_count: toNumber(value.lesson_count ?? value.lessonCount, 1), duration_minutes: Math.round(toNumber(value.duration_minutes ?? (toNumber(value.durationHours, 1) * 60), 60)), hourly_rate_cents: Math.round(toNumber(value.hourly_rate_cents ?? (toNumber(value.hourlyRate, 0) * 100))), active: value.active !== false, created_at: String(value.created_at ?? value.createdAt ?? now()) });
const normalizeLesson = (value: Record<string, unknown>): Row => ({ id: String(value.id ?? crypto.randomUUID()), class_id: value.class_id ?? value.classId ?? null, class_name_snapshot: String(value.class_name_snapshot ?? value.className ?? "Aula extra"), number: toNumber(value.number, 1), lesson_date: String(value.lesson_date ?? value.lessonDate ?? isoToday()), student: String(value.student ?? ""), type: String(value.type ?? "EXTRA").toUpperCase() === "NORMAL" ? "NORMAL" : "EXTRA", duration_minutes: Math.round(toNumber(value.duration_minutes ?? (toNumber(value.durationHours, 1) * 60), 60)), hourly_rate_cents: Math.round(toNumber(value.hourly_rate_cents ?? (toNumber(value.hourlyRate, 0) * 100))), active: value.active !== false, canceled: Boolean(value.canceled), note: String(value.note ?? ""), created_at: String(value.created_at ?? value.createdAt ?? now()) });
const normalizePayment = (value: Record<string, unknown>): Row => ({ id: String(value.payment_date ?? value.paymentDate ?? value.id ?? crypto.randomUUID()), payment_date: String(value.payment_date ?? value.paymentDate ?? ""), received_at: String(value.received_at ?? value.receivedAt ?? now()), note: String(value.note ?? ""), created_at: String(value.created_at ?? value.createdAt ?? now()) });
const importRows = (payload: ImportPayload, name: "classes" | "lessons" | "payments") => {
  const source = name === "payments" ? payload.payment_confirmations ?? payload.paymentConfirmations : payload[name];
  const values = Array.isArray(source) ? source.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  return values.map(name === "classes" ? normalizeClass : name === "lessons" ? normalizeLesson : normalizePayment);
};

export const authApi = { me: async (): Promise<User> => { const user = authUser(); return { id: user.uid, name: user.displayName || user.email?.split("@")[0] || "Professor", email: user.email || "" }; }, login: async () => { throw new ApiError(410, "Use o formulário de login do Firebase."); }, logout: async () => undefined };
export const dashboardApi = { get: async () => dashboardFrom(await rows("classes"), await rows("lessons"), await rows("payments")) };
export const classesApi = {
  list: async (active = true) => { const items = (await rows("classes")).filter((item) => !active || item.active !== false) as unknown as ClassRecord[]; return { items, total: items.length }; },
  create: async (payload: ClassPayload) => { const id = crypto.randomUUID(); const createdAt = now(); const record: ClassRecord & { created_at: string } = { id, ...payload, active: true, created_at: createdAt }; const batch = writeBatch(getFirebaseDb()); batch.set(doc(ref("classes"), id), record); lessonsForClass(id, payload, createdAt).forEach((lesson) => batch.set(doc(ref("lessons"), lesson.id), lesson)); await batch.commit(); return record; },
  update: async (id: string, payload: Partial<ClassPayload>) => { const current = (await rows("classes")).find((item) => item.id === id); if (!current) throw new ApiError(404, "Turma não encontrada."); const next = { ...current, ...payload, id, active: true } as ClassRecord & Row; const currentLessons = (await rows("lessons")).filter((item) => item.class_id === id); const receivedDates = new Set((await rows("payments")).map((item) => String(item.payment_date))); const preserved = currentLessons.filter((lesson) => receivedDates.has(paymentDate(String(lesson.lesson_date)))); const batch = writeBatch(getFirebaseDb()); batch.set(doc(ref("classes"), id), { ...next, created_at: String(current.created_at ?? now()), updated_at: now() }); currentLessons.forEach((lesson) => batch.delete(doc(ref("lessons"), String(lesson.id)))); preserved.forEach((lesson) => batch.set(doc(ref("lessons"), String(lesson.id)), lesson)); lessonsForClass(id, next, now()).filter((lesson) => !receivedDates.has(paymentDate(lesson.lesson_date))).forEach((lesson) => batch.set(doc(ref("lessons"), lesson.id), lesson)); await batch.commit(); return next; },
  deactivate: async (id: string) => { const receivedDates = new Set((await rows("payments")).map((item) => String(item.payment_date))); const classLessons = (await rows("lessons")).filter((item) => item.class_id === id); const batch = writeBatch(getFirebaseDb()); batch.update(doc(ref("classes"), id), { active: false, updated_at: now() }); classLessons.filter((lesson) => !receivedDates.has(paymentDate(String(lesson.lesson_date)))).forEach((lesson) => batch.update(doc(ref("lessons"), String(lesson.id)), { active: false, canceled: true })); await batch.commit(); return { id, active: false }; },
};
export const lessonsApi = {
  list: async (filters: LessonFilters = {}) => { let items = (await rows("lessons")).map((row) => asLesson(row)); if (filters.type) items = items.filter((item) => item.type === filters.type); if (filters.from) items = items.filter((item) => item.lesson_date >= filters.from!); if (filters.to) items = items.filter((item) => item.lesson_date <= filters.to!); if (filters.status === "ACTIVE") items = items.filter((item) => item.status === "COMPLETED" || item.status === "FUTURE"); else if (filters.status) items = items.filter((item) => item.status === filters.status); items.sort((a, b) => b.lesson_date.localeCompare(a.lesson_date)); const page = filters.page ?? 1; const pageSize = filters.page_size ?? 50; return { items: items.slice((page - 1) * pageSize, page * pageSize), total: items.length, page, page_size: pageSize }; },
  createExtra: async (payload: ExtraLessonPayload) => { const id = crypto.randomUUID(); const record = { id, class_id: null, class_name_snapshot: "Aula extra", number: 1, ...payload, type: "EXTRA", active: true, canceled: false, created_at: now() }; await setDoc(doc(ref("lessons"), id), record); return asLesson(record); },
  cancel: async (id: string) => { const item = (await rows("lessons")).find((row) => row.id === id); if (!item) throw new ApiError(404, "Aula não encontrada."); const paymentRows = await rows("payments"); if (paymentRows.some((row) => String(row.payment_date) === paymentDate(String(item.lesson_date)))) throw new ApiError(409, "Aulas de pagamento recebido não podem ser canceladas."); await updateDoc(doc(ref("lessons"), id), { active: false, canceled: true }); return asLesson({ ...item, active: false, canceled: true }); },
};
const paymentDetail = async (date: string): Promise<PaymentDetail> => { const dashboard = await dashboardApi.get(); const payment = dashboard.payments.find((item) => item.payment_date === date); if (!payment) throw new ApiError(404, "Pagamento não encontrado."); const confirmation = (await rows("payments")).find((item) => item.payment_date === date); return { ...payment, received_at: confirmation ? String(confirmation.received_at) : null, confirmation_note: confirmation ? String(confirmation.note ?? "") : null }; };
export const paymentsApi = { list: async () => { const items = (await dashboardApi.get()).payments; return { items, total: items.length }; }, get: paymentDetail, confirm: async (date: string, note = "") => { const payment = await paymentDetail(date); await setDoc(doc(ref("payments"), date), { payment_date: date, received_at: now(), note, created_at: now() }); return { payment: { ...payment, status: "RECEIVED" }, received_at: now(), note }; }, reverse: async (date: string) => { await deleteDoc(doc(ref("payments"), date)); } };
export const kodlandApi = {
  groups: async () => ({ items: (await rows("kodland_groups")) as unknown as KodlandGroup[] }),
  students: async () => ({ items: ((await rows("kodland_students")).filter((item) => !item.hidden) as unknown as KodlandStudent[]) }),
  reviews: async () => ({ items: (await rows("kodland_reviews")) as unknown as KodlandReview[] }),
  sync: async (username: string, password: string) => {
    const token = await (authUser() as unknown as { getIdToken: () => Promise<string> }).getIdToken();
    const response = await fetch("/api/kodland/sync", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ username, password }) });
    const snapshot = await response.json() as KodlandSnapshot & { message?: string };
    if (!response.ok) throw new ApiError(response.status, snapshot.message ?? "Não foi possível sincronizar com a Kodland.");
    const createdAt = now();
    const oldGroups = await rows("kodland_groups");
    const links = new Map(oldGroups.map((item) => [String(item.external_id), item.local_class_id ?? null]));
    const oldReviews = await rows("kodland_reviews");
    const batch = writeBatch(getFirebaseDb());
    oldReviews.forEach((item) => batch.delete(doc(ref("kodland_reviews"), String(item.id))));
    snapshot.groups.forEach((item) => batch.set(doc(ref("kodland_groups"), item.external_id), { ...item, id: item.external_id, local_class_id: links.get(item.external_id) ?? null, created_at: createdAt }));
    snapshot.students.forEach((item) => batch.set(doc(ref("kodland_students"), item.id), { ...item, local_note: "", hidden: false, created_at: createdAt }));
    snapshot.reviews.forEach((item) => batch.set(doc(ref("kodland_reviews"), item.id), { ...item, created_at: createdAt }));
    await batch.commit();
    return { group_count: snapshot.groups.length, student_count: snapshot.students.length, review_count: snapshot.reviews.length };
  },
  linkGroup: async (externalId: string, localClassId: string | null) => { await updateDoc(doc(ref("kodland_groups"), externalId), { local_class_id: localClassId, updated_at: now() }); },
  updateStudent: async (id: string, payload: Partial<Pick<KodlandStudent, "name" | "email" | "phone" | "status" | "profile_url" | "local_note">>) => { await updateDoc(doc(ref("kodland_students"), id), { ...payload, updated_at: now() }); },
  hideStudent: async (id: string) => { await updateDoc(doc(ref("kodland_students"), id), { hidden: true, updated_at: now() }); },
};
export const dataApi = {
  export: async (): Promise<DataExport> => ({ schema_version: "1.0", exported_at: now(), user: await authApi.me(), classes: await rows("classes"), lessons: await rows("lessons"), payment_confirmations: await rows("payments") }),
  previewImport: async (payload: unknown): Promise<ImportReport> => { const value = payload as ImportPayload; const exportId = String(value.export_id ?? value.exportId ?? value.exported_at ?? value.exportedAt ?? crypto.randomUUID()); const imported = await getDoc(doc(ref("imports"), exportId)); const classes = importRows(value, "classes"); const lessons = importRows(value, "lessons"); const payments = importRows(value, "payments"); return { export_id: exportId, already_imported: imported.exists(), class_count: classes.length, lesson_count: lessons.length, payment_confirmation_count: payments.length, total_cents: lessons.reduce((total, lesson) => total + cents(lesson), 0), imported_at: imported.data()?.imported_at ? String(imported.data()?.imported_at) : null }; },
  import: async (payload: unknown): Promise<ImportReport> => { const value = payload as ImportPayload; const preview = await dataApi.previewImport(value); if (preview.already_imported) return preview; const batch = writeBatch(getFirebaseDb()); importRows(value, "classes").forEach((item) => batch.set(doc(ref("classes"), String(item.id)), item)); importRows(value, "lessons").forEach((item) => batch.set(doc(ref("lessons"), String(item.id)), item)); importRows(value, "payments").forEach((item) => batch.set(doc(ref("payments"), String(item.id)), item)); batch.set(doc(ref("imports"), preview.export_id), { imported_at: now(), created_at: now() }); await batch.commit(); return { ...preview, imported_at: now() }; },
  reset: async (password: string) => { if (!password) throw new ApiError(400, "Informe sua senha para confirmar."); await reauthenticateWithFirebase(password); const batch = writeBatch(getFirebaseDb()); for (const name of ["classes", "lessons", "payments", "imports", "kodland_groups", "kodland_students", "kodland_reviews"]) (await rows(name)).forEach((item) => batch.delete(doc(ref(name), String(item.id)))); await batch.commit(); },
};
export const __test = { period, paymentDate, normalizeClass, normalizeLesson, normalizePayment };
