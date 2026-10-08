import { NextRequest } from "next/server";
import {
  enrichKodlandLessons,
  mergeKodlandLessons,
  type KodlandCourseLesson,
  type KodlandLesson,
} from "@/lib/kodland-lessons";
import { parseGuardianContact } from "@/lib/student-profile";

export const runtime = "nodejs";

type Group = {
  external_id: string;
  title: string;
  course_id: string;
  course_name: string;
  student_count: number;
  start_date: string;
  next_lesson_date: string;
  next_lesson_number: number;
  next_lesson_id: string;
  next_lesson_title: string;
  next_lesson_url: string;
  archived: boolean;
};
type Student = {
  id: string;
  external_id: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  progress_summary: string;
  profile_url: string;
  guardian_name: string;
  guardian_relationship: string;
  guardian_phone: string;
  guardian_email: string;
  external_class_id: string;
  external_class_name: string;
};
type Review = {
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
};
type ExtraLesson = {
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
};
type Availability = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};
type SyncCollection<T> = {
  items: T[];
  source_available: boolean;
};

const completionFlag = (event: Record<string, unknown>) =>
  event.completed ??
  event.is_completed ??
  event.lesson_passed ??
  event.passed;

const recordingAvailable = (event: Record<string, unknown>) => {
  const recording =
    event.recording ??
    event.recordings ??
    event.recording_url ??
    event.recordingUrl ??
    event.lesson_recording ??
    event.lessonRecording ??
    event.video_recording ??
    event.videoRecording;
  if (Array.isArray(recording)) return recording.length > 0;
  if (recording && typeof recording === "object") return Object.keys(recording).length > 0;
  if (
    recording === false ||
    recording === 0 ||
    recording === "0" ||
    recording === "false"
  ) {
    return false;
  }
  return flag(recording) || text(recording).length > 0;
};

/**
 * An approved request merely authorizes an extra lesson. It is not financial
 * evidence. A recording is used only when Kodland has not supplied a state.
 */
const completedFromEvent = (event: Record<string, unknown>) => {
  const completion = completionFlag(event);
  if (explicitBoolean(completion)) return flag(completion);

  const status = normalized(event.status ?? event.lesson_status ?? event.state);
  if (/completed|complete|passed|done|finished|held|realizada|concluida|ministrada/.test(status)) {
    return true;
  }
  if (/approved|aprovad|review|revis|pending|pendente|postpon|adiad|reschedul|reagend|moved|cancel/.test(status)) {
    return false;
  }
  return recordingAvailable(event);
};

const sso = "https://sso.production.kodland.org/";
const api = "https://backoffice.kodland.org/api/v2/";
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
const record = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const list = (value: unknown) => {
  if (Array.isArray(value)) return value;
  const payload = record(value);
  for (const key of [
    "results",
    "items",
    "data",
    "lessons",
    "events",
    "schedule",
    "timetable",
    "slots",
    "materials",
    "tasks",
  ]) {
    if (Array.isArray(payload[key])) return payload[key] as unknown[];
  }
  return [];
};
const scheduleItems = (value: unknown, depth = 0): unknown[] => {
  const items = list(value);
  if (items.length) {
    return items.flatMap((item) =>
      Array.isArray(item) ? scheduleItems(item, depth + 1) : [item],
    );
  }
  if (depth >= 2) return [];
  return Object.values(record(value)).flatMap((item) =>
    Array.isArray(item) ? item : scheduleItems(item, depth + 1),
  );
};
const number = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const flag = (value: unknown) =>
  value === true || value === 1 || value === "1" || value === "true";
const explicitBoolean = (value: unknown) =>
  value === true ||
  value === false ||
  value === 1 ||
  value === 0 ||
  value === "1" ||
  value === "0" ||
  value === "true" ||
  value === "false";
const normalized = (value: unknown) =>
  text(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const dateOnly = (value: unknown) =>
  text(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
const timeOnly = (value: unknown) => {
  const raw = text(value);
  return (
    raw.match(/T(\d{1,2}:\d{2})/)?.[1] ??
    raw.match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0]?.slice(0, 5) ??
    ""
  );
};

/**
 * The calendar endpoint is week-scoped when a date is supplied. Request the
 * adjacent weeks as well so an upcoming extra does not disappear simply
 * because the provider's implicit "current week" is calculated in UTC.
 */
export function teacherCalendarWeekDates(reference = new Date()) {
  const monday = new Date(
    Date.UTC(
      reference.getUTCFullYear(),
      reference.getUTCMonth(),
      reference.getUTCDate(),
    ),
  );
  const day = monday.getUTCDay() || 7;
  monday.setUTCDate(monday.getUTCDate() - day + 1);
  return [-1, 0, 1, 2].map((weekOffset) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + weekOffset * 7);
    return date.toISOString().slice(0, 10);
  });
}

export function availabilityFromTeacherTimetable(
  payload: unknown,
): Availability[] {
  const names: Record<string, number> = {
    monday: 0,
    segunda: 0,
    tuesday: 1,
    terca: 1,
    terça: 1,
    wednesday: 2,
    quarta: 2,
    thursday: 3,
    quinta: 3,
    friday: 4,
    sexta: 4,
    saturday: 5,
    sabado: 5,
    sábado: 5,
    sunday: 6,
    domingo: 6,
  };
  return scheduleItems(payload).flatMap((value, index) => {
    const item = record(value);
    const rawDay =
      item.weekday ?? item.week_day ?? item.day_of_week ?? item.day;
    const dayText = text(rawDay).toLocaleLowerCase();
    const weekday =
      names[dayText] ?? (number(rawDay) === 0 ? 6 : number(rawDay) - 1);
    const start = timeOnly(item.start_hour ?? item.start_time ?? item.start);
    const end = timeOnly(item.end_hour ?? item.end_time ?? item.end);
    if (weekday < 0 || weekday > 6 || !start || !end) return [];
    return [
      {
        id: `availability-${text(item.id) || `${weekday}-${index}`}`,
        weekday,
        start_time: start,
        end_time: end,
      },
    ];
  });
}

async function requireFirebaseUser(request: NextRequest) {
  const idToken = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!idToken || !apiKey) return null;
  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idToken }),
      cache: "no-store",
    },
  );
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    users?: Array<{ localId?: string }>;
  };
  return payload.users?.[0]?.localId ?? null;
}

function userId(token: string) {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("A sessão da Kodland é inválida.");
  const decoded = JSON.parse(
    Buffer.from(
      payload.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8"),
  ) as { user_id?: string | number };
  if (decoded.user_id === undefined)
    throw new Error("A sessão da Kodland não informa o professor.");
  return String(decoded.user_id);
}

async function kodlandLogin(username: string, password: string) {
  const form = new URLSearchParams({ username: username.trim(), password });
  const response = await fetch(`${sso}login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "Usuário ou senha da Kodland inválidos."
        : "Não foi possível entrar na Kodland.",
    );
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token)
    throw new Error("A Kodland não retornou uma sessão válida.");
  return payload.access_token;
}

async function get(path: string, token: string) {
  const response = await fetch(`${api}${path}`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!response.ok)
    throw new Error(
      response.status === 401
        ? "A sessão da Kodland expirou. Tente novamente."
        : "A Kodland não respondeu como esperado.",
    );
  return response.json();
}

async function getOptional(path: string, token: string) {
  try {
    return await get(path, token);
  } catch {
    return null;
  }
}

async function groupsForTeacher(
  teacherId: string,
  token: string,
): Promise<Group[]> {
  const groups: Group[] = [];
  for (let page = 1; ; page += 1) {
    const payload = record(
      await get(
        `teachers/${teacherId}/get_teachers_groups/?page=${page}&page_size=100`,
        token,
      ),
    );
    const items = list(payload.results);
    groups.push(
      ...items
        .map((value) => {
          const item = record(value);
          const course = record(item.course);
          const nextLessonValue =
            item.next_lesson ??
            item.nextLesson ??
            item.next_lesson_info ??
            item.nextLessonInfo;
          const nextLesson = record(nextLessonValue);
          const nextLessonUrl = text(
            item.next_lesson_url ??
              item.nextLessonUrl ??
              nextLesson.url ??
              nextLesson.link ??
              nextLesson.external_url ??
              nextLesson.externalUrl,
          );
          const linkedLessonId = (() => {
            try {
              return new URL(nextLessonUrl, "https://bo.kodland.org")
                .searchParams.get("lessonId") ?? "";
            } catch {
              return "";
            }
          })();
          const courseName = text(course.title ?? item.course_name);
          const courseId =
            text(course.id ?? course.course_id ?? item.course_id) ||
            courseName.match(/^\[(\d+)\]/)?.[1] ||
            "";
          return {
            external_id: text(item.id ?? item.group_id),
            title: text(item.title ?? item.group_name),
            course_id: courseId,
            course_name: courseName,
            student_count: number(item.students_count ?? item.student_count),
            start_date: text(item.start_timeslot ?? item.start_date),
            next_lesson_date: text(item.next_lesson_date),
            next_lesson_number: number(
              item.next_lesson_number ?? item.nextLessonNumber ??
                nextLesson.lesson_number ?? nextLesson.lessonNumber ??
                nextLesson.lesson_no ?? nextLesson.lessonNo ??
                nextLesson.course_lesson_number ??
                nextLesson.courseLessonNumber ??
                nextLesson.number ?? nextLesson.lesson_index ??
                nextLesson.lessonIndex ?? nextLesson.lesson_order ??
                nextLesson.lessonOrder,
            ),
            next_lesson_id: text(
              item.next_lesson_id ??
                item.nextLessonId ??
                nextLesson.lesson_id ??
                nextLesson.lessonId ??
                nextLesson.id ??
                linkedLessonId,
            ),
            next_lesson_title: text(
              item.next_lesson_title ??
                item.nextLessonTitle ??
                item.next_lesson_name ??
                item.nextLessonName ??
                nextLesson.lesson_title ??
                nextLesson.lessonTitle ??
                nextLesson.title ??
                nextLesson.name ??
                (typeof nextLessonValue === "string" ? nextLessonValue : ""),
            ),
            next_lesson_url: nextLessonUrl,
            archived: Boolean(item.is_archive ?? item.archived),
          };
        })
        .filter((group) => group.external_id && group.title),
    );
    if (!payload.next || !items.length) break;
  }
  return groups;
}

function studentsFromPayload(payload: unknown, group: Group): Student[] {
  return list(payload).flatMap((value) => {
    const item = record(value);
    const info = record(item.main_info);
    const externalId = text(info.student_id);
    const name = text(info.full_name);
    if (!externalId || !name) return [];
    const progress = list(item.progress_info);
    const current = progress.reduce(
      (sum, item) => sum + number(record(item).module_current_grade),
      0,
    );
    const max = progress.reduce(
      (sum, item) => sum + number(record(item).module_max_grade),
      0,
    );
    return [
      {
        id: `kodland-student-${externalId}`,
        external_id: externalId,
        name,
        email: text(info.email),
        phone: text(info.phone ?? info.phone_number ?? info.mobile),
        status: text(info.status),
        progress_summary: max ? `${current}/${max}` : "",
        profile_url:
          text(info.profile_url) ||
          `https://bo.kodland.org/students/${externalId}`,
        guardian_name: "",
        guardian_relationship: "",
        guardian_phone: "",
        guardian_email: "",
        external_class_id: group.external_id,
        external_class_name: group.title,
      },
    ];
  });
}

async function studentsWithProfiles(
  students: Student[],
  token: string,
  cache: Map<string, ReturnType<typeof parseGuardianContact>>,
): Promise<Student[]> {
  return Promise.all(
    students.map(async (student) => {
      let guardian = cache.get(student.external_id);
      if (!guardian) {
        const profile = await getOptional(
          `students/${student.external_id}/get_general_info_for_student_backoffice_page/`,
          token,
        );
        guardian = parseGuardianContact(profile);
        cache.set(student.external_id, guardian);
      }
      return {
        ...student,
        guardian_name: guardian.name,
        guardian_relationship: guardian.relationship,
        guardian_phone: guardian.phone,
        guardian_email: guardian.email,
      };
    }),
  );
}

/** Extra lessons are shown on the student's agenda and become billable only after Kodland marks them as completed. */
export function extrasFromStudentAgenda(
  payload: unknown,
  student: Student,
): ExtraLesson[] {
  return scheduleItems(payload).flatMap((value, index) => {
    const item = record(value);
    const nested = record(item.lesson ?? item.event ?? item.lesson_data);
    const event = { ...nested, ...item };
    const kind = text(
      event.lesson_type ??
        event.lessonType ??
        event.type ??
        event.category ??
        event.kind ??
        event.event_type ??
        event.eventType ??
        event.schedule_type ??
        event.scheduleType,
    ).toLowerCase();
    const isExtra =
      flag(
        event.is_extra ??
          event.isExtra ??
          event.is_extra_lesson ??
          event.isExtraLesson ??
          event.additional ??
          event.is_additional ??
          event.isAdditional ??
          event.individual ??
          event.is_individual ??
          event.isIndividual,
      ) ||
      /extra|additional|individual/.test(
        `${kind} ${text(event.status ?? event.lesson_status ?? event.state)}`.toLowerCase(),
      );
    const lessonDate = dateOnly(
      event.lesson_date ??
        event.lessonDate ??
        event.date ??
        event.start ??
        event.start_at ??
        event.startAt ??
        event.datetime,
    );
    const status = text(event.status ?? event.lesson_status ?? event.state);
    const completed = completedFromEvent(event);
    const externalId = text(
      event.extra_lesson_id ??
        event.id ??
        event.lesson_id ??
        event.lessonId ??
        event.event_id ??
        event.eventId,
    );
    if (!isExtra || !lessonDate || !externalId) return [];
    return [
      {
        id: `kodland-extra-${student.external_id}-${externalId || index + 1}`,
        external_student_id: student.external_id,
        student_name: student.name,
        external_class_id: student.external_class_id,
        external_class_name: student.external_class_name,
        lesson_date: lessonDate,
        start_time: timeOnly(
          event.start_time ??
            event.startTime ??
            event.start ??
            event.start_at ??
            event.startAt ??
            event.datetime,
        ),
        end_time: timeOnly(
          event.end_time ??
            event.endTime ??
            event.end ??
            event.end_at ??
            event.endAt ??
            event.finish_at ??
            event.finishAt,
        ),
        status,
        completed,
      },
    ];
  });
}

/** The teacher calendar is the source of truth for upcoming extras. */
export function extrasFromTeacherAgenda(
  payload: unknown,
  students: Student[],
): ExtraLesson[] {
  const byStudentId = new Map(
    students.map((student) => [student.external_id, student]),
  );
  const byName = new Map(
    students.map((student) => [student.name.toLocaleLowerCase(), student]),
  );
  return scheduleItems(payload).flatMap((value, index) => {
    const item = record(value);
    const nested = record(item.lesson ?? item.event ?? item.lesson_data);
    const event = { ...nested, ...item };
    const externalId = text(
      event.extra_lesson_id ??
        event.id ??
        event.lesson_id ??
        event.lessonId ??
        event.event_id ??
        event.eventId,
    );
    const start = text(
      event.start_time ??
        event.start ??
        event.start_at ??
        event.startAt ??
        event.datetime ??
        event.lesson_date ??
        event.date,
    );
    const calendarTimestamp = (value: unknown) => {
      const raw = text(value);
      if (!raw) return { date: "", time: "" };
      // The provider's calendar converts its UTC timestamps to teacher time.
      if (event.start_time && /^\d{4}-\d{2}-\d{2}T/.test(raw)) {
        const date = new Date(
          /[Zz]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`,
        );
        if (!Number.isNaN(date.getTime())) {
          const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Sao_Paulo",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
          }).formatToParts(date);
          const part = (type: string) =>
            parts.find((item) => item.type === type)?.value ?? "";
          return {
            date: `${part("year")}-${part("month")}-${part("day")}`,
            time: `${part("hour")}:${part("minute")}`,
          };
        }
      }
      return { date: dateOnly(raw), time: timeOnly(raw) };
    };
    const startLocal = calendarTimestamp(start);
    const lessonDate = startLocal.date;
    if (!externalId || !lessonDate) return [];
    const studentId = text(
      event.student_id ??
        event.studentId ??
        record(event.student).id ??
        record(event.student).student_id,
    );
    const titleName = text(
      event.student_full_name ??
        event.student_name ??
        event.studentName ??
        record(event.student).full_name ??
        record(event.student).name ??
        event.title ??
        event.name,
    ).replace(/^[-–—\s]+/, "");
    const student =
      byStudentId.get(studentId) ?? byName.get(titleName.toLocaleLowerCase());
    const group = record(event.group ?? event.student_group ?? event.class);
    const classId =
      text(
        event.group_id ??
          event.groupId ??
          event.student_group_id ??
          event.studentGroupId ??
          group.id,
      ) ||
      student?.external_class_id ||
      "";
    const className =
      text(
        event.group_name ??
          event.groupName ??
          event.student_group_name ??
          event.studentGroupName ??
          group.title ??
          group.name,
      ) ||
      student?.external_class_name ||
      "Aula extra";
    const status = text(event.status ?? event.lesson_status ?? event.state);
    return [
      {
        id: `kodland-extra-${externalId || index + 1}`,
        external_student_id: student?.external_id ?? studentId,
        student_name: student?.name || titleName || "Aula extra",
        external_class_id: classId,
        external_class_name: className,
        lesson_date: lessonDate,
        start_time: startLocal.time,
        end_time: calendarTimestamp(
          event.end_time ??
            event.end ??
            event.end_at ??
            event.endAt ??
            event.finish_at ??
            event.finishAt,
        ).time,
        status,
        completed: completedFromEvent(event),
      },
    ];
  });
}

const extraIdentity = (lesson: ExtraLesson) => {
  const prefix = "kodland-extra-";
  const rawId = lesson.id.startsWith(prefix)
    ? lesson.id.slice(prefix.length)
    : lesson.id;
  const studentPrefix = lesson.external_student_id
    ? `${lesson.external_student_id}-`
    : "";
  const externalId = studentPrefix && rawId.startsWith(studentPrefix)
    ? rawId.slice(studentPrefix.length)
    : rawId;
  return `${lesson.external_student_id}:${externalId}`;
};

const mergeScheduledExtra = (
  scheduled: ExtraLesson,
  evidence: ExtraLesson,
): ExtraLesson => ({
  ...scheduled,
  external_student_id:
    evidence.external_student_id || scheduled.external_student_id,
  student_name: evidence.student_name || scheduled.student_name,
  external_class_id: evidence.external_class_id || scheduled.external_class_id,
  external_class_name:
    evidence.external_class_name || scheduled.external_class_name,
  // The teacher's agenda is authoritative for a postponed lesson's slot.
  lesson_date: scheduled.lesson_date || evidence.lesson_date,
  start_time: scheduled.start_time || evidence.start_time,
  end_time: scheduled.end_time || evidence.end_time,
  // Keep the student's richer state label when the calendar has none.
  status: evidence.status || scheduled.status,
  // A scheduled occurrence must never erase an already confirmed completion.
  completed: scheduled.completed || evidence.completed,
});

/**
 * Combines the calendar slot from the teacher agenda with completion evidence
 * from the student's agenda. The two endpoints use different local IDs for
 * the same provider extra, so reconciliation uses student + extra identifier.
 */
export function mergeExtraLessons(
  teacherExtras: ExtraLesson[],
  studentExtras: ExtraLesson[],
): ExtraLesson[] {
  const merged = new Map<string, ExtraLesson>();
  for (const extra of teacherExtras) {
    const key = extraIdentity(extra);
    const previous = merged.get(key);
    merged.set(key, previous ? mergeScheduledExtra(extra, previous) : extra);
  }
  for (const extra of studentExtras) {
    const key = extraIdentity(extra);
    const scheduled = merged.get(key);
    merged.set(key, scheduled ? mergeScheduledExtra(scheduled, extra) : extra);
  }
  return [...merged.values()];
}

async function extrasForStudents(
  students: Student[],
  teacherId: string,
  token: string,
): Promise<SyncCollection<ExtraLesson>> {
  const [snapshots, teacherSchedule, teacherExtraPayloads] = await Promise.all([
    Promise.all(
      students.map(async (student) => {
        const agenda = await getOptional(
          `students/${student.external_id}/schedule_view/`,
          token,
        );
        return agenda ? extrasFromStudentAgenda(agenda, student) : [];
      }),
    ),
    getOptional(`teacher_timetables/${teacherId}`, token),
    Promise.all(
      [undefined, ...teacherCalendarWeekDates()].map((date) =>
        getOptional(
          `teachers/${teacherId}/get_teacher_extra_lessons_timetable/${
            date ? `?date=${date}` : ""
          }`,
          token,
        ),
      ),
    ),
  ]);
  const byStudentId = new Map(
    students.map((student) => [student.external_id, student]),
  );
  const knownGroupIds = new Set(
    students.map((student) => student.external_class_id),
  );
  const fromTeacherSchedule = scheduleItems(teacherSchedule).flatMap(
    (value) => {
      const item = record(value);
      const nested = record(item.lesson ?? item.event ?? item.lesson_data);
      const event = { ...nested, ...item };
      const studentId = text(
        event.student_id ??
          event.studentId ??
          record(event.student).id ??
          record(event.student).student_id,
      );
      const groupId = text(
        event.group_id ??
          event.groupId ??
          event.student_group_id ??
          event.studentGroupId ??
          event.class_id ??
          event.classId,
      );
      const student = byStudentId.get(studentId);
      const kind = text(
        event.lesson_type ??
          event.lessonType ??
          event.type ??
          event.category ??
          event.kind ??
          event.event_type ??
          event.eventType,
      );
      const explicitlyExtra =
        flag(
          event.is_extra ??
            event.isExtra ??
            event.is_extra_lesson ??
            event.isExtraLesson ??
            event.additional ??
            event.is_additional ??
            event.isAdditional ??
            event.individual ??
            event.is_individual ??
            event.isIndividual,
        ) ||
        /extra|additional|individual/.test(
          `${kind} ${text(event.status)}`.toLowerCase(),
        );
      if (!student || (!explicitlyExtra && knownGroupIds.has(groupId)))
        return [];
      return extrasFromStudentAgenda([{ ...event, is_extra: true }], student);
    },
  );
  return {
    items: mergeExtraLessons(
      [
        ...teacherExtraPayloads.flatMap((payload) =>
          extrasFromTeacherAgenda(payload, students),
        ),
        ...fromTeacherSchedule,
      ],
      snapshots.flat(),
    ),
    source_available:
      teacherSchedule !== undefined ||
      teacherExtraPayloads.some((payload) => payload !== undefined) ||
      snapshots.some((items) => items.length > 0),
  };
}

async function reviewsForGroup(
  group: Group,
  studentsPayload: unknown,
  token: string,
): Promise<Review[]> {
  try {
    const lessons = list(
      await get(`student_groups/${group.external_id}/lessons/`, token),
    ).filter((value) => record(value).lesson_passed === true);
    const results = await Promise.all(
      lessons.map(async (value) => {
        const lesson = record(value);
        const lessonId = text(lesson.lesson_id ?? lesson.id);
        const progress = record(
          await get(
            `student_groups/${group.external_id}/lesson/${lessonId}/get_group_progress/`,
            token,
          ),
        );
        const tasks = new Map(
          list(progress.lesson_tasks).map((value) => {
            const task = record(value);
            return [text(task.id ?? task.task_id), task];
          }),
        );
        return list(progress.students_progress).flatMap((value) => {
          const student = record(value);
          const studentId = text(student.student_id);
          const studentName = text(student.student_name);
          return list(student.tasks_data).flatMap((value) => {
            const data = record(value);
            const status = text(data.task_status_key);
            const task = tasks.get(text(data.task_id));
            if (
              !studentId ||
              !studentName ||
              !task ||
              !["TASK_SUBMITTED", "TASK_SUBMITTED_LATE"].includes(status)
            )
              return [];
            const taskId = text(task.id ?? task.task_id);
            const link = text(task.link_to_service ?? task.url);
            return [
              {
                id: `${group.external_id}-${studentId}-${lessonId}-${taskId}`,
                external_class_id: group.external_id,
                external_class_name: group.title,
                external_student_id: studentId,
                student_name: studentName,
                lesson_id: lessonId,
                lesson_number: number(lesson.lesson_number ?? lesson.number),
                lesson_title: text(lesson.lesson_title ?? lesson.title),
                module_number: "",
                task_id: taskId,
                task_number: number(task.number ?? task.task_number),
                task_title: text(task.title ?? task.task_title),
                status_key: status,
                status_label:
                  status === "TASK_SUBMITTED_LATE"
                    ? "Entregue com atraso"
                    : "Entregue",
                correction_url: /^https?:\/\//.test(link)
                  ? link
                  : `https://bo.kodland.org${link || `/groups/${group.external_id}`}`,
              },
            ];
          });
        });
      }),
    );
    return results.flat();
  } catch {
    return [];
  }
}

type CourseLessonCache = {
  catalog: Map<string, Promise<KodlandCourseLesson[]>>;
  details: Map<string, Promise<KodlandCourseLesson>>;
  pendingDetails: Array<() => void>;
  activeDetails: number;
};

async function withLessonDetailSlot<T>(
  cache: CourseLessonCache,
  work: () => Promise<T>,
): Promise<T> {
  if (cache.activeDetails >= 2) {
    await new Promise<void>((resolve) => cache.pendingDetails.push(resolve));
  }
  cache.activeDetails += 1;
  try {
    return await work();
  } finally {
    cache.activeDetails -= 1;
    cache.pendingDetails.shift()?.();
  }
}

async function courseLessons(
  courseId: string,
  token: string,
  cache: CourseLessonCache,
): Promise<KodlandCourseLesson[]> {
  if (!courseId) return [];
  let catalogPromise = cache.catalog.get(courseId);
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const payload = await getOptional(
        `lessons/get_lessons_list?course=${encodeURIComponent(courseId)}`,
        token,
      );
      return list(payload)
        .map((value): KodlandCourseLesson | null => {
          const item = record(value);
          const id = text(item.id ?? item.lesson_id ?? item.lessonId);
          if (!id) return null;
          return {
            id,
            lesson_number: number(
              item.lesson_number ?? item.lessonNumber ?? item.number,
            ),
            title: text(item.title ?? item.lesson_title ?? item.name),
            materials: [],
            homework: [],
            classroom: [],
          };
        })
        .filter((value): value is KodlandCourseLesson => Boolean(value))
        .map((lesson, index) => ({ ...lesson, course_index: index + 1 }));
    })();
    cache.catalog.set(courseId, catalogPromise);
  }
  const catalog = await catalogPromise;
  const all = async <T, R>(values: T[], work: (value: T) => Promise<R>) => {
    const results: R[] = [];
    for (let index = 0; index < values.length; index += 2) {
      results.push(...(await Promise.all(values.slice(index, index + 2).map(work))));
    }
    return results;
  };
  return all(
    catalog,
    async (lesson) => {
      const key = `${courseId}:${lesson.id}`;
      let details = cache.details.get(key);
      if (!details) {
        details = withLessonDetailSlot(cache, async () => {
          const [materials, homework, classroom] = await Promise.all([
            getOptional(
              `materials?lesson=${encodeURIComponent(lesson.id)}`,
              token,
            ),
            getOptional(
              `tasks/get_tasks_list?lesson=${encodeURIComponent(lesson.id)}&is_hw=true`,
              token,
            ),
            getOptional(
              `tasks/get_tasks_list?lesson=${encodeURIComponent(lesson.id)}&is_hw=false`,
              token,
            ),
          ]);
          return {
            ...lesson,
            materials: list(materials),
            homework: list(homework),
            classroom: list(classroom),
          };
        });
        cache.details.set(key, details);
      }
      return details;
    },
  );
}

async function lessonsForGroup(
  group: Group,
  token: string,
  cache: CourseLessonCache,
): Promise<KodlandLesson[]> {
  const [schedule, lessons] = await Promise.all([
    getOptional(`student_groups/${group.external_id}/schedule_view/`, token),
    getOptional(`student_groups/${group.external_id}/lessons/`, token),
  ]);
  const merged = mergeKodlandLessons(schedule, lessons, group);
  const catalog = await courseLessons(group.course_id, token, cache);
  const catalogLessons = new Map<string, KodlandLesson>(
    catalog.map((lesson) => [
      lesson.id,
      {
        id: lesson.id,
        external_class_id: group.external_id,
        external_class_name: group.title,
        course_index: lesson.course_index,
        lesson_number: lesson.lesson_number,
        title: lesson.title || "Aula",
        theme: "",
        lesson_date: "",
        start_time: "",
        end_time: "",
        status: "",
        lesson_passed: false,
        external_url: "",
        slides_url: "",
        guide_url: "",
        homework_url: "",
        homework_title: "",
        classroom_tasks: [],
      },
    ]),
  );
  merged.forEach((lesson) => {
    const catalogLesson = catalog.find(
      (item) =>
        item.id === lesson.id ||
        (lesson.course_index &&
          item.course_index === lesson.course_index) ||
        (!lesson.course_index &&
          item.lesson_number > 0 &&
          item.lesson_number === lesson.lesson_number),
    );
    const key = catalogLesson?.id ?? lesson.id;
    const previous = catalogLessons.get(key);
    catalogLessons.set(
      key,
      previous
        ? {
            ...previous,
            ...lesson,
            id: key,
            course_index: previous.course_index || lesson.course_index,
            lesson_number: previous.lesson_number || lesson.lesson_number,
            title: previous.title || lesson.title,
            module_number: previous.module_number || lesson.module_number,
          }
        : { ...lesson, id: key },
    );
  });
  return enrichKodlandLessons(
    [...catalogLessons.values()],
    catalog,
    group.course_id,
  );
}

export async function POST(request: NextRequest) {
  try {
    if (!(await requireFirebaseUser(request)))
      return Response.json({ message: "Não autorizado." }, { status: 401 });
    const body = (await request.json()) as {
      username?: string;
      password?: string;
    };
    if (!body.username?.trim() || !body.password)
      return Response.json(
        { message: "Informe usuário e senha da Kodland." },
        { status: 400 },
      );
    const token = await kodlandLogin(body.username, body.password);
    const groups = await groupsForTeacher(userId(token), token);
    const active = groups.filter((group) => !group.archived);
    const profileCache = new Map<
      string,
      ReturnType<typeof parseGuardianContact>
    >();
    const courseLessonCache: CourseLessonCache = {
      catalog: new Map(),
      details: new Map(),
      pendingDetails: [],
      activeDetails: 0,
    };
    // Keep the teacher calendar ahead of the full course-material import. The
    // calendar is what drives availability and booked extras, while the
    // material import can make hundreds of auxiliary requests.
    const groupsWithStudents = await Promise.all(
      active.map(async (group) => {
        const payload = await get(
          `student_groups/${group.external_id}/get_students_main_data/`,
          token,
        );
        const students = await studentsWithProfiles(
          studentsFromPayload(payload, group),
          token,
          profileCache,
        );
        return {
          group,
          payload,
          students,
        };
      }),
    );
    const students = groupsWithStudents.flatMap((item) => item.students);
    const teacherId = userId(token);
    const [extraSnapshot, availabilityPayload] = await Promise.all([
      extrasForStudents(students, teacherId, token),
      getOptional(`teacher_timetables/${teacherId}`, token),
    ]);
    const snapshots = await Promise.all(
      groupsWithStudents.map(async ({ group, payload, students }) => ({
        students,
        reviews: await reviewsForGroup(group, payload, token),
        lessons: await lessonsForGroup(group, token, courseLessonCache),
      })),
    );
    return Response.json({
      groups,
      students,
      reviews: snapshots.flatMap((item) => item.reviews),
      lessons: snapshots.flatMap((item) => item.lessons),
      extra_lessons: extraSnapshot.items,
      extra_lessons_synced: extraSnapshot.source_available,
      availability: availabilityFromTeacherTimetable(availabilityPayload),
      availability_synced: availabilityPayload !== undefined,
    });
  } catch (error) {
    return Response.json(
      {
        message:
          error instanceof Error
            ? error.message
            : "Não foi possível sincronizar com a Kodland.",
      },
      { status: 502 },
    );
  }
}
