import { KodlandCredentials, KodlandGroupImport, KodlandLessonImport, KodlandLessonMaterialLinks, KodlandPendingReviewImport, KodlandStudentImport, enrichKodlandStudentFromDetail, normalizeKodlandGroup, parseKodlandGroupStudentsPayload, parseKodlandLessonsPayload, parseKodlandPendingReviewsPayload, parseKodlandRecordingPayload, parseKodlandStudyGuideMaterialsPayload } from './kodland';

const ssoBaseUrl = 'https://sso.production.kodland.org/';
const backofficeBaseUrl = 'https://backoffice.kodland.org/api/v2/';
const pageSize = 100;

type FetchLike = typeof fetch;

type TokenResponse = {
  access_token: string;
  refresh_token?: string;
};

type TeacherGroupsResponse = {
  count?: number;
  next?: string | null;
  results?: unknown[];
};

type TokenSession = {
  accessToken: string;
  refreshToken?: string;
};

export type KodlandRemoteSnapshot = {
  teacherId: string;
  groups: KodlandGroupImport[];
  students: KodlandStudentImport[];
  pendingReviews: KodlandPendingReviewImport[];
  lessons: KodlandLessonImport[];
};

export type KodlandPendingReviewGroup = Pick<KodlandGroupImport, 'externalId' | 'title' | 'archived'>;
export type KodlandLessonMaterialsGroup = Pick<KodlandGroupImport, 'externalId' | 'title' | 'courseId' | 'courseName' | 'archived'>;

type KodlandSnapshotOptions = {
  includeMaterials?: boolean;
};

export async function fetchKodlandSnapshot(credentials: KodlandCredentials, fetcher: FetchLike = fetch, options: KodlandSnapshotOptions = {}): Promise<KodlandRemoteSnapshot> {
  const tokens = await loginKodland(credentials, fetcher);
  const session = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  const teacherId = getUserIdFromAccessToken(session.accessToken);
  const groups = await fetchTeacherGroups(teacherId, session, fetcher);
  const studyGuideMaterialsByCourseLesson = new Map<string, KodlandLessonMaterialLinks>();
  const activeGroupSnapshots = [];
  for (const group of groups.filter((item) => !item.archived)) {
    const payload = await getJson(`student_groups/${group.externalId}/get_students_main_data/`, session, fetcher);
    const groupStudents = parseKodlandGroupStudentsPayload(payload, group);
    const lessonsPayload = await fetchLessonsPayload(group, session, fetcher);
    const coursePayload = await fetchCoursePayload(group, session, fetcher);
    const materialsPayloads = options.includeMaterials === false
      ? new Map<string, KodlandLessonMaterialLinks>()
      : await fetchStudyGuideMaterialsForLessons(group, lessonsPayload, studyGuideMaterialsByCourseLesson, session, fetcher);
    const recordingUrls = await fetchRecordingUrlsForLessons(group, lessonsPayload, session, fetcher);
    const [students, pendingReviews] = await Promise.all([
      Promise.all(groupStudents.map((student) => fetchStudentDetail(student, session, fetcher))),
      fetchPendingReviewsForGroup(group, payload, lessonsPayload, session, fetcher),
    ]);
    activeGroupSnapshots.push({ students, pendingReviews, lessons: parseKodlandLessonsPayload(group, lessonsPayload, coursePayload, materialsPayloads, recordingUrls) });
  }
  return {
    teacherId,
    groups,
    students: activeGroupSnapshots.flatMap((snapshot) => snapshot.students),
    pendingReviews: activeGroupSnapshots.flatMap((snapshot) => snapshot.pendingReviews),
    lessons: activeGroupSnapshots.flatMap((snapshot) => snapshot.lessons),
  };
}

export async function fetchKodlandLessonMaterials(
  credentials: KodlandCredentials,
  groups: KodlandLessonMaterialsGroup[],
  fetcher: FetchLike = fetch,
): Promise<KodlandLessonImport[]> {
  const tokens = await loginKodland(credentials, fetcher);
  const session = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  const studyGuideMaterialsByCourseLesson = new Map<string, KodlandLessonMaterialLinks>();
  const lessonsByGroup = await Promise.all(groups.filter((group) => !group.archived).map(async (group) => {
    const groupImport = lessonMaterialsGroupToImport(group);
    const lessonsPayload = await fetchLessonsPayload(groupImport, session, fetcher);
    const coursePayload = await fetchCoursePayload(groupImport, session, fetcher);
    const materialsPayloads = await fetchStudyGuideMaterialsForLessons(groupImport, lessonsPayload, studyGuideMaterialsByCourseLesson, session, fetcher);
    return parseKodlandLessonsPayload(groupImport, lessonsPayload, coursePayload, materialsPayloads);
  }));
  return lessonsByGroup.flat();
}

export async function fetchKodlandPendingReviews(
  credentials: KodlandCredentials,
  groups: KodlandPendingReviewGroup[],
  fetcher: FetchLike = fetch,
): Promise<KodlandPendingReviewImport[]> {
  const tokens = await loginKodland(credentials, fetcher);
  const session = { accessToken: tokens.access_token, refreshToken: tokens.refresh_token };
  const snapshots = await Promise.all(groups.filter((group) => !group.archived).map(async (group) => {
    const groupImport = pendingReviewGroupToImport(group);
    const payload = await getJson(`student_groups/${group.externalId}/get_students_main_data/`, session, fetcher);
    const lessonsPayload = await fetchLessonsPayload(groupImport, session, fetcher);
    return fetchPendingReviewsForGroup(groupImport, payload, lessonsPayload, session, fetcher);
  }));
  return snapshots.flat();
}

export async function loginKodland(credentials: KodlandCredentials, fetcher: FetchLike = fetch): Promise<TokenResponse> {
  const body = new URLSearchParams();
  body.append('username', credentials.username.trim());
  body.append('password', credentials.password);
  const response = await fetcher(`${ssoBaseUrl}login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new KodlandApiError(response.status === 401 ? 'Usuario ou senha invalidos.' : 'Nao foi possivel entrar na Kodland.', response.status);
  }
  const payload = await response.json() as Partial<TokenResponse>;
  if (!payload.access_token) throw new KodlandApiError('A Kodland nao retornou uma sessao valida.');
  return { access_token: payload.access_token, refresh_token: payload.refresh_token };
}

export function getUserIdFromAccessToken(token: string) {
  const payload = decodeJwtPayload(token);
  const userId = payload.user_id;
  if (typeof userId !== 'string' && typeof userId !== 'number') {
    throw new KodlandApiError('A sessao da Kodland nao informa o professor autenticado.');
  }
  return String(userId);
}

async function fetchTeacherGroups(teacherId: string, session: TokenSession, fetcher: FetchLike) {
  try {
    const groups = await fetchPaginatedGroups('student_groups/', session, fetcher);
    if (groups.length) return groups;
  } catch {
    // The teacher-scoped endpoint is kept as a fallback for older backoffice payloads.
  }
  return fetchPaginatedGroups(`teachers/${teacherId}/get_teachers_groups/`, session, fetcher);
}

async function fetchPaginatedGroups(path: string, session: TokenSession, fetcher: FetchLike) {
  const groups: KodlandGroupImport[] = [];
  let page = 1;
  while (true) {
    const separator = path.includes('?') ? '&' : '?';
    const payload = await getJson(`${path}${separator}page=${page}&page_size=${pageSize}`, session, fetcher) as TeacherGroupsResponse;
    const pageGroups = Array.isArray(payload.results)
      ? payload.results.map(normalizeKodlandGroup).filter((group): group is KodlandGroupImport => Boolean(group))
      : [];
    groups.push(...pageGroups);
    if (!payload.next || pageGroups.length === 0) break;
    page += 1;
  }
  return groups;
}

async function fetchStudentDetail(student: KodlandStudentImport, session: TokenSession, fetcher: FetchLike) {
  try {
    const payload = await getJson(`students/${student.externalId}/get_general_info_for_student_backoffice_page/`, session, fetcher);
    return enrichKodlandStudentFromDetail(student, payload);
  } catch {
    return student;
  }
}

function pendingReviewGroupToImport(group: KodlandPendingReviewGroup): KodlandGroupImport {
  return {
    externalId: group.externalId,
    title: group.title,
    archived: group.archived,
    courseName: '',
    courseId: '',
    studentCount: 0,
    startDate: '',
    nextLessonDate: '',
    nextLessonTitle: '',
    nextLessonUrl: '',
    nextLessonId: '',
    rawData: {},
  };
}

function lessonMaterialsGroupToImport(group: KodlandLessonMaterialsGroup): KodlandGroupImport {
  return {
    externalId: group.externalId,
    title: group.title,
    archived: group.archived,
    courseName: group.courseName,
    courseId: group.courseId,
    studentCount: 0,
    startDate: '',
    nextLessonDate: '',
    nextLessonTitle: '',
    nextLessonUrl: '',
    nextLessonId: '',
    rawData: {},
  };
}

async function fetchLessonsPayload(group: KodlandGroupImport, session: TokenSession, fetcher: FetchLike) {
  try {
    return await getJson(`student_groups/${group.externalId}/lessons/`, session, fetcher);
  } catch {
    return [];
  }
}

async function fetchCoursePayload(group: KodlandGroupImport, session: TokenSession, fetcher: FetchLike) {
  if (!group.courseId) return null;
  try {
    return await getJson(`courses/${group.courseId}/get_general_info_for_course_backoffice_page`, session, fetcher);
  } catch {
    return null;
  }
}

async function fetchStudyGuideMaterialsForLessons(
  group: KodlandGroupImport,
  lessonsPayload: unknown,
  sharedMaterialsByCourseLesson: Map<string, KodlandLessonMaterialLinks>,
  session: TokenSession,
  fetcher: FetchLike,
) {
  const lessons = Array.isArray(lessonsPayload)
    ? lessonsPayload
      .map((lesson) => lesson as Record<string, unknown>)
    : [];
  const groupMaterials = new Map<string, KodlandLessonMaterialLinks>();
  await Promise.all(lessons.map(async (lesson) => {
    const lessonId = String(lesson.lesson_id ?? lesson.id ?? '');
    if (!lessonId) return;
    const courseLessonKey = studyGuideMaterialCacheKey(group, lesson, lessonId);
    if (sharedMaterialsByCourseLesson.has(courseLessonKey)) {
      groupMaterials.set(lessonId, sharedMaterialsByCourseLesson.get(courseLessonKey)!);
      return;
    }
    try {
      const payload = await getJson(`materials?lesson=${encodeURIComponent(lessonId)}`, session, fetcher);
      const links = parseKodlandStudyGuideMaterialsPayload(group.courseId, lessonId, payload);
      sharedMaterialsByCourseLesson.set(courseLessonKey, links);
      groupMaterials.set(lessonId, links);
    } catch {
      const emptyLinks = {
        slideUrl: '',
        slideTitle: '',
        slideMaterialId: '',
        scriptUrl: '',
        scriptTitle: '',
        scriptMaterialId: '',
        recordingUrl: '',
      };
      sharedMaterialsByCourseLesson.set(courseLessonKey, emptyLinks);
      groupMaterials.set(lessonId, emptyLinks);
    }
  }));
  return groupMaterials;
}

function studyGuideMaterialCacheKey(group: KodlandGroupImport, lesson: Record<string, unknown>, lessonId: string) {
  const title = String(lesson.lesson_title ?? lesson.title ?? lesson.lesson_theme ?? '').trim();
  const moduleMatch = title.match(/\bM\s*(\d+)\s*[\.\-_/]?\s*L\s*(\d+)\b/i);
  const courseId = group.courseId || String(lesson.course_id ?? lesson.courseId ?? '').trim() || group.externalId;
  if (moduleMatch) return `${courseId}:m${Number(moduleMatch[1])}:l${Number(moduleMatch[2])}`;
  const lessonNumber = Number(lesson.lesson_number ?? lesson.number);
  if (Number.isFinite(lessonNumber) && lessonNumber > 0) return `${courseId}:lesson-${lessonNumber}`;
  return `${courseId}:id-${lessonId}`;
}

async function fetchRecordingUrlsForLessons(group: KodlandGroupImport, lessonsPayload: unknown, session: TokenSession, fetcher: FetchLike) {
  const recordingUrls = new Map<string, string>();
  const lessons = Array.isArray(lessonsPayload) ? lessonsPayload.map((lesson) => lesson as Record<string, unknown>) : [];
  await Promise.all(lessons
    .filter((lesson) => lesson.lesson_passed === true || lesson.passed === true)
    .map(async (lesson) => {
      const lessonId = String(lesson.lesson_id ?? lesson.id ?? '');
      const timetableId = timetableIdValue(lesson);
      if (!lessonId || !timetableId) return;
      try {
        const payload = await getJson(`zoom_records/?timetable_id=${encodeURIComponent(timetableId)}&group_id=${encodeURIComponent(group.externalId)}`, session, fetcher);
        const recordingUrl = parseKodlandRecordingPayload(payload);
        if (recordingUrl) recordingUrls.set(lessonId, recordingUrl);
      } catch {
        // Recordings are optional; keep the rest of the lesson sync usable.
      }
    }));
  return recordingUrls;
}

function timetableIdValue(lesson: Record<string, unknown>) {
  const timetable = lesson.timetable && typeof lesson.timetable === 'object' ? lesson.timetable as Record<string, unknown> : {};
  const value = lesson.timetable_id ?? lesson.timetableId ?? lesson.timetable ?? timetable.id ?? timetable.timetable_id;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

async function fetchPendingReviewsForGroup(group: KodlandGroupImport, groupStudentsPayload: unknown, lessonsPayload: unknown, session: TokenSession, fetcher: FetchLike) {
  try {
    const lessonIds = Array.isArray(lessonsPayload)
      ? lessonsPayload
        .filter((lesson) => (lesson as Record<string, unknown>).lesson_passed === true)
        .map((lesson) => String((lesson as Record<string, unknown>).lesson_id ?? ''))
        .filter(Boolean)
      : [];
    const progressPayloads = await Promise.all(lessonIds.map((lessonId) => (
      getJson(`student_groups/${group.externalId}/lesson/${lessonId}/get_group_progress/`, session, fetcher)
    )));
    return parseKodlandPendingReviewsPayload(group, groupStudentsPayload, lessonsPayload, progressPayloads);
  } catch {
    return [];
  }
}

async function getJson(path: string, session: TokenSession, fetcher: FetchLike) {
  let response = await authenticatedGet(path, session.accessToken, fetcher);
  if (response.status === 401 && session.refreshToken) {
    session.accessToken = await refreshKodlandAccessToken(session.refreshToken, fetcher);
    response = await authenticatedGet(path, session.accessToken, fetcher);
  }
  if (!response.ok) {
    throw new KodlandApiError(response.status === 401 ? 'Sua sessao da Kodland expirou. Sincronize novamente.' : 'A Kodland nao respondeu como esperado.', response.status);
  }
  return response.json();
}

async function authenticatedGet(path: string, token: string, fetcher: FetchLike) {
  return fetcher(`${backofficeBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function refreshKodlandAccessToken(refreshToken: string, fetcher: FetchLike) {
  const body = new URLSearchParams();
  body.append('grant_type', 'refresh_token');
  body.append('refresh_token', refreshToken);
  const response = await fetcher(`${ssoBaseUrl}token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new KodlandApiError('Sua sessao da Kodland expirou. Sincronize novamente.', response.status);
  }
  const payload = await response.json() as Partial<TokenResponse>;
  if (!payload.access_token) throw new KodlandApiError('A Kodland nao retornou uma sessao valida.');
  return payload.access_token;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const encoded = token.split('.')[1];
  if (!encoded) throw new KodlandApiError('A Kodland retornou uma sessao invalida.');
  const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(encoded.length / 4) * 4, '=');
  try {
    return JSON.parse(globalThis.atob(normalized)) as Record<string, unknown>;
  } catch {
    throw new KodlandApiError('A Kodland retornou uma sessao invalida.');
  }
}

export class KodlandApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'KodlandApiError';
  }
}
