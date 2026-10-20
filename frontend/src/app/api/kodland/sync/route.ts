import { NextRequest } from "next/server";
import {
  enrichKodlandLessons,
  kodlandLessonEntries,
  matchKodlandCourseLesson,
  mergeKodlandLessons,
  type KodlandCourseLesson,
  type KodlandLesson,
} from "@/lib/kodland-lessons";
import { parseGuardianContact } from "@/lib/student-profile";

export const runtime = "nodejs";

type SyncFailureCode =
  | "kodland_invalid_credentials"
  | "kodland_rate_limited"
  | "kodland_session_expired"
  | "kodland_timeout"
  | "kodland_unavailable";

class SyncFailure extends Error {
  constructor(
    public readonly code: SyncFailureCode,
    public readonly status: number,
  ) {
    super(code);
  }
}

const syncReference = (request: NextRequest) => {
  const supplied = request.headers.get("x-sync-id");
  return supplied && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(supplied)
    ? supplied
    : crypto.randomUUID();
};

const syncResponse = (syncId: string, body: Record<string, unknown>, status = 200) =>
  Response.json(body, { status, headers: { "x-sync-id": syncId } });

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
type AttendanceStatus = "PRESENT" | "ABSENT" | "LATE" | "EXCUSED" | "UNKNOWN";
type Attendance = {
  id: string;
  external_class_id: string;
  external_class_name: string;
  external_student_id: string;
  student_name: string;
  lesson_id: string;
  lesson_title: string;
  lesson_date: string;
  start_time: string;
  status: AttendanceStatus;
  recording_url: string;
};
type ExtraLesson = {
  id: string;
  external_student_id: string;
  student_name: string;
  external_class_id: string;
  external_class_name: string;
  /** Kodland's extra-lesson request, which contains the submitted report. */
  request_id: string;
  recording_booking_id: string;
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
  /** True only when every source needed to reconcile this collection replied. */
  source_complete: boolean;
};

const completionFlag = (event: Record<string, unknown>) =>
  event.completed ??
  event.is_completed ??
  event.lesson_completed ??
  event.is_lesson_completed ??
  event.is_passed ??
  event.is_done ??
  event.is_finished ??
  event.is_held ??
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
 * An approved request merely authorizes an extra lesson. A recording is
 * evidence that it happened, even when Kodland has not advanced that request
 * to a completed state yet. Postponed and cancelled lessons remain excluded.
 */
const completedFromEvent = (event: Record<string, unknown>) => {
  const completion = completionFlag(event);
  const status = normalized(
    [
      event.status,
      event.lesson_status,
      event.state,
      event.result,
      event.result_status,
      event.report_status,
      event.outcome,
      record(event.result).status,
    ]
      .map(text)
      .filter(Boolean)
      .join(" "),
  );
  // A cancellation or a reschedule always wins over stale completion flags
  // that can still be present in provider calendar payloads.
  if (/postpon|adiad|reschedul|reagend|moved|cancel/.test(status)) {
    return false;
  }
  // Some agenda payloads keep `completed: false` even after their textual
  // state has advanced to Conducted/Completed. An explicit positive flag is
  // conclusive, while a stale false must not hide other completion evidence.
  if (explicitBoolean(completion) && flag(completion)) return true;

  if (/completed|complete|passed|done|finished|held|conducted|given|realizada|concluida|ministrada/.test(status)) {
    return true;
  }
  if (recordingAvailable(event)) return true;
  return false;
};

const teacherToday = (reference = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(reference);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
};

const teacherTime = (reference = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(reference);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("hour")}:${part("minute")}`;
};

const completedByScheduledDate = (
  event: Record<string, unknown>,
  lessonDate: string,
  today: string,
  reference = new Date(),
) => {
  if (lessonDate > today || !completedFromEvent(event)) return false;
  // A provider may create the event with a premature completed flag. On the
  // current day, wait until its scheduled end before it affects finances.
  // `today` can be injected by reconciliation tests and historical imports;
  // only the actual current date needs the hour-level protection.
  if (lessonDate !== teacherToday(reference)) return true;
  const scheduledEnd = timeOnly(
    event.end_time ?? event.endTime ?? event.end ?? event.end_at ??
      event.endAt ?? event.finish_at ?? event.finishAt,
  );
  return Boolean(scheduledEnd) && scheduledEnd <= teacherTime(reference);
};

const sso = "https://sso.production.kodland.org/";
const api = "https://backoffice.kodland.org/api/v2/";
const zoomServiceApi = "https://zoom-service.kodland.org/";
// The Backoffice web client sends this public integration key with its own
// recording lookup. It is not a teacher credential; teacher credentials stay
// exclusively in the transient Kodland login flow below.
const zoomServicePublicKey = "9df4fa08e2ff50268af2856eb34a79276bf51152c8ffaf429371cdf18c79";
const KODLAND_REQUEST_TIMEOUT_MS = 8_000;
const SYNC_TIME_BUDGET_MS = 45_000;
const KODLAND_CONCURRENCY = 3;
// A material request expands into three Kodland endpoints. Keep the batch
// deliberately small so the browser can split a full import into resilient
// requests instead of one long serverless invocation.
const MATERIAL_REQUEST_BATCH_SIZE = 4;
const MATERIAL_DETAIL_CONCURRENCY = 2;
// Agenda and reviews can fan out to many endpoints. Keep these stages smaller
// than the regular group import so a single user action remains reliable for
// teachers with many students and classes.
const EXTRA_STUDENT_CONCURRENCY = 2;
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
    "attendance",
    "attendances",
    "records",
    "attendance_records",
    "student_attendance",
    "attendance_data",
    "attendance_history",
    "history",
    "absences",
    "students",
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

export const correctionUrlFor = ({
  link,
  taskId,
  studentId,
  groupId,
}: {
  link: string;
  taskId: string;
  studentId: string;
  groupId: string;
}) => {
  const direct = link.trim();
  const absolute = /^https?:\/\//.test(direct)
    ? direct
    : direct
      ? `https://bo.kodland.org${direct}`
      : "";
  const taskMatch = absolute.match(/^(https:\/\/learn\.kodland\.org\/[^/]+\/task\/[^/]+\/check)(?:\/([^/?#]+))?\/?([?#].*)?$/);
  if (taskMatch?.[2]) return absolute;
  if (taskMatch && studentId) return `${taskMatch[1]}/${encodeURIComponent(studentId)}${taskMatch[3] ?? ""}`;
  if (absolute) return absolute;
  if (taskId && studentId) {
    return `https://learn.kodland.org/pt/task/${encodeURIComponent(taskId)}/check/${encodeURIComponent(studentId)}`;
  }
  return `https://bo.kodland.org/groups/${groupId}`;
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

async function fetchKodland(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), KODLAND_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new SyncFailure("kodland_timeout", 504);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

const waitForRetry = async (response: Response) => {
  const retryAfter = Number(response.headers.get("retry-after"));
  const delay = Number.isFinite(retryAfter) && retryAfter > 0
    ? Math.min(retryAfter * 1_000, 1_000)
    : 350;
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
};

async function kodlandLogin(username: string, password: string) {
  const form = new URLSearchParams({ username: username.trim(), password });
  const response = await fetchKodland(`${sso}login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: form,
    cache: "no-store",
  });
  if (!response.ok)
    throw response.status === 401 || response.status === 403
      ? new SyncFailure("kodland_invalid_credentials", 403)
      : response.status === 429
        ? new SyncFailure("kodland_rate_limited", 429)
        : new SyncFailure("kodland_unavailable", 503);
  const payload = (await response.json()) as { access_token?: string };
  if (!payload.access_token)
    throw new Error("A Kodland não retornou uma sessão válida.");
  return payload.access_token;
}

async function get(path: string, token: string) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetchKodland(`${api}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (response.ok) return response.json();
      const retryable = [429, 500, 502, 503, 504].includes(response.status);
      if (retryable && attempt === 0) {
        await waitForRetry(response);
        continue;
      }
      throw response.status === 401 || response.status === 403
        ? new SyncFailure("kodland_session_expired", 502)
        : response.status === 429
          ? new SyncFailure("kodland_rate_limited", 429)
          : new SyncFailure("kodland_unavailable", 503);
    } catch (error) {
      const retryable = error instanceof SyncFailure &&
        (error.code === "kodland_timeout" || error.code === "kodland_unavailable");
      if (retryable && attempt === 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, 350));
        continue;
      }
      if (error instanceof SyncFailure) throw error;
      throw new SyncFailure("kodland_unavailable", 503);
    }
  }
  throw new SyncFailure("kodland_unavailable", 503);
}

async function getOptional(path: string, token: string) {
  try {
    return await get(path, token);
  } catch {
    return null;
  }
}

/**
 * The group endpoints commonly return their first 30 entries. Fetch following
 * pages as well, while stopping if the provider ignores pagination and repeats
 * the same payload. This keeps the calendar complete without an unbounded
 * request fan-out.
 */
export async function completeGroupTimeline(path: string, token: string) {
  const first = await getOptional(`${path}?page=1&page_size=100`, token)
    ?? await getOptional(path, token);
  if (first === null) return null;

  // A group response may expose a short `items` page and keep the complete
  // calendar in a nested `data.schedule`. Do not run it through the generic
  // `list` helper, which intentionally returns only the first matching array.
  const entries = [...kodlandLessonEntries(first)];
  const seen = new Set(entries.map((item) => JSON.stringify(item)));
  for (let page = 2; page <= 10; page += 1) {
    const payload = await getOptional(`${path}?page=${page}&page_size=100`, token);
    if (payload === null) break;
    const next = kodlandLessonEntries(payload);
    const newEntries = next.filter((item) => {
      const identity = JSON.stringify(item);
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
    if (!newEntries.length) break;
    entries.push(...newEntries);
    if (next.length < 100) break;
  }
  return entries;
}

/**
 * The teacher and student schedules describe when an extra was booked, but
 * the actual Zoom recording is exposed by a separate read-only Kodland
 * service, keyed by the booking. `null` means the lookup failed; `false`
 * means that Kodland explicitly returned no recording.
 */
async function recordingAvailableForBooking(bookingId: string): Promise<boolean | null> {
  if (!bookingId) return false;
  try {
    const response = await fetchKodland(
      `${zoomServiceApi}api/zoom_recording/get_videos_by_booking_id/${encodeURIComponent(bookingId)}`,
      {
        headers: {
          "api-key": zoomServicePublicKey,
        },
        cache: "no-store",
      },
    );
    if (response.status === 404) return false;
    if (!response.ok) return null;
    const payload = await response.json();
    return list(payload).length > 0 || recordingAvailable(record(payload));
  } catch {
    return null;
  }
}

/**
 * The Kodland report modal reads this separate resource, keyed by the extra
 * lesson ID (not the UUID of its request). Its `outcome` confirms completion.
 */
export async function extraLessonReportWasCompleted(
  extraLessonId: string,
  token: string,
): Promise<boolean | null> {
  if (!extraLessonId) return false;
  const report = await getOptional(
    `extra_lesson_reports/by_extra_lesson/${encodeURIComponent(extraLessonId)}/`,
    token,
  );
  return report === null ? null : completedFromEvent(record(report));
}

export async function mapWithConcurrency<T, R>(
  values: T[],
  limit: number,
  work: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= values.length) return;
      results[index] = await work(values[index]);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), values.length) }, worker),
  );
  return results;
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
  return mapWithConcurrency(students, KODLAND_CONCURRENCY, async (student) => {
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
  });
}

/** Extra lessons are shown on the student's agenda and become billable only after Kodland marks them as completed. */
export function extrasFromStudentAgenda(
  payload: unknown,
  student: Student,
  today = teacherToday(),
  reference = new Date(),
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
    const completed = completedByScheduledDate(event, lessonDate, today, reference);
    const externalId = text(
      event.extra_lesson_id ??
        event.id ??
        event.lesson_id ??
        event.lessonId ??
        event.event_id ??
        event.eventId,
    );
    const recordingBookingId = text(
      event.booking_id ??
        event.bookingId ??
        record(event.booking).id ??
        event.zoom_booking_id ??
        event.zoomBookingId ??
        event.reservation_id ??
        event.reservationId,
    );
    const requestId = text(
      event.extra_lesson_request_id ??
        event.extraLessonRequestId ??
        event.extra_lesson_id ??
        event.extraLessonId ??
        externalId,
    );
    if (!isExtra || !lessonDate || !externalId) return [];
    return [
      {
        id: `kodland-extra-${student.external_id}-${externalId || index + 1}`,
        external_student_id: student.external_id,
        student_name: student.name,
        external_class_id: student.external_class_id,
        external_class_name: student.external_class_name,
        request_id: requestId,
        recording_booking_id: recordingBookingId,
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
  today = teacherToday(),
  reference = new Date(),
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
    const recordingBookingId = text(
      event.booking_id ??
        event.bookingId ??
        record(event.booking).id ??
        event.zoom_booking_id ??
        event.zoomBookingId ??
        event.reservation_id ??
        event.reservationId,
    );
    const requestId = text(
      event.extra_lesson_request_id ??
        event.extraLessonRequestId ??
        event.extra_lesson_id ??
        event.extraLessonId ??
        externalId,
    );
    return [
      {
        id: `kodland-extra-${externalId || index + 1}`,
        external_student_id: student?.external_id ?? studentId,
        student_name: student?.name || titleName || "Aula extra",
        external_class_id: classId,
        external_class_name: className,
        request_id: requestId,
        recording_booking_id: recordingBookingId,
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
        completed: completedByScheduledDate(event, lessonDate, today, reference),
      },
    ];
  });
}

const providerExtraId = (lesson: ExtraLesson) => {
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
  return externalId;
};
const extraIdentity = (lesson: ExtraLesson) =>
  `${lesson.external_student_id}:${providerExtraId(lesson)}`;

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
  request_id: evidence.request_id || scheduled.request_id,
  recording_booking_id:
    evidence.recording_booking_id || scheduled.recording_booking_id,
  // The teacher's agenda is authoritative for a postponed lesson's slot.
  lesson_date: scheduled.lesson_date || evidence.lesson_date,
  start_time: scheduled.start_time || evidence.start_time,
  end_time: scheduled.end_time || evidence.end_time,
  // Keep the student's richer state label when the calendar has none.
  status: evidence.status || scheduled.status,
  // A scheduled occurrence must never erase an already confirmed completion.
  completed: scheduled.completed || evidence.completed,
});

const normalizedName = (value: string) =>
  normalized(value).replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();

/**
 * Some Kodland calendars expose a display-event ID while the student's
 * schedule exposes the extra-lesson ID. Match that one occurrence by student
 * and slot only when the stable IDs cannot be reconciled.
 */
const sameExtraOccurrence = (
  scheduled: ExtraLesson,
  evidence: ExtraLesson,
) => {
  if (
    scheduled.external_student_id &&
    evidence.external_student_id &&
    scheduled.external_student_id !== evidence.external_student_id
  ) {
    return false;
  }
  if (!scheduled.external_student_id || !evidence.external_student_id) {
    const scheduledName = normalizedName(scheduled.student_name);
    const evidenceName = normalizedName(evidence.student_name);
    if (
      !scheduledName ||
      !evidenceName ||
      (scheduledName !== evidenceName &&
        !scheduledName.includes(evidenceName) &&
        !evidenceName.includes(scheduledName))
    ) {
      return false;
    }
  }
  if (scheduled.lesson_date !== evidence.lesson_date) return false;
  return !scheduled.start_time || !evidence.start_time ||
    scheduled.start_time === evidence.start_time;
};

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
    if (scheduled) {
      merged.set(key, mergeScheduledExtra(scheduled, extra));
      continue;
    }
    const matchingScheduledEntry = [...merged.entries()].find(([, candidate]) =>
      sameExtraOccurrence(candidate, extra),
    );
    if (matchingScheduledEntry) {
      const [scheduledKey, scheduledExtra] = matchingScheduledEntry;
      merged.set(scheduledKey, mergeScheduledExtra(scheduledExtra, extra));
      continue;
    }
    merged.set(key, extra);
  }
  return [...merged.values()];
}

async function extrasForStudents(
  students: Student[],
  teacherId: string,
  token: string,
  pendingStudentIds: string[] = [],
): Promise<SyncCollection<ExtraLesson>> {
  const [teacherSchedule, teacherExtraPayloads] = await Promise.all([
    getOptional(`teacher_timetables/${teacherId}`, token),
    mapWithConcurrency(
      [undefined, ...teacherCalendarWeekDates()],
      2,
      (date) =>
        getOptional(
          `teachers/${teacherId}/get_teacher_extra_lessons_timetable/${
            date ? `?date=${date}` : ""
          }`,
          token,
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
  const scheduledExtras = [
    ...teacherExtraPayloads.flatMap((payload) =>
      extrasFromTeacherAgenda(payload, students),
    ),
    ...fromTeacherSchedule,
  ];
  const candidateIds = new Set([
    ...pendingStudentIds,
    ...scheduledExtras.map((lesson) => lesson.external_student_id).filter(Boolean),
  ]);
  const candidateNames = scheduledExtras
    .map((lesson) => normalized(lesson.student_name).replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const candidateStudents = students.filter((student) => {
    if (candidateIds.has(student.external_id)) return true;
    const studentName = normalized(student.name).replace(/\s+/g, " ").trim();
    return candidateNames.some(
      (name) => name === studentName || name.includes(studentName) || studentName.includes(name),
    );
  });
  const snapshots = await mapWithConcurrency(
    candidateStudents,
    EXTRA_STUDENT_CONCURRENCY,
    async (student) => {
      const agenda = await getOptional(
        `students/${student.external_id}/schedule_view/`,
        token,
      );
      return agenda === null ? null : extrasFromStudentAgenda(agenda, student);
    },
  );
  const reconciledExtras = mergeExtraLessons(
    scheduledExtras,
    snapshots.flatMap((items) => items ?? []),
  );
  const recordingChecks = await mapWithConcurrency(
    reconciledExtras.filter((lesson) =>
      !lesson.completed &&
      lesson.lesson_date <= teacherToday() &&
      Boolean(lesson.recording_booking_id),
    ),
    EXTRA_STUDENT_CONCURRENCY,
    async (lesson) => ({
      id: lesson.id,
      available: await recordingAvailableForBooking(lesson.recording_booking_id),
    }),
  );
  const recordingsByExtraId = new Map(
    recordingChecks.map((check) => [check.id, check.available]),
  );
  const reportChecks = await mapWithConcurrency(
    reconciledExtras.filter((lesson) =>
      !lesson.completed &&
      lesson.lesson_date <= teacherToday() &&
      Boolean(providerExtraId(lesson)),
    ),
    EXTRA_STUDENT_CONCURRENCY,
    async (lesson) => ({
      id: lesson.id,
      completed: await extraLessonReportWasCompleted(providerExtraId(lesson), token),
    }),
  );
  const reportsByExtraId = new Map(
    reportChecks.map((check) => [check.id, check.completed]),
  );
  const items = reconciledExtras.map((lesson) => ({
    ...lesson,
    completed:
      lesson.completed ||
      recordingsByExtraId.get(lesson.id) === true ||
      reportsByExtraId.get(lesson.id) === true,
  }));
  const sourceComplete =
    teacherExtraPayloads.every((payload) => payload !== null) &&
    snapshots.every((items) => items !== null) &&
    recordingChecks.every((check) => check.available !== null) &&
    reportChecks.every((check) => check.completed !== null);
  return {
    items,
    source_available:
      teacherSchedule !== null ||
      teacherExtraPayloads.some((payload) => payload !== null) ||
      snapshots.some((items) => (items?.length ?? 0) > 0),
    source_complete: sourceComplete,
  };
}

async function reviewsForGroup(
  group: Group,
  token: string,
): Promise<Review[]> {
    const lessons = list(
      await get(`student_groups/${group.external_id}/lessons/`, token),
    ).filter((value) => record(value).lesson_passed === true);
    const results = await mapWithConcurrency(
      lessons,
      KODLAND_CONCURRENCY,
      async (value) => {
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
            const link = text(
              data.link_to_service ??
                data.linkToService ??
                data.correction_url ??
                data.correctionUrl ??
                data.task_url ??
                data.taskUrl ??
                data.url ??
                task.link_to_service ??
                task.linkToService ??
                task.task_url ??
                task.taskUrl ??
                task.url,
            );
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
                correction_url: correctionUrlFor({
                  link,
                  taskId,
                  studentId,
                  groupId: group.external_id,
                }),
              },
            ];
          });
        });
      },
    );
    return results.flat();
}

export const attendanceStatus = (value: Record<string, unknown>): AttendanceStatus => {
  const statusValue = value.attendance_status ?? value.attendanceStatus ?? value.presence_status ?? value.presenceStatus;
  if (statusValue === 0 || statusValue === "0") return "ABSENT";
  if (statusValue === 1 || statusValue === "1") return "EXCUSED";
  if (statusValue === 2 || statusValue === "2") return "PRESENT";
  if (statusValue === 9 || statusValue === "9") return "UNKNOWN";
  const raw = text(
    value.attendance_status ?? value.attendanceStatus ?? value.presence_status ??
      value.presenceStatus ?? value.absence_status ?? value.absenceStatus ??
      value.attendance_state ?? value.attendanceState ?? value.attendance_mark ??
      value.attendanceMark ?? value.presence_mark ?? value.presenceMark ??
      value.mark ?? value.status ?? value.state ?? value.attendance,
  ).toLowerCase();
  const present = value.present ?? value.is_present ?? value.isPresent ?? value.attended ?? value.was_present ?? value.did_attend ?? value.didAttend;
  const absent = value.absent ?? value.is_absent ?? value.isAbsent ?? value.was_absent ?? value.did_not_attend ?? value.didNotAttend ?? value.unexcused_absence ?? value.unexcusedAbsence;
  if (absent === true || absent === 1 || absent === "true") return "ABSENT";
  if (/absent|absence|falt|no.?show|missed|did.?not.?attend|not.?present|not.?attend|unexcused|unjustified|not.?justif|sem.?justif/.test(raw)) return "ABSENT";
  if (/excused|justif/.test(raw)) return "EXCUSED";
  if (present === true || present === 1 || present === "true") return "PRESENT";
  if (present === false || present === 0 || present === "false") return "ABSENT";
  if (/late|atras/.test(raw)) return "LATE";
  if (/present|attend|particip/.test(raw)) return "PRESENT";
  return "UNKNOWN";
};

/**
 * The Kodland backoffice renders the teacher's presence grid from the main
 * student payload. Each module contains lessons_data with attendance_status
 * codes (0 absent, 1 excused, 2 present, 9 not marked).
 */
export function attendanceFromStudentsPayload(payload: unknown, group: Group): Attendance[] {
  return list(payload).flatMap((value) => {
    const studentRecord = record(value);
    const mainInfo = record(studentRecord.main_info ?? studentRecord.student ?? studentRecord.student_info);
    const studentId = text(mainInfo.student_id ?? mainInfo.id ?? studentRecord.student_id ?? studentRecord.studentId);
    const studentName = text(mainInfo.full_name ?? mainInfo.name ?? studentRecord.student_name ?? studentRecord.studentName);
    if (!studentId || !studentName) return [];
    return list(studentRecord.progress_info).flatMap((moduleValue) => {
      const moduleInfo = record(moduleValue);
      const moduleNumber = text(moduleInfo.module_number ?? moduleInfo.moduleNumber ?? moduleInfo.number);
      const lessons = Array.isArray(moduleInfo.lessons_data) ? moduleInfo.lessons_data : [];
      return lessons.flatMap((lessonValue, lessonIndex) => {
        const lesson = record(lessonValue);
        if (lesson.attendance_status === null || lesson.attendance_status === undefined) return [];
        const lessonId = text(lesson.lesson_id ?? lesson.lessonId ?? lesson.id);
        if (!lessonId) return [];
        const lessonNumber = String(lessonIndex + 1);
        const lessonDate = dateOnly(lesson.lesson_date ?? lesson.lessonDate ?? lesson.date ?? lesson.start_at ?? lesson.startAt);
        const suppliedTitle = text(lesson.lesson_title ?? lesson.lessonTitle ?? lesson.title ?? lesson.name);
        const title = moduleNumber
          ? `Aula M${moduleNumber}.L${lessonNumber}`
          : suppliedTitle && suppliedTitle.toLocaleLowerCase() !== "aula"
          ? suppliedTitle
          : `Aula L${lessonNumber}`;
        return [{
          id: `kodland-attendance-${group.external_id}-${studentId}-${lessonId}`,
          external_class_id: group.external_id,
          external_class_name: group.title,
          external_student_id: studentId,
          student_name: studentName,
          lesson_id: lessonId,
          lesson_title: title,
          lesson_date: lessonDate,
          start_time: timeOnly(lesson.start_time ?? lesson.startTime ?? lesson.start_at ?? lesson.startAt),
          status: attendanceStatus(lesson),
          recording_url: "",
        }];
      });
    });
  });
}

async function attendanceForGroup(group: Group, token: string): Promise<Attendance[]> {
  const endpoints = [
    `student_groups/${group.external_id}/attendance/`,
    `student_groups/${group.external_id}/attendance`,
    `student_groups/${group.external_id}/attendance_history/`,
    `student_groups/${group.external_id}/students_attendance/`,
  ];
  let payload: unknown = null;
  for (const endpoint of endpoints) {
    payload = await getOptional(endpoint, token);
    if (payload !== null) break;
  }
  const studentsPayload = await getOptional(`student_groups/${group.external_id}/get_students_main_data`, token);
  const fromStudentGrid = studentsPayload ? attendanceFromStudentsPayload(studentsPayload, group) : [];
  const fromAttendanceEndpoint = payload === null ? [] : list(payload).flatMap((value) => {
    const container = record(value);
    const containerStudent = record(container.student ?? container.student_info ?? container.user ?? container.main_info);
    const nestedRecords = [
      "attendance", "attendances", "attendance_records", "student_attendance",
      "attendance_data", "records", "history", "absences", "lessons",
    ].flatMap((key) => Array.isArray(container[key]) ? container[key] : []);
    const records = nestedRecords.length ? nestedRecords : [container];
    return records.flatMap((nestedValue) => {
      const item = record(nestedValue);
      const student = record(item.student ?? item.student_info ?? item.user ?? containerStudent);
      const lesson = record(item.lesson ?? item.lesson_info ?? item.class_lesson ?? item.lesson_data);
      const studentId = text(item.student_id ?? item.studentId ?? item.user_id ?? student.id ?? student.student_id ?? container.student_id ?? container.studentId);
      const studentName = text(item.student_name ?? item.studentName ?? item.full_name ?? student.name ?? student.full_name ?? container.student_name ?? container.studentName);
      const lessonId = text(item.lesson_id ?? item.lessonId ?? item.event_id ?? lesson.id ?? lesson.lesson_id);
      const lessonDate = dateOnly(item.lesson_date ?? item.lessonDate ?? item.date ?? item.start_at ?? item.startAt ?? lesson.date ?? lesson.lesson_date ?? container.lesson_date ?? container.lessonDate);
    if (!studentId || !studentName || (!lessonId && !lessonDate)) return [];
      const recording = text(item.recording_url ?? item.recordingUrl ?? item.video_url ?? item.videoUrl ?? item.recording ?? lesson.recording_url ?? lesson.recordingUrl);
      return [{
        id: `kodland-attendance-${group.external_id}-${studentId}-${lessonId || lessonDate}`,
        external_class_id: group.external_id,
        external_class_name: group.title,
        external_student_id: studentId,
        student_name: studentName,
        lesson_id: lessonId || `${group.external_id}-${lessonDate}`,
        lesson_title: text(item.lesson_title ?? item.lessonTitle ?? item.title ?? lesson.title ?? lesson.lesson_title) || "Aula",
        lesson_date: lessonDate,
        start_time: timeOnly(item.start_time ?? item.startTime ?? item.start_at ?? item.startAt ?? lesson.start_time),
        status: attendanceStatus(item),
        recording_url: /^https?:\/\//i.test(recording) ? recording : "",
      }];
    });
  });
  return [...new Map([...fromStudentGrid, ...fromAttendanceEndpoint].map((item) => [item.id, item])).values()];
}

type CourseLessonCache = {
  catalog: Map<string, Promise<KodlandCourseLesson[]>>;
};

async function courseLessons(
  courseId: string,
  token: string,
  cache: CourseLessonCache,
  required = false,
): Promise<KodlandCourseLesson[]> {
  if (!courseId) return [];
  let catalogPromise = cache.catalog.get(courseId);
  if (!catalogPromise) {
    catalogPromise = (async () => {
      const payload = await (required ? get : getOptional)(
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
  return catalogPromise;
}

async function lessonsForGroup(
  group: Group,
  token: string,
  cache: CourseLessonCache,
): Promise<KodlandLesson[]> {
  // Kodland's lesson endpoints paginate at 30 entries by default. A group can
  // have a longer timeline (the current group has 40), so collect every page
  // before reconciling attendance.
  const [schedule, lessons] = await Promise.all([
    completeGroupTimeline(`student_groups/${group.external_id}/schedule_view/`, token),
    completeGroupTimeline(`student_groups/${group.external_id}/lessons/`, token),
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
    const catalogLesson = matchKodlandCourseLesson(lesson, catalog);
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
  ).map((lesson) => {
    const sourceLesson = catalog.find((item) => item.id === lesson.id)
      ?? catalog.find((item) => item.course_index === lesson.course_index);
    return {
      ...lesson,
      source_lesson_id: sourceLesson?.id ?? "",
      materials_status: sourceLesson ? "pending" as const : "unavailable" as const,
    };
  });
}

const scheduleCode = (value: string) =>
  value.match(/M\s*(\d+)\s*\.?\s*L\s*(\d+)/i);

/** The calendar defines the class occurrence; attendance only defines the
 * student's status in that occurrence. */
function scheduledLessonForAttendance(item: Attendance, lessons: KodlandLesson[]) {
  const sameClass = lessons.filter((lesson) => lesson.external_class_id === item.external_class_id);
  const dated = sameClass.filter((lesson) => Boolean(dateOnly(lesson.lesson_date)));
  const source = dated.length ? dated : sameClass;
  const direct = source.find((lesson) => lesson.id === item.lesson_id || lesson.source_lesson_id === item.lesson_id);
  if (direct) return direct;

  const courseIndex = /^\d+$/.test(item.lesson_id) ? Number(item.lesson_id) : 0;
  const indexed = courseIndex ? source.find((lesson) => lesson.course_index === courseIndex) : undefined;
  if (indexed) return indexed;

  const code = scheduleCode(item.lesson_title);
  if (code) {
    const byCode = source.find((lesson) => scheduleCode(`${lesson.schedule_code ?? ""} ${lesson.title}`)?.[0]
      && scheduleCode(`${lesson.schedule_code ?? ""} ${lesson.title}`)?.[1] === code[1]
      && scheduleCode(`${lesson.schedule_code ?? ""} ${lesson.title}`)?.[2] === code[2]);
    if (byCode) return byCode;
  }

  return source.find((lesson) =>
    Boolean(item.lesson_date && dateOnly(lesson.lesson_date) === item.lesson_date && (!item.start_time || lesson.start_time === item.start_time)),
  );
}

function attachAttendanceSchedule(items: Attendance[], lessons: KodlandLesson[]): Attendance[] {
  return items.map((item) => {
    const scheduled = scheduledLessonForAttendance(item, lessons);
    if (!scheduled) return item;
    return {
      ...item,
      lesson_id: scheduled.source_lesson_id || scheduled.id || item.lesson_id,
      lesson_title: scheduled.title || item.lesson_title,
      lesson_date: dateOnly(scheduled.lesson_date) || item.lesson_date,
      start_time: scheduled.start_time || item.start_time,
      recording_url: scheduled.recording_url || item.recording_url,
    };
  });
}

export async function POST(request: NextRequest) {
  const syncId = syncReference(request);
  const startedAt = Date.now();
  let stage = "firebase_auth";
  const trace = (event: string, counts: Record<string, number> = {}) => {
    console.info("[kodland-sync]", JSON.stringify({
      syncId,
      event,
      stage,
      durationMs: Date.now() - startedAt,
      ...counts,
    }));
  };
  const runStage = async <T,>(
    name: string,
    operation: () => Promise<T>,
    counts: (result: T) => Record<string, number> = () => ({}),
  ): Promise<T> => {
    stage = name;
    const stageStartedAt = Date.now();
    const remaining = SYNC_TIME_BUDGET_MS - (stageStartedAt - startedAt);
    if (remaining <= 0) throw new SyncFailure("kodland_timeout", 504);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const budget = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new SyncFailure("kodland_timeout", 504)),
        remaining,
      );
    });
    let result: T;
    try {
      result = await Promise.race([operation(), budget]);
    } finally {
      if (timer) clearTimeout(timer);
    }
    console.info("[kodland-sync]", JSON.stringify({
      syncId,
      event: "stage_complete",
      stage,
      durationMs: Date.now() - startedAt,
      stageDurationMs: Date.now() - stageStartedAt,
      ...counts(result),
    }));
    return result;
  };
  try {
    trace("started");
    if (!(await runStage("firebase_auth", () => requireFirebaseUser(request)))) {
      trace("unauthorized");
      return syncResponse(syncId, { code: "firebase_session_expired" }, 401);
    }
    stage = "request_validation";
    let body: {
      username?: string;
      password?: string;
      mode?: "essential" | "schedule" | "corrections" | "materials" | "profiles";
      group_id?: string;
      source_lesson_id?: string;
      material_requests?: Array<{
        group_id?: string;
        source_lesson_id?: string;
      }>;
      pending_extra_student_ids?: string[];
      correction_group_ids?: string[];
    };
    try {
      body = (await request.json()) as typeof body;
    } catch {
      trace("invalid_request");
      return syncResponse(syncId, { code: "invalid_request" }, 400);
    }
    if (!body) {
      trace("invalid_request");
      return syncResponse(syncId, { code: "missing_credentials" }, 400);
    }
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!username || !password) {
      trace("invalid_request");
      return syncResponse(syncId, { code: "missing_credentials" }, 400);
    }
    const mode = body.mode ?? "essential";
    if (!["essential", "schedule", "corrections", "materials", "profiles"].includes(mode)) {
      trace("invalid_request");
      return syncResponse(syncId, { code: "invalid_request" }, 400);
    }
    const token = await runStage("kodland_auth", () => kodlandLogin(username, password));
    const groups = await runStage("groups", () => groupsForTeacher(userId(token), token),
      (result) => ({ groupCount: result.length }));
    const active = groups.filter((group) => !group.archived);
    const emptyCollections = () => ({
      groups: [] as Group[],
      students: [] as Student[],
      reviews: [] as Review[],
      attendance: [] as Attendance[],
      lessons: [] as KodlandLesson[],
      extra_lessons: [] as ExtraLesson[],
      availability: [] as Availability[],
      extra_lessons_synced: false,
      extra_lessons_complete: false,
      availability_synced: false,
    });
    if (mode === "materials") {
      const suppliedRequests = Array.isArray(body.material_requests)
        ? body.material_requests
            .map((item) => ({
              group_id: text(item?.group_id),
              source_lesson_id: text(item?.source_lesson_id),
            }))
            .filter((item) => item.group_id && item.source_lesson_id)
        : [];
      const requests = suppliedRequests.length
        ? suppliedRequests
        : [{
            group_id: text(body.group_id),
            source_lesson_id: text(body.source_lesson_id),
          }];
      const uniqueRequests = [...new Map(
        requests.map((item) => [`${item.group_id}:${item.source_lesson_id}`, item]),
      ).values()];
      if (!uniqueRequests.length || uniqueRequests.length > MATERIAL_REQUEST_BATCH_SIZE) {
        trace("invalid_material_request");
        return syncResponse(syncId, { code: "invalid_request" }, 400);
      }
      const requestedGroups = uniqueRequests.map((request) => ({
        ...request,
        group: active.find((item) => item.external_id === request.group_id),
      }));
      if (requestedGroups.some((request) => !request.group?.course_id)) {
        trace("material_denied");
        return syncResponse(syncId, { code: "material_not_authorized" }, 403);
      }
      const cache: CourseLessonCache = { catalog: new Map() };
      const prepared = await runStage("material_catalog", () => mapWithConcurrency(
        requestedGroups,
        KODLAND_CONCURRENCY,
        async (request) => {
          const group = request.group!;
          const catalog = await courseLessons(group.course_id, token, cache, true);
          return {
            ...request,
            group,
            source: catalog.find((lesson) => lesson.id === request.source_lesson_id),
          };
        },
      ), (result) => ({ materialRequestCount: result.length }));
      if (prepared.some((request) => !request.source)) {
        trace("material_denied");
        return syncResponse(syncId, { code: "material_not_authorized" }, 403);
      }
      const detailCache = new Map<string, Promise<{
        slides_url: string;
        guide_url: string;
        homework_url: string;
        homework_title: string;
        classroom_tasks: KodlandLesson["classroom_tasks"];
        detail_count: number;
      }>>();
      const loadDetails = (request: typeof prepared[number]) => {
        const source = request.source!;
        const key = `${request.group.course_id}:${source.id}`;
        let details = detailCache.get(key);
        if (!details) {
          details = (async () => {
            const [materials, homework, classroom] = await Promise.all([
              get(`materials?lesson=${encodeURIComponent(source.id)}`, token),
              get(`tasks/get_tasks_list?lesson=${encodeURIComponent(source.id)}&is_hw=true`, token),
              get(`tasks/get_tasks_list?lesson=${encodeURIComponent(source.id)}&is_hw=false`, token),
            ]);
            const enriched = enrichKodlandLessons([{
              id: source.id,
              external_class_id: request.group.external_id,
              external_class_name: request.group.title,
              lesson_number: source.lesson_number,
              course_index: source.course_index,
              title: source.title,
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
            }], [{
              ...source,
              materials: list(materials),
              homework: list(homework),
              classroom: list(classroom),
            }], request.group.course_id)[0];
            return {
              slides_url: enriched?.slides_url ?? "",
              guide_url: enriched?.guide_url ?? "",
              homework_url: enriched?.homework_url ?? "",
              homework_title: enriched?.homework_title ?? "",
              classroom_tasks: enriched?.classroom_tasks ?? [],
              detail_count: list(materials).length + list(homework).length + list(classroom).length,
            };
          })();
          detailCache.set(key, details);
        }
        return details;
      };
      const materialResults = await runStage("material_details", () => mapWithConcurrency(
        prepared,
        MATERIAL_DETAIL_CONCURRENCY,
        async (request) => {
          const source = request.source!;
          const details = await loadDetails(request);
          return {
            group_id: request.group.external_id,
            source_lesson_id: source.id,
            slides_url: details.slides_url,
            guide_url: details.guide_url,
            homework_url: details.homework_url,
            homework_title: details.homework_title,
            classroom_tasks: details.classroom_tasks,
            materials_status: details.detail_count ? "ready" as const : "empty" as const,
          };
        },
      ), (result) => ({
        materialCount: result.length,
        materialResourceCount: [...detailCache.values()].length,
      }));
      trace("completed", { materialCount: materialResults.length });
      return syncResponse(syncId, {
        ...emptyCollections(),
        material: materialResults[0],
        materials: materialResults,
      });
    }
    if (mode === "corrections") {
      const requestedGroupIds = new Set(
        Array.isArray(body.correction_group_ids)
          ? body.correction_group_ids
              .filter((id): id is string => typeof id === "string")
          : [],
      );
      const correctionGroups = requestedGroupIds.size
        ? active.filter((group) => requestedGroupIds.has(group.external_id))
        : active;
      const courseLessonCache: CourseLessonCache = { catalog: new Map() };
      const snapshots = await runStage("reviews", () => mapWithConcurrency(
        correctionGroups,
        1,
        async (group) => {
          const [reviews, attendance, lessons] = await Promise.all([
            reviewsForGroup(group, token),
            attendanceForGroup(group, token),
            lessonsForGroup(group, token, courseLessonCache),
          ]);
          return { reviews, attendance: attachAttendanceSchedule(attendance, lessons), lessons };
        },
      ), (result) => ({
        reviewCount: result.reduce((total, item) => total + item.reviews.length, 0),
        attendanceCount: result.reduce((total, item) => total + item.attendance.length, 0),
        lessonCount: result.reduce((total, item) => total + item.lessons.length, 0),
      }));
      const items = snapshots.flatMap((item) => item.reviews);
      const attendanceItems = snapshots.flatMap((item) => item.attendance);
      const lessons = snapshots.flatMap((item) => item.lessons);
      trace("completed", { groupCount: correctionGroups.length, reviewCount: items.length, attendanceCount: attendanceItems.length, lessonCount: lessons.length });
      return syncResponse(syncId, {
        ...emptyCollections(),
        reviews: items,
        attendance: attendanceItems,
        lessons,
        review_group_ids: correctionGroups.map((group) => group.external_id),
        attendance_group_ids: correctionGroups.map((group) => group.external_id),
      });
    }
    const profileCache = new Map<
      string,
      ReturnType<typeof parseGuardianContact>
    >();
    const courseLessonCache: CourseLessonCache = {
      catalog: new Map(),
    };
    // Keep the teacher calendar ahead of the full course-material import. The
    // calendar is what drives availability and booked extras, while the
    // material import can make hundreds of auxiliary requests.
    const groupsWithStudents = await runStage("students", () => mapWithConcurrency(
      active,
      KODLAND_CONCURRENCY,
      async (group) => {
        const payload = await get(
          `student_groups/${group.external_id}/get_students_main_data/`,
          token,
        );
        const basicStudents = studentsFromPayload(payload, group);
        const students = mode === "profiles"
          ? await studentsWithProfiles(basicStudents, token, profileCache)
          : basicStudents;
        return {
          group,
          payload,
          students,
        };
      },
    ), (result) => ({ activeGroupCount: result.length, studentCount: result.reduce((total, item) => total + item.students.length, 0) }));
    const students = groupsWithStudents.flatMap((item) => item.students);
    if (mode === "profiles") {
      trace("completed", { groupCount: active.length, studentCount: students.length });
      return syncResponse(syncId, { ...emptyCollections(), students });
    }
    const teacherId = userId(token);
    const [extraSnapshot, availabilityPayload] = await runStage("calendar", () => Promise.all([
      extrasForStudents(
        students,
        teacherId,
        token,
        Array.isArray(body.pending_extra_student_ids)
          ? body.pending_extra_student_ids
              .filter((id): id is string => typeof id === "string")
              .slice(0, students.length)
          : [],
      ),
      getOptional(`teacher_timetables/${teacherId}`, token),
    ]), ([extras]) => ({ extraLessonCount: extras.items.length }));
    if (mode === "schedule") {
      const snapshots = await runStage("lessons", () => mapWithConcurrency(
        groupsWithStudents,
        KODLAND_CONCURRENCY,
        async ({ group }) => ({
          lessons: await lessonsForGroup(group, token, courseLessonCache),
        }),
      ), (result) => ({
        lessonCount: result.reduce((total, item) => total + item.lessons.length, 0),
      }));
      trace("completed", {
        groupCount: groups.length,
        studentCount: students.length,
        extraLessonCount: extraSnapshot.items.length,
        lessonCount: snapshots.reduce((total, item) => total + item.lessons.length, 0),
      });
      return syncResponse(syncId, {
        groups,
        students,
        reviews: [],
        lessons: snapshots.flatMap((item) => item.lessons),
        extra_lessons: extraSnapshot.items,
        extra_lessons_synced: extraSnapshot.source_available,
        extra_lessons_complete: extraSnapshot.source_complete,
        availability: availabilityFromTeacherTimetable(availabilityPayload),
        availability_synced: availabilityPayload !== null,
      });
    }
    const snapshots = await runStage("lessons", () => mapWithConcurrency(
      groupsWithStudents,
      KODLAND_CONCURRENCY,
      async ({ group }) => ({
        lessons: await lessonsForGroup(group, token, courseLessonCache),
      }),
    ), (result) => ({
      lessonCount: result.reduce((total, item) => total + item.lessons.length, 0),
    }));
    stage = "response";
    const response = syncResponse(syncId, {
      groups,
      students,
      reviews: [],
      lessons: snapshots.flatMap((item) => item.lessons),
      extra_lessons: extraSnapshot.items,
      extra_lessons_synced: extraSnapshot.source_available,
      extra_lessons_complete: extraSnapshot.source_complete,
      availability: availabilityFromTeacherTimetable(availabilityPayload),
      availability_synced: availabilityPayload !== null,
    });
    trace("completed", {
      groupCount: groups.length,
      studentCount: students.length,
      reviewCount: 0,
      lessonCount: snapshots.reduce((total, item) => total + item.lessons.length, 0),
    });
    return response;
  } catch (error) {
    const known = error instanceof SyncFailure ? error : null;
    const status = known?.status ?? 502;
    const code = known?.code ?? "unexpected_sync_failure";
    console.error("[kodland-sync]", JSON.stringify({
      syncId,
      event: "failed",
      stage,
      durationMs: Date.now() - startedAt,
      code,
      status,
    }));
    return syncResponse(syncId, { code }, status);
  }
}
