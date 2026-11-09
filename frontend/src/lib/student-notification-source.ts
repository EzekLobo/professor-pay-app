import { kodlandReadPreference } from "./kodland-read-preference";
import { readKodlandLocal } from "./kodland-sync-client";
import { kodlandNotificationCalendar } from "./kodland-notification-calendar";
import { readKodlandBrowser } from "./kodland-browser-cache";
import { kodlandApi, manualOperationsApi, manualPedagogyApi, manualTeachingApi, tutorPreferencesApi, type KodlandAttendance, type KodlandGroup, type KodlandStudent } from "./api";
import { attendanceLessonParts, lessonForAttendance } from "./attendance-schedule";
import type { DemoSnapshot } from "./demo-snapshot";
import type { KodlandLesson } from "./kodland-lessons";
import type { ManualActivity } from "./manual-pedagogy";
import type { ManualAttendance, ManualOccurrence } from "./manual-operations";
import type { ManualClass, ManualStudent } from "./manual-teaching";
import type { KodlandTaskProgress } from "./kodland-task-progress";
import { getFirebaseAuth } from "./firebase";
import { isActiveKodlandStudent } from "./student-ranking";
import { type NotificationCoverage, notificationLocalInstant, type NotificationLesson, type NotificationObligation, type NotificationSettings } from "./student-notification-rules";

export type NotificationSourceSnapshot = {
  manualClasses: ManualClass[]; manualStudents: ManualStudent[]; manualOccurrences: ManualOccurrence[];
  manualAttendance: ManualAttendance[]; manualActivities: ManualActivity[];
  groups: KodlandGroup[]; students: KodlandStudent[]; attendance: KodlandAttendance[]; lessons: KodlandLesson[];
  taskProgress?: KodlandTaskProgress[]; coverage?: NotificationCoverage;
};
export type NotificationSource = { lessonCodes?: Record<string, string>; lessons: NotificationLesson[]; obligations: NotificationObligation[]; warnings: string[]; loaded_at: string; coverage?: NotificationCoverage };
export function normalizeNotificationSource(snapshot: NotificationSourceSnapshot, settings: NotificationSettings): NotificationSource {
  const lessons: NotificationLesson[] = [];
  const obligations: NotificationObligation[] = [];
  const warnings = new Set<string>();
  const zone = settings.time_zone;
  for (const occurrence of snapshot.manualOccurrences) {
    const classroom = snapshot.manualClasses.find(item => item.id === occurrence.class_id);
    if (!classroom?.active) continue;
    const start = notificationLocalInstant(occurrence.lesson_date, occurrence.start_time, zone);
    const end = start && Number.isFinite(occurrence.duration_minutes) && occurrence.duration_minutes > 0 ? new Date(Date.parse(start) + occurrence.duration_minutes * 60000).toISOString() : null;
    for (const student of snapshot.manualStudents.filter(item => item.active && classroom.student_ids.includes(item.id))) {
      const attendance = snapshot.manualAttendance.find(item => item.occurrence_id === occurrence.id && item.student_id === student.id && item.class_id === classroom.id);
      lessons.push({ source: "manual", class_id: classroom.id, class_name: classroom.name, student_id: student.id, student_name: student.name, occurrence_id: occurrence.id, lesson_label: occurrence.course_code || occurrence.title_snapshot || "Aula", lesson_date: occurrence.lesson_date, ended_at: end, active: true, cancelled: occurrence.status === "cancelled" || occurrence.status === "rescheduled", attendance: attendance?.status === "ABSENT" ? "absent" : !attendance || attendance.status === "UNMARKED" ? "unknown" : "other", guardian_name: "", guardian_phone: student.phone ?? "", recording_url: occurrence.recording_url });
    }
  }
  for (const activity of snapshot.manualActivities) {
    const lesson = lessons.find(item => item.source === "manual" && item.class_id === activity.class_id && item.student_id === activity.student_id && item.occurrence_id === activity.occurrence_id);
    if (!lesson) continue;
    const kind = activity.kind ?? "unknown";
    if (kind === "unknown") warnings.add("Há atividades próprias sem classificação. Defina Aula ou Casa para incluí-las nos alertas.");
    if (kind === "homework" && !activity.due_at && settings.homework_days_after_lesson === null) warnings.add("Há atividades de casa sem prazo. Defina um prazo ou uma política de dias nas notificações.");
    const content = Boolean(activity.submission_text?.trim() || activity.submission_url?.trim());
    const delivered = content || ["submitted", "corrected", "completed"].includes(activity.status);
    obligations.push({ id: activity.id, source: "manual", class_id: activity.class_id, student_id: activity.student_id, occurrence_id: activity.occurrence_id, title: activity.title, kind, due_at: activity.due_at ?? null, state: delivered ? "delivered" : activity.status === "assigned" ? "missing" : "unknown", required: activity.required !== false, exempt: activity.exempt === true });
  }
  for (const record of snapshot.attendance) {
    const group = snapshot.groups.find(item => item.external_id === record.external_class_id);
    const student = snapshot.students.find(item => item.external_class_id === record.external_class_id && item.external_id === record.external_student_id);
    if (!group || group.archived || !student || student.hidden || !isActiveKodlandStudent(student.status)) continue;
    const lesson = lessonForAttendance(record, snapshot.lessons);
    const calendar = kodlandNotificationCalendar(record, lesson, snapshot.lessons, group, zone);
    const date = calendar.date;
    const end = calendar.endedAt;
    if (!end) warnings.add("Algumas presenças sincronizadas não têm horário final confiável e ficam fora dos alertas de falta.");
    lessons.push({ source: "kodland", class_id: group.external_id, class_name: group.title, student_id: student.external_id, student_name: student.name, occurrence_id: lesson?.source_lesson_id || lesson?.id || record.lesson_id, lesson_label: lesson?.schedule_code || record.lesson_title || lesson?.title || "Aula", lesson_date: date, ended_at: end, active: true, cancelled: /cancel/i.test(lesson?.status ?? ""), attendance: record.status === "ABSENT" ? "absent" : record.status === "UNKNOWN" ? "unknown" : "other", guardian_name: "", guardian_phone: String(student.phone ?? ""), recording_url: lesson?.recording_url || record.recording_url });
  }
  const taskIdFromUrl = (url: string) => String(url ?? "").match(/\/task\/([^/?#]+)(?:[/?#]|$)/)?.[1] ?? "";
  for (const progress of snapshot.taskProgress ?? []) {
    const group = snapshot.groups.find(item => item.external_id === progress.external_class_id);
    const student = snapshot.students.find(item => item.external_class_id === progress.external_class_id && item.external_id === progress.external_student_id);
    if (!group || group.archived || !student || student.hidden || !isActiveKodlandStudent(student.status)) continue;
    const record: KodlandAttendance = { id: progress.id, external_class_id: group.external_id, external_class_name: group.title, external_student_id: student.external_id, student_name: student.name, lesson_id: progress.lesson_id, lesson_title: "", lesson_date: "", start_time: "", status: "UNKNOWN" };
    const catalog = lessonForAttendance(record, snapshot.lessons);
    let lesson = lessons.find(item => item.source === "kodland" && item.class_id === group.external_id && item.student_id === student.external_id && item.occurrence_id === (catalog?.source_lesson_id || catalog?.id || progress.lesson_id));
    if (!lesson) {
      const calendar = kodlandNotificationCalendar(record, catalog, snapshot.lessons, group, zone);
      const date = calendar.date;
      lesson = { source: "kodland", class_id: group.external_id, class_name: group.title, student_id: student.external_id, student_name: student.name, occurrence_id: catalog?.source_lesson_id || catalog?.id || progress.lesson_id, lesson_label: catalog?.schedule_code || catalog?.title || "Aula", lesson_date: date, ended_at: calendar.endedAt, active: true, cancelled: /cancel/i.test(catalog?.status ?? ""), attendance: "unknown", guardian_name: "", guardian_phone: String(student.phone ?? ""), recording_url: catalog?.recording_url };
      lessons.push(lesson);
    }
    const classroom = catalog?.classroom_tasks?.some(item => taskIdFromUrl(item.url) === progress.task_id) ?? false;
    const homework = Boolean(catalog?.homework_url && taskIdFromUrl(catalog.homework_url) === progress.task_id);
    const kind = classroom === homework ? "unknown" : homework ? "homework" : "classroom";
    if (kind === "unknown") warnings.add("Algumas atividades Kodland ainda não têm classificação Aula/Casa confirmada pelos materiais e ficam fora das cobranças. A regra Nenhuma entregue aguarda classificação completa da aula.");
    if (kind === "homework" && settings.homework_days_after_lesson === null) warnings.add("Atividades Kodland de casa não têm prazo importado: configure dias após a aula para habilitar cobranças.");
    obligations.push({ id: progress.id, source: "kodland", class_id: group.external_id, student_id: student.external_id, occurrence_id: catalog?.source_lesson_id || catalog?.id || progress.lesson_id, title: progress.task_title, kind, due_at: null, state: progress.state === "submitted" || progress.state === "corrected" ? "delivered" : progress.state === "not_graded" ? "unknown" : progress.state, required: true, exempt: false, external_task_id: progress.task_id });
  }
  for (const catalog of snapshot.lessons) {
    const group = snapshot.groups.find(item => item.external_id === catalog.external_class_id && !item.archived);
    const calendar = kodlandNotificationCalendar({ lesson_date: "" }, catalog, snapshot.lessons, group, zone);
    const date = calendar.date;
    const end = calendar.endedAt;
    if (!group || !end) continue;
    const occurrence = catalog.source_lesson_id || catalog.id;
    for (const student of snapshot.students.filter(item => item.external_class_id === group.external_id && !item.hidden && isActiveKodlandStudent(item.status))) {
      if (lessons.some(item => item.source === "kodland" && item.class_id === group.external_id && item.student_id === student.external_id && item.occurrence_id === occurrence)) continue;
      lessons.push({ source: "kodland", class_id: group.external_id, class_name: group.title, student_id: student.external_id, student_name: student.name, occurrence_id: occurrence, lesson_label: catalog.schedule_code || catalog.title || "Aula", lesson_date: date, ended_at: end, active: true, cancelled: /cancel/i.test(catalog.status ?? ""), attendance: "unknown", guardian_name: "", guardian_phone: String(student.phone ?? "") });
    }
  }
  if (snapshot.groups.some(item => !item.archived) && !(snapshot.taskProgress?.length)) warnings.add("Atualize as atividades em Turmas para carregar o progresso das atividades Kodland. A fila de correções sozinha não identifica quem deixou de entregar.");
  for (const lesson of lessons.filter(item => item.source === "kodland")) {
    const catalog = lessonForAttendance({ external_class_id: lesson.class_id, lesson_id: lesson.occurrence_id, lesson_title: lesson.lesson_label, lesson_date: lesson.lesson_date } as KodlandAttendance, snapshot.lessons);
    const inventory = catalog?.classroom_tasks?.map(item => taskIdFromUrl(item.url));
    if (catalog?.materials_status === "ready" && inventory?.every(Boolean)) lesson.classroom_inventory = [...new Set(inventory)];
  }
  const lessonCodes: Record<string, string> = {};
  for (const item of lessons.filter(item => item.source === "kodland")) {
    const parts = attendanceLessonParts({ external_class_id: item.class_id, lesson_id: item.occurrence_id, lesson_title: item.lesson_label } as KodlandAttendance, snapshot.lessons);
    if (parts.module) lessonCodes[`${item.class_id}:${item.occurrence_id}`] = `${parts.module}${parts.lesson}`;
  }
  return { lessons, obligations, lessonCodes, warnings: [...warnings], loaded_at: new Date().toISOString() };
}
const cache = new Map<string, { expires: number; loadedAt: string; promise: Promise<NotificationSourceSnapshot> }>();
type ManualNotificationSnapshot = Pick<NotificationSourceSnapshot, "manualClasses" | "manualStudents" | "manualOccurrences" | "manualAttendance" | "manualActivities">;
const manualCache = new Map<string, { expires: number; promise: Promise<ManualNotificationSnapshot | null> }>();
function loadManualNotificationSource(uid: string, force: boolean) {
  let current = manualCache.get(uid);
  if (force || !current || current.expires <= Date.now()) {
    const promise: Promise<ManualNotificationSnapshot | null> = readKodlandLocal(async () => {
      const [manualClasses, manualStudents, manualOccurrences, manualAttendance, manualActivities] = await Promise.all([manualTeachingApi.classes(), manualTeachingApi.students(), manualOperationsApi.occurrences(), manualOperationsApi.attendance(), manualPedagogyApi.activities()]);
      return { manualClasses, manualStudents, manualOccurrences, manualAttendance, manualActivities };
    }, crypto.randomUUID(), "Dados próprios para notificações", 3000).catch(() => {
      if (manualCache.get(uid)?.promise === promise) manualCache.delete(uid);
      return null;
    });
    current = { expires: Date.now() + 6 * 3600000, promise }; manualCache.set(uid, current);
  }
  return current.promise;
}
export function clearStudentNotificationSourceCache(manual = true) { cache.clear(); if (manual) manualCache.clear(); }
/** Shared source cache: callers must supply the authenticated UID; a failed refresh never becomes an empty successful snapshot. */
export async function loadStudentNotificationSource(uid: string, settings: NotificationSettings, force = false): Promise<NotificationSource> {
  const owner = () => { if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error("Sua conta foi alterada. Entre novamente."); };
  owner();
  const local = await readKodlandBrowser(uid); owner();
  if (local?.active) {
    const preferences = await kodlandReadPreference(() => tutorPreferencesApi.get(), true); owner();
    const enabled = preferences.kodland_enabled;
    const manual = await loadManualNotificationSource(uid, force); owner();
    const attendance = Object.keys(local.attendanceCompletedAt ?? {});
    const activities = Object.keys(local.groupCompletedAt);
    const snapshot: NotificationSourceSnapshot = {
      manualClasses: manual?.manualClasses ?? [], manualStudents: manual?.manualStudents ?? [], manualOccurrences: manual?.manualOccurrences ?? [], manualAttendance: manual?.manualAttendance ?? [], manualActivities: manual?.manualActivities ?? [],
      groups: (enabled ? local.collections.kodland_groups ?? [] : []) as unknown as KodlandGroup[], students: (enabled ? local.collections.kodland_students ?? [] : []) as unknown as KodlandStudent[], lessons: (enabled ? local.collections.kodland_lessons ?? [] : []) as unknown as KodlandLesson[],
      attendance: (enabled ? local.collections.kodland_attendance ?? [] : []).filter(item => attendance.includes(String(item.external_class_id))) as unknown as KodlandAttendance[],
      taskProgress: (enabled ? local.collections.kodland_task_progress ?? [] : []).filter(item => activities.includes(String(item.external_class_id))) as unknown as KodlandTaskProgress[],
    };
    const archived = ((local.collections.kodland_groups ?? []) as unknown as KodlandGroup[]).filter(group => !enabled || group.archived).map(group => group.external_id);
    return { ...normalizeNotificationSource(snapshot, settings), loaded_at: local.updatedAt, coverage: { manual: Boolean(manual), attendance: [...attendance, ...archived], activities: [...activities, ...archived] } };
  }
  let current = cache.get(uid);
  if (force || !current || current.expires <= Date.now()) {
    const promise = (async (): Promise<NotificationSourceSnapshot> => {
      const browserOnly = Boolean((await readKodlandBrowser(uid))?.active);
      const preferences = await kodlandReadPreference(() => tutorPreferencesApi.get(), browserOnly);
      const before = preferences.kodland_enabled ? await kodlandApi.notificationSyncStatus() : null;
      const partial = before && "group_status" in before && before.group_status && Object.keys(before.group_status).length > 0 && (before.main_status === "complete" || before.mode === "corrections");
      if (before && before.status !== "complete" && !partial) throw new Error("A sincronização Kodland está incompleta. Os alertas anteriores serão preservados; conclua uma sincronização para atualizar.");
      const [manualClasses, manualStudents, manualOccurrences, manualAttendance, manualActivities, groups, students, attendance, lessons, taskProgress] = await Promise.all([
        manualTeachingApi.classes(), manualTeachingApi.students(), manualOperationsApi.occurrences(), manualOperationsApi.attendance(), manualPedagogyApi.activities(),
        preferences.kodland_enabled ? kodlandApi.groups().then(result => result.items) : Promise.resolve([]),
        preferences.kodland_enabled ? kodlandApi.students().then(result => result.items) : Promise.resolve([]),
        preferences.kodland_enabled ? kodlandApi.attendance().then(result => result.items) : Promise.resolve([]),
        preferences.kodland_enabled ? kodlandApi.lessons().then(result => result.items) : Promise.resolve([]),
        preferences.kodland_enabled ? kodlandApi.taskProgress().then(result => result.items) : Promise.resolve([]),
      ]);
      const after = preferences.kodland_enabled ? await kodlandApi.notificationSyncStatus() : null;
      owner();
      if (JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Os dados foram atualizados durante a leitura. Atualize as notificações novamente.");
      const ready = partial ? groups.filter(group => group.archived || before.group_status?.[group.external_id] === "complete").map(group => group.external_id) : null;
      return { manualClasses, manualStudents, manualOccurrences, manualAttendance, manualActivities, groups, students, attendance: ready ? attendance.filter(item => ready.includes(item.external_class_id)) : attendance, lessons, taskProgress: ready ? taskProgress.filter(item => ready.includes(item.external_class_id)) : taskProgress, ...(ready ? { coverage: { manual: true, attendance: ready, activities: ready } } : {}) };
    })();
    current = { promise, loadedAt: new Date().toISOString(), expires: Date.now() + 6 * 3600000 }; cache.set(uid, current);
    promise.catch(() => { if (cache.get(uid)?.promise === promise) cache.delete(uid); });
  }
  const snapshot = await current.promise; owner();
  return { ...normalizeNotificationSource(snapshot, settings), loaded_at: current.loadedAt, coverage: snapshot.coverage };
}
export const demoStudentNotificationSource = (snapshot: DemoSnapshot, settings: NotificationSettings) => normalizeNotificationSource(snapshot.tutorPreferences.kodland_enabled ? snapshot : { ...snapshot, groups: [], students: [], attendance: [], lessons: [] }, settings);

/** Individual Kodland message preview only; never use this partial source to reconcile global alerts. */
export async function loadBrowserKodlandNotificationSource(uid: string, settings: NotificationSettings): Promise<NotificationSource> {
  const owner = () => { if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error("Sua conta foi alterada."); };
  owner();
  const state = await readKodlandBrowser(uid);
  if (!state?.active) return loadStudentNotificationSource(uid, settings);
  const [groups, students, attendance, lessons, taskProgress] = await Promise.all([kodlandApi.groups(), kodlandApi.students(), kodlandApi.attendance(), kodlandApi.lessons(), kodlandApi.taskProgress()]);
  owner();
  return normalizeNotificationSource({ manualClasses: [], manualStudents: [], manualOccurrences: [], manualAttendance: [], manualActivities: [], groups: groups.items, students: students.items, attendance: attendance.items, lessons: lessons.items, taskProgress: taskProgress.items }, settings);
}
