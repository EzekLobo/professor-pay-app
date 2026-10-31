import { kodlandApi, manualOperationsApi, manualPedagogyApi, manualTeachingApi, tutorPreferencesApi, type KodlandAttendance, type KodlandGroup, type KodlandStudent } from "./api";
import { attendanceDateFromSchedule, attendanceLessonParts, lessonForAttendance } from "./attendance-schedule";
import type { DemoSnapshot } from "./demo-snapshot";
import type { KodlandLesson } from "./kodland-lessons";
import type { ManualActivity } from "./manual-pedagogy";
import type { ManualAttendance, ManualOccurrence } from "./manual-operations";
import type { ManualClass, ManualStudent } from "./manual-teaching";
import type { KodlandTaskProgress } from "./kodland-task-progress";
import { getFirebaseAuth } from "./firebase";
import { isActiveKodlandStudent } from "./student-ranking";
import { notificationLocalInstant, type NotificationLesson, type NotificationObligation, type NotificationSettings } from "./student-notification-rules";

export type NotificationSourceSnapshot = {
  manualClasses: ManualClass[]; manualStudents: ManualStudent[]; manualOccurrences: ManualOccurrence[];
  manualAttendance: ManualAttendance[]; manualActivities: ManualActivity[];
  groups: KodlandGroup[]; students: KodlandStudent[]; attendance: KodlandAttendance[]; lessons: KodlandLesson[];
  taskProgress?: KodlandTaskProgress[];
};
export type NotificationSource = { lessonCodes?: Record<string, string>; lessons: NotificationLesson[]; obligations: NotificationObligation[]; warnings: string[]; loaded_at: string };
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
      lessons.push({ source: "manual", class_id: classroom.id, class_name: classroom.name, student_id: student.id, student_name: student.name, occurrence_id: occurrence.id, lesson_label: occurrence.course_code || occurrence.title_snapshot || "Aula", lesson_date: occurrence.lesson_date, ended_at: end, active: true, cancelled: occurrence.status === "cancelled" || occurrence.status === "rescheduled", attendance: attendance?.status === "ABSENT" ? "absent" : !attendance || attendance.status === "UNMARKED" ? "unknown" : "other", guardian_name: student.guardian_name ?? "", guardian_phone: student.guardian_phone ?? "", recording_url: occurrence.recording_url });
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
    const date = attendanceDateFromSchedule(record, lesson, snapshot.lessons, group);
    const end = lesson?.end_time ? notificationLocalInstant(date, lesson.end_time.slice(0, 5), zone) : null;
    if (!end) warnings.add("Algumas presenças sincronizadas não têm horário final confiável e ficam fora dos alertas de falta.");
    lessons.push({ source: "kodland", class_id: group.external_id, class_name: group.title, student_id: student.external_id, student_name: student.name, occurrence_id: record.lesson_id, lesson_label: lesson?.schedule_code || record.lesson_title || lesson?.title || "Aula", lesson_date: date, ended_at: end, active: true, cancelled: /cancel/i.test(lesson?.status ?? ""), attendance: record.status === "ABSENT" ? "absent" : record.status === "UNKNOWN" ? "unknown" : "other", guardian_name: student.guardian_name, guardian_phone: student.guardian_phone, recording_url: lesson?.recording_url || record.recording_url });
  }
  const taskIdFromUrl = (url: string) => url.match(/\/task\/(\d+)(?:\/|$)/)?.[1] ?? "";
  for (const progress of snapshot.taskProgress ?? []) {
    const group = snapshot.groups.find(item => item.external_id === progress.external_class_id);
    const student = snapshot.students.find(item => item.external_class_id === progress.external_class_id && item.external_id === progress.external_student_id);
    if (!group || group.archived || !student || student.hidden || !isActiveKodlandStudent(student.status)) continue;
    const record: KodlandAttendance = { id: progress.id, external_class_id: group.external_id, external_class_name: group.title, external_student_id: student.external_id, student_name: student.name, lesson_id: progress.lesson_id, lesson_title: "", lesson_date: "", start_time: "", status: "UNKNOWN" };
    const catalog = lessonForAttendance(record, snapshot.lessons);
    let lesson = lessons.find(item => item.source === "kodland" && item.class_id === group.external_id && item.student_id === student.external_id && item.occurrence_id === progress.lesson_id);
    if (!lesson) {
      const date = attendanceDateFromSchedule(record, catalog, snapshot.lessons, group);
      lesson = { source: "kodland", class_id: group.external_id, class_name: group.title, student_id: student.external_id, student_name: student.name, occurrence_id: progress.lesson_id, lesson_label: catalog?.schedule_code || catalog?.title || "Aula", lesson_date: date, ended_at: catalog?.end_time ? notificationLocalInstant(date, catalog.end_time.slice(0, 5), zone) : null, active: true, cancelled: /cancel/i.test(catalog?.status ?? ""), attendance: "unknown", guardian_name: student.guardian_name, guardian_phone: student.guardian_phone, recording_url: catalog?.recording_url };
      lessons.push(lesson);
    }
    const classroom = catalog?.classroom_tasks.some(item => taskIdFromUrl(item.url) === progress.task_id) ?? false;
    const homework = Boolean(catalog?.homework_url && taskIdFromUrl(catalog.homework_url) === progress.task_id);
    const kind = classroom === homework ? "unknown" : homework ? "homework" : "classroom";
    if (kind === "unknown") warnings.add("Algumas atividades Kodland ainda não têm classificação Aula/Casa confirmada pelos materiais e ficam fora das cobranças. A regra Nenhuma entregue aguarda classificação completa da aula.");
    if (kind === "homework" && settings.homework_days_after_lesson === null) warnings.add("Atividades Kodland de casa não têm prazo importado: configure dias após a aula para habilitar cobranças.");
    obligations.push({ id: progress.id, source: "kodland", class_id: group.external_id, student_id: student.external_id, occurrence_id: progress.lesson_id, title: progress.task_title, kind, due_at: null, state: progress.state, required: true, exempt: false });
  }
  if (snapshot.groups.some(item => !item.archived) && !(snapshot.taskProgress?.length)) warnings.add("Sincronize Acompanhamento para carregar o progresso das atividades Kodland. A fila de correções sozinha não identifica quem deixou de entregar.");
  const lessonCodes: Record<string, string> = {};
  for (const item of lessons.filter(item => item.source === "kodland")) {
    const parts = attendanceLessonParts({ external_class_id: item.class_id, lesson_id: item.occurrence_id, lesson_title: item.lesson_label } as KodlandAttendance, snapshot.lessons);
    if (parts.module) lessonCodes[`${item.class_id}:${item.occurrence_id}`] = `${parts.module}${parts.lesson}`;
  }
  return { lessons, obligations, lessonCodes, warnings: [...warnings], loaded_at: new Date().toISOString() };
}
const cache = new Map<string, { expires: number; promise: Promise<NotificationSourceSnapshot> }>();
export function clearStudentNotificationSourceCache() { cache.clear(); }
/** Shared source cache: callers must supply the authenticated UID; a failed refresh never becomes an empty successful snapshot. */
export async function loadStudentNotificationSource(uid: string, settings: NotificationSettings, force = false): Promise<NotificationSource> {
  const owner = () => { if (getFirebaseAuth().currentUser?.uid !== uid) throw new Error("Sua conta foi alterada. Entre novamente."); };
  owner();
  let current = cache.get(uid);
  if (force || !current || current.expires <= Date.now()) {
    const promise = (async (): Promise<NotificationSourceSnapshot> => {
      const preferences = await tutorPreferencesApi.get();
      const before = preferences.kodland_enabled ? await kodlandApi.notificationSyncStatus() : null;
      if (before && before.status !== "complete") throw new Error("A sincronização Kodland está incompleta. Os alertas anteriores serão preservados; conclua uma sincronização para atualizar.");
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
      return { manualClasses, manualStudents, manualOccurrences, manualAttendance, manualActivities, groups, students, attendance, lessons, taskProgress };
    })();
    current = { promise, expires: Date.now() + 30000 }; cache.set(uid, current);
    promise.catch(() => { if (cache.get(uid)?.promise === promise) cache.delete(uid); });
  }
  const snapshot = await current.promise; owner();
  return normalizeNotificationSource(snapshot, settings);
}
export const demoStudentNotificationSource = (snapshot: DemoSnapshot, settings: NotificationSettings) => normalizeNotificationSource(snapshot.tutorPreferences.kodland_enabled ? snapshot : { ...snapshot, groups: [], students: [], attendance: [], lessons: [] }, settings);
