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
  if (items.length || depth >= 2) return items;
  return Object.values(record(value)).flatMap((item) =>
    Array.isArray(item) ? item : scheduleItems(item, depth + 1),
  );
};
const number = (value: unknown) =>
  Number.isFinite(Number(value)) ? Number(value) : 0;
const flag = (value: unknown) =>
  value === true || value === 1 || value === "1" || value === "true";
const dateOnly = (value: unknown) =>
  text(value).match(/^\d{4}-\d{2}-\d{2}/)?.[0] ?? "";
const timeOnly = (value: unknown) =>
  text(value)
    .match(/\b\d{1,2}:\d{2}(?::\d{2})?\b/)?.[0]
    .slice(0, 5) ?? "";

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
function extrasFromStudentAgenda(
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
        event.start_at ??
        event.startAt ??
        event.datetime,
    );
    const status = text(event.status ?? event.lesson_status ?? event.state);
    const completed =
      flag(
        event.completed ??
          event.is_completed ??
          event.lesson_passed ??
          event.passed,
      ) ||
      /completed|complete|passed|done|finished|held/.test(status.toLowerCase());
    const externalId = text(
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
            event.start_at ??
            event.startAt ??
            event.datetime,
        ),
        end_time: timeOnly(
          event.end_time ??
            event.endTime ??
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

async function extrasForStudents(
  students: Student[],
  teacherId: string,
  token: string,
): Promise<ExtraLesson[]> {
  const [snapshots, teacherSchedule] = await Promise.all([
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
  return Array.from(
    new Map(
      [...snapshots.flat(), ...fromTeacherSchedule].map((lesson) => [
        lesson.id,
        lesson,
      ]),
    ).values(),
  );
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
};

async function courseLessons(
  courseId: string,
  token: string,
  scheduled: KodlandLesson[],
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
          };
        })
        .filter((value): value is KodlandCourseLesson => Boolean(value));
    })();
    cache.catalog.set(courseId, catalogPromise);
  }
  const catalog = await catalogPromise;
  const normalizedTitle = (value: string) =>
    value.toLocaleLowerCase().replace(/[^a-z0-9]+/gi, "");
  const relevant = scheduled
    .map(
      (lesson) =>
        catalog.find((candidate) => candidate.id === lesson.id) ??
        (lesson.lesson_number > 0
          ? catalog.find(
              (candidate) => candidate.lesson_number === lesson.lesson_number,
            )
          : undefined) ??
        catalog.find(
          (candidate) =>
            normalizedTitle(candidate.title) === normalizedTitle(lesson.title),
        ),
    )
    .filter(
      (value, index, values): value is KodlandCourseLesson =>
        Boolean(value) &&
        values.findIndex((item) => item?.id === value?.id) === index,
    );
  return Promise.all(
    relevant.map(async (lesson) => {
      const key = `${courseId}:${lesson.id}`;
      let details = cache.details.get(key);
      if (!details) {
        details = (async () => {
          const [materials, homework] = await Promise.all([
            getOptional(
              `materials?lesson=${encodeURIComponent(lesson.id)}`,
              token,
            ),
            getOptional(
              `tasks/get_tasks_list?lesson=${encodeURIComponent(lesson.id)}&is_hw=true`,
              token,
            ),
          ]);
          return {
            ...lesson,
            materials: list(materials),
            homework: list(homework),
          };
        })();
        cache.details.set(key, details);
      }
      return details;
    }),
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
  const ordered = [...merged].sort((a, b) =>
    `${a.lesson_date} ${a.start_time}`.localeCompare(
      `${b.lesson_date} ${b.start_time}`,
    ),
  );
  const next =
    ordered.find((lesson) => !lesson.lesson_passed) ?? ordered.at(-1);
  const previous = ordered.filter((lesson) => lesson.lesson_passed).slice(-3);
  const materialLessons = [...previous, next].filter(
    (lesson): lesson is KodlandLesson => Boolean(lesson),
  );
  return enrichKodlandLessons(
    merged,
    await courseLessons(group.course_id, token, materialLessons, cache),
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
    };
    const snapshots = await Promise.all(
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
          students,
          reviews: await reviewsForGroup(group, payload, token),
          lessons: await lessonsForGroup(group, token, courseLessonCache),
        };
      }),
    );
    const students = snapshots.flatMap((item) => item.students);
    const extraLessons = await extrasForStudents(
      students,
      userId(token),
      token,
    );
    return Response.json({
      groups,
      students,
      reviews: snapshots.flatMap((item) => item.reviews),
      lessons: snapshots.flatMap((item) => item.lessons),
      extra_lessons: extraLessons,
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
