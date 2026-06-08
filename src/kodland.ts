export type KodlandStudentImport = {
  externalId: string;
  name: string;
  email: string;
  phone: string;
  status: string;
  progressSummary: string;
  profileUrl: string;
  externalClassId: string;
  externalClassName: string;
  rawData: Record<string, unknown>;
};

export type KodlandGroupImport = {
  externalId: string;
  title: string;
  courseName: string;
  courseId: string;
  studentCount: number;
  startDate: string;
  nextLessonDate: string;
  nextLessonTitle: string;
  nextLessonUrl: string;
  nextLessonId: string;
  archived: boolean;
  rawData: Record<string, unknown>;
};

export type KodlandLessonMaterialLinks = {
  slideUrl: string;
  slideTitle: string;
  slideMaterialId: string;
  scriptUrl: string;
  scriptTitle: string;
  scriptMaterialId: string;
  recordingUrl: string;
};

export type KodlandLessonImport = {
  id: string;
  externalClassId: string;
  externalClassName: string;
  courseId: string;
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  lessonDate: string;
  lessonPassed: boolean;
  materialUrl: string;
  slideUrl: string;
  slideTitle: string;
  slideMaterialId: string;
  scriptUrl: string;
  scriptTitle: string;
  scriptMaterialId: string;
  recordingUrl: string;
};

export type KodlandPendingReviewImport = {
  id: string;
  externalClassId: string;
  externalClassName: string;
  externalStudentId: string;
  studentName: string;
  lessonId: string;
  lessonNumber: number;
  lessonTitle: string;
  moduleNumber: string;
  taskId: string;
  taskNumber: number;
  taskTitle: string;
  statusKey: string;
  statusLabel: string;
  correctionUrl: string;
};

export type KodlandCredentials = {
  username: string;
  password: string;
};

export type KodlandSyncResult =
  | { ok: true; teacherId: string; groups: KodlandGroupImport[]; students: KodlandStudentImport[]; pendingReviews: KodlandPendingReviewImport[]; lessons: KodlandLessonImport[] }
  | { ok: false; message: string };

export type KodlandPendingReviewSyncResult =
  | { ok: true; pendingReviews: KodlandPendingReviewImport[] }
  | { ok: false; message: string };

export type KodlandLessonMaterialsSyncResult =
  | { ok: true; lessons: KodlandLessonImport[] }
  | { ok: false; message: string };

export type KodlandPendingReviewGroupInput = Pick<KodlandGroupImport, 'externalId' | 'title' | 'archived'>;
export type KodlandLessonMaterialsGroupInput = Pick<KodlandGroupImport, 'externalId' | 'title' | 'courseId' | 'courseName' | 'archived'>;

export type KodlandStudentSyncOptions = {
  includeMaterials?: boolean;
};

const pendingReviewStatusKeys = new Set(['TASK_SUBMITTED', 'TASK_SUBMITTED_LATE']);

export function normalizeKodlandStudent(input: unknown): KodlandStudentImport | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const externalId = stringValue(record.id ?? record.studentId ?? record.student_id);
  const name = stringValue(record.name ?? record.fullName ?? record.full_name);
  const externalClassId = stringValue(record.classId ?? record.groupId ?? record.group_id);
  const externalClassName = stringValue(record.className ?? record.groupName ?? record.group_name);
  if (!externalId || !name) return null;
  return {
    externalId,
    name,
    email: stringValue(record.email),
    phone: stringValue(record.phone ?? record.phone_number ?? record.mobile ?? record.mobile_phone),
    status: stringValue(record.status),
    progressSummary: stringValue(record.progressSummary ?? record.progress_summary),
    profileUrl: profileUrlValue(record, externalId),
    externalClassId,
    externalClassName,
    rawData: record,
  };
}

export function parseKodlandStudentsPayload(payload: unknown): KodlandStudentImport[] {
  const candidates = Array.isArray(payload)
    ? payload
    : payload && typeof payload === 'object'
      ? arrayValue((payload as Record<string, unknown>).students ?? (payload as Record<string, unknown>).results ?? (payload as Record<string, unknown>).data)
      : [];
  return candidates.map(normalizeKodlandStudent).filter((student): student is KodlandStudentImport => Boolean(student));
}

export function normalizeKodlandGroup(input: unknown): KodlandGroupImport | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const externalId = stringValue(record.id ?? record.group_id);
  const title = stringValue(record.title ?? record.group_name);
  if (!externalId || !title) return null;
  const course = objectValue(record.course);
  const courseId = stringValue(course.id ?? course.course_id ?? record.course_id ?? record.courseId);
  const nextLesson = nextLessonValue(record);
  return {
    externalId,
    title,
    courseId,
    courseName: stringValue(course.title ?? record.course_name),
    studentCount: numberValue(record.students_count ?? record.student_count),
    startDate: stringValue(record.start_timeslot ?? record.start_date),
    nextLessonDate: stringValue(record.next_lesson_date),
    nextLessonTitle: nextLesson.title,
    nextLessonUrl: nextLesson.url,
    nextLessonId: nextLesson.lessonId,
    archived: Boolean(record.is_archive ?? record.archived),
    rawData: {
      id: externalId,
      title,
      courseId,
      courseName: stringValue(course.title ?? record.course_name),
      studentsCount: numberValue(record.students_count ?? record.student_count),
      timetable: arrayValue(record.timetable),
      startTimeslot: stringValue(record.start_timeslot ?? record.start_date),
      nextLessonDate: stringValue(record.next_lesson_date),
      nextLessonTitle: nextLesson.title,
      nextLessonUrl: nextLesson.url,
      nextLessonId: nextLesson.lessonId,
      archived: Boolean(record.is_archive ?? record.archived),
    },
  };
}

export function parseKodlandLessonsPayload(
  group: KodlandGroupImport,
  payload: unknown,
  coursePayload: unknown = null,
  studyGuideMaterialsByLessonId = new Map<string, KodlandLessonMaterialLinks>(),
  recordingUrlsByLessonId = new Map<string, string>(),
): KodlandLessonImport[] {
  return arrayValue(payload).map((input): KodlandLessonImport | null => {
    const record = objectValue(input);
    const lessonId = stringValue(record.lesson_id ?? record.id);
    if (!lessonId) return null;
    const lessonTitle = stringValue(record.lesson_title ?? record.title ?? record.lesson_theme);
    const courseId = stringValue(record.course_id ?? record.courseId) || group.courseId;
    const lessonDate = lessonDateValue(record);
    const directLinks = materialLinksForLesson(lessonId, record, coursePayload);
    mergeMaterialLinks(directLinks, studyGuideMaterialsByLessonId.get(lessonId) ?? emptyMaterialLinks());
    const recordingUrl = directLinks.recordingUrl || recordingUrlsByLessonId.get(lessonId) || '';
    return {
      id: `${group.externalId}-${lessonId}`,
      externalClassId: group.externalId,
      externalClassName: group.title,
      courseId,
      lessonId,
      lessonNumber: numberValue(record.lesson_number ?? record.number),
      lessonTitle,
      lessonDate,
      lessonPassed: Boolean(record.lesson_passed ?? record.passed),
      materialUrl: lessonMaterialUrl(group.externalId, courseId, lessonId),
      slideUrl: directLinks.slideUrl,
      slideTitle: directLinks.slideTitle,
      slideMaterialId: directLinks.slideMaterialId,
      scriptUrl: directLinks.scriptUrl,
      scriptTitle: directLinks.scriptTitle,
      scriptMaterialId: directLinks.scriptMaterialId,
      recordingUrl,
    };
  }).filter((lesson): lesson is KodlandLessonImport => Boolean(lesson));
}

export function parseKodlandRecordingPayload(payload: unknown): string {
  const candidates = arrayValue(payload);
  for (const input of candidates.length ? candidates : [payload]) {
    const url = recordingUrlFromRecord(objectValue(input));
    if (url) return url;
  }
  return '';
}

export function parseKodlandStudyGuideMaterialsPayload(courseId: string, lessonId: string, payload: unknown): KodlandLessonMaterialLinks {
  const links = emptyMaterialLinks();
  const materials = arrayValue(payload).map((input) => {
    const record = objectValue(input);
    const materialId = stringValue(record.id ?? record.material_id ?? record.materialId);
    const title = stringValue(record.title ?? record.name ?? record.lesson_title ?? record.label);
    const url = materialUrlFromMaterialRecord(record) || materialDownloadUrl(materialId);
    return { materialId, title, url, record };
  }).filter((material) => material.materialId || material.title || material.url);

  materials.forEach((material) => {
    const context = `${material.title} ${JSON.stringify(material.record)}`.toLowerCase();
    if (!links.slideUrl && /slide|slides|presentation|presenta|apresenta|deck/i.test(context)) {
      links.slideUrl = material.url;
      links.slideTitle = material.title;
      links.slideMaterialId = material.materialId;
    }
    if (!links.scriptUrl && /roteiro|script|scenario|teacher|plan|plano|guide|guia|conspect/i.test(context)) {
      links.scriptUrl = material.url;
      links.scriptTitle = material.title;
      links.scriptMaterialId = material.materialId;
    }
  });

  if (materials.length === 2) {
    const remaining = materials.find((material) => material.url && material.materialId !== links.slideMaterialId && material.materialId !== links.scriptMaterialId);
    if (links.slideUrl && !links.scriptUrl && remaining) {
      links.scriptUrl = remaining.url;
      links.scriptTitle = remaining.title;
      links.scriptMaterialId = remaining.materialId;
    } else if (links.scriptUrl && !links.slideUrl && remaining) {
      links.slideUrl = remaining.url;
      links.slideTitle = remaining.title;
      links.slideMaterialId = remaining.materialId;
    }
  }

  if (!links.scriptUrl) {
    const compactLessonTitle = `m${lessonId}`.toLowerCase();
    const fallback = materials.find((material) => material.url && material.title && !/slide|slides|presentation|presenta|apresenta/i.test(material.title) && material.title.toLowerCase() !== compactLessonTitle);
    if (fallback) {
      links.scriptUrl = fallback.url;
      links.scriptTitle = fallback.title;
      links.scriptMaterialId = fallback.materialId;
    }
  }

  return links;
}

export function parseKodlandGroupStudentsPayload(payload: unknown, group: KodlandGroupImport): KodlandStudentImport[] {
  const candidates = Array.isArray(payload) ? payload : [];
  return candidates.map((input): KodlandStudentImport | null => {
    const record = objectValue(input);
    const mainInfo = objectValue(record.main_info);
    const externalId = stringValue(mainInfo.student_id);
    const name = stringValue(mainInfo.full_name);
    if (!externalId || !name) return null;
    const progressSummary = progressValue(record.progress_info);
    return {
      externalId,
      name,
      email: stringValue(mainInfo.email),
      phone: stringValue(mainInfo.phone ?? mainInfo.phone_number ?? mainInfo.mobile ?? mainInfo.mobile_phone),
      status: stringValue(mainInfo.status),
      progressSummary,
      profileUrl: profileUrlValue(mainInfo, externalId),
      externalClassId: group.externalId,
      externalClassName: group.title,
      rawData: {
        studentId: externalId,
        name,
        email: stringValue(mainInfo.email),
        phone: stringValue(mainInfo.phone ?? mainInfo.phone_number ?? mainInfo.mobile ?? mainInfo.mobile_phone),
        status: stringValue(mainInfo.status),
        profileUrl: profileUrlValue(mainInfo, externalId),
        totalCurrentGrade: numberValue(mainInfo.total_current_grade),
        totalMaxGrade: numberValue(mainInfo.total_max_grade),
        rating: numberValue(mainInfo.rating),
        ratingMax: numberValue(mainInfo.rating_max),
        progressSummary,
      },
    };
  }).filter((student): student is KodlandStudentImport => Boolean(student));
}

export function parseKodlandPendingReviewsPayload(
  group: KodlandGroupImport,
  groupStudentsPayload: unknown,
  lessonsPayload: unknown,
  lessonProgressPayloads: unknown[],
): KodlandPendingReviewImport[] {
  const moduleByLessonId = moduleMapFromGroupStudentsPayload(groupStudentsPayload);
  const validLessons = arrayValue(lessonsPayload).filter((input) => objectValue(input).lesson_passed === true);
  const lessonsById = new Map(validLessons.map((input) => {
    const lesson = objectValue(input);
    const lessonId = stringValue(lesson.lesson_id ?? lesson.id);
    return [lessonId, {
      lessonId,
      lessonNumber: numberValue(lesson.lesson_number ?? lesson.number),
      lessonTitle: stringValue(lesson.lesson_title ?? lesson.title ?? lesson.lesson_theme),
    }];
  }).filter(([lessonId]) => Boolean(lessonId)) as [string, { lessonId: string; lessonNumber: number; lessonTitle: string }][]);
  const validLessonIds = new Set(lessonsById.keys());

  return lessonProgressPayloads.flatMap((payload) => {
    const progress = objectValue(payload);
    const tasksById = new Map(arrayValue(progress.lesson_tasks).map((input) => {
      const task = objectValue(input);
      const taskId = stringValue(task.id ?? task.task_id);
      const linkToService = stringValue(task.link_to_service ?? task.linkToService ?? task.url);
      return [taskId, {
        taskId,
        taskNumber: numberValue(task.number ?? task.task_number),
        taskTitle: stringValue(task.title ?? task.task_title),
        lessonId: stringValue(task.lesson_id),
        correctionUrl: correctionUrlValue(linkToService, group.externalId),
      }];
    }).filter(([taskId]) => Boolean(taskId)) as [string, { taskId: string; taskNumber: number; taskTitle: string; lessonId: string; correctionUrl: string }][]);

    return arrayValue(progress.students_progress).flatMap((studentInput) => {
      const student = objectValue(studentInput);
      const externalStudentId = stringValue(student.student_id);
      const studentName = stringValue(student.student_name);
      if (!externalStudentId || !studentName) return [];

      return arrayValue(student.tasks_data).map((taskInput): KodlandPendingReviewImport | null => {
        const taskData = objectValue(taskInput);
        const statusKey = stringValue(taskData.task_status_key);
        if (!pendingReviewStatusKeys.has(statusKey)) return null;

        const taskId = stringValue(taskData.task_id);
        const task = tasksById.get(taskId);
        if (!task) return null;
        if (!validLessonIds.has(task.lessonId)) return null;

        const lesson = lessonsById.get(task.lessonId);
        if (!lesson) return null;
        return {
          id: `${group.externalId}-${externalStudentId}-${lesson.lessonId}-${taskId}`,
          externalClassId: group.externalId,
          externalClassName: group.title,
          externalStudentId,
          studentName,
          lessonId: lesson.lessonId,
          lessonNumber: lesson.lessonNumber,
          lessonTitle: lesson.lessonTitle,
          moduleNumber: moduleByLessonId.get(lesson.lessonId) ?? '',
          taskId,
          taskNumber: task.taskNumber,
          taskTitle: task.taskTitle,
          statusKey,
          statusLabel: statusLabelValue(statusKey),
          correctionUrl: task.correctionUrl,
        };
      }).filter((review): review is KodlandPendingReviewImport => Boolean(review));
    });
  });
}

export function enrichKodlandStudentFromDetail(student: KodlandStudentImport, payload: unknown): KodlandStudentImport {
  const detail = objectValue(payload);
  const mainInfo = objectValue(detail.main_info);
  const source = Object.keys(mainInfo).length ? mainInfo : detail;
  const phone = stringValue(source.phone ?? source.phone_number ?? source.mobile ?? source.mobile_phone ?? source.parent_phone);
  const email = stringValue(source.email);
  const status = stringValue(source.status);
  const profileUrl = profileUrlValue(source, student.externalId);
  return {
    ...student,
    email: email || student.email,
    phone: phone || student.phone,
    status: status || student.status,
    profileUrl: profileUrl || student.profileUrl,
    rawData: {
      ...student.rawData,
      detail: {
        studentId: student.externalId,
        email: email || student.email,
        phone: phone || student.phone,
        status: status || student.status,
        profileUrl: profileUrl || student.profileUrl,
      },
    },
  };
}

export async function syncKodlandStudents(credentials: KodlandCredentials, options: KodlandStudentSyncOptions = {}): Promise<KodlandSyncResult> {
  if (!credentials.username.trim() || !credentials.password.trim()) {
    return { ok: false, message: 'Informe usuario e senha da Kodland.' };
  }
  try {
    const { fetchKodlandSnapshot } = await import('./kodlandClient');
    return { ok: true, ...await fetchKodlandSnapshot(credentials, fetch, options) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Nao foi possivel sincronizar com a Kodland.' };
  }
}

export async function syncKodlandLessonMaterials(
  credentials: KodlandCredentials,
  groups: KodlandLessonMaterialsGroupInput[],
): Promise<KodlandLessonMaterialsSyncResult> {
  if (!credentials.username.trim() || !credentials.password.trim()) {
    return { ok: false, message: 'Informe usuario e senha da Kodland.' };
  }
  if (!groups.length) {
    return { ok: false, message: 'Sincronize as turmas Kodland antes de atualizar os materiais.' };
  }
  try {
    const { fetchKodlandLessonMaterials } = await import('./kodlandClient');
    return { ok: true, lessons: await fetchKodlandLessonMaterials(credentials, groups) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Nao foi possivel atualizar os materiais.' };
  }
}

export async function syncKodlandPendingReviews(
  credentials: KodlandCredentials,
  groups: KodlandPendingReviewGroupInput[],
): Promise<KodlandPendingReviewSyncResult> {
  if (!credentials.username.trim() || !credentials.password.trim()) {
    return { ok: false, message: 'Informe usuario e senha da Kodland.' };
  }
  if (!groups.length) {
    return { ok: false, message: 'Sincronize as turmas Kodland antes de atualizar as correcoes.' };
  }
  try {
    const { fetchKodlandPendingReviews } = await import('./kodlandClient');
    return { ok: true, pendingReviews: await fetchKodlandPendingReviews(credentials, groups) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Nao foi possivel atualizar as correcoes.' };
  }
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
}

function profileUrlValue(record: Record<string, unknown>, externalId: string) {
  const directUrl = stringValue(record.profileUrl ?? record.profile_url ?? record.backofficeUrl ?? record.backoffice_url ?? record.url);
  return directUrl || `https://bo.kodland.org/students/${externalId}`;
}

function arrayValue(value: unknown) {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (Array.isArray(record.items)) return record.items;
    if (Array.isArray(record.results)) return record.results;
  }
  return [];
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function numberValue(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function lessonDateValue(record: Record<string, unknown>) {
  const timetable = objectValue(record.timetable ?? record.time_table);
  const schedule = objectValue(record.schedule ?? record.schedule_view ?? record.timeslot);
  return stringValue(
    record.start_datetime
    ?? record.startDateTime
    ?? record.start_date
    ?? record.startDate
    ?? record.lesson_date
    ?? record.lessonDate
    ?? record.scheduled_date
    ?? record.scheduledDate
    ?? record.date
    ?? record.datetime
    ?? record.date_time
    ?? record.dateTime
    ?? timetable.start_datetime
    ?? timetable.startDateTime
    ?? timetable.start_date
    ?? timetable.startDate
    ?? timetable.date
    ?? schedule.start_datetime
    ?? schedule.startDateTime
    ?? schedule.start_date
    ?? schedule.startDate
    ?? schedule.lesson_date
    ?? schedule.lessonDate
    ?? schedule.date,
  );
}

function progressValue(value: unknown) {
  const modules = arrayValue(value);
  if (!modules.length) return '';
  const completed = modules.reduce((total, module) => total + numberValue(objectValue(module).module_current_grade), 0);
  const maximum = modules.reduce((total, module) => total + numberValue(objectValue(module).module_max_grade), 0);
  return maximum > 0 ? `${completed}/${maximum}` : '';
}

function correctionUrlValue(value: string, externalClassId: string) {
  if (!value) return `https://bo.kodland.org/groups/${externalClassId}`;
  if (/^https?:\/\//i.test(value)) return value;
  return `https://bo.kodland.org${value.startsWith('/') ? value : `/${value}`}`;
}

function lessonMaterialUrl(externalClassId: string, courseId: string, lessonId: string) {
  if (courseId) return `https://bo.kodland.org/courses/${encodeURIComponent(courseId)}?lessonId=${encodeURIComponent(lessonId)}`;
  return `https://bo.kodland.org/groups/${encodeURIComponent(externalClassId)}`;
}

function materialLinksForLesson(lessonId: string, lessonRecord: Record<string, unknown>, coursePayload: unknown) {
  const links = emptyMaterialLinks();
  mergeMaterialLinks(links, extractMaterialLinks(lessonRecord));
  lessonObjectsFromPayload(coursePayload, lessonId).forEach((candidate) => {
    mergeMaterialLinks(links, extractMaterialLinks(candidate));
  });
  return links;
}

function emptyMaterialLinks(): KodlandLessonMaterialLinks {
  return { slideUrl: '', slideTitle: '', slideMaterialId: '', scriptUrl: '', scriptTitle: '', scriptMaterialId: '', recordingUrl: '' };
}

function mergeMaterialLinks(target: KodlandLessonMaterialLinks, source: KodlandLessonMaterialLinks) {
  if (!target.slideUrl && source.slideUrl) {
    target.slideUrl = source.slideUrl;
    target.slideTitle = source.slideTitle;
    target.slideMaterialId = source.slideMaterialId;
  }
  if (!target.scriptUrl && source.scriptUrl) {
    target.scriptUrl = source.scriptUrl;
    target.scriptTitle = source.scriptTitle;
    target.scriptMaterialId = source.scriptMaterialId;
  }
  if (!target.recordingUrl && source.recordingUrl) target.recordingUrl = source.recordingUrl;
}

function lessonObjectsFromPayload(payload: unknown, lessonId: string) {
  const matches: Record<string, unknown>[] = [];
  const visit = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const record = objectValue(value);
    if (!Object.keys(record).length) return;
    const candidateId = stringValue(record.lesson_id ?? record.lessonId ?? record.lesson ?? record.id);
    const hasLessonShape = Boolean(record.lesson_id ?? record.lessonId ?? record.lesson_number ?? record.lessonNumber ?? record.lesson_theme ?? record.lesson_title);
    if (candidateId === lessonId && hasLessonShape) matches.push(record);
    Object.values(record).forEach(visit);
  };
  visit(payload);
  return matches;
}

function extractMaterialLinks(value: unknown) {
  const links = emptyMaterialLinks();
  const visit = (input: unknown, context = '') => {
    if (Array.isArray(input)) {
      input.forEach((item) => visit(item, context));
      return;
    }
    const record = objectValue(input);
    if (!Object.keys(record).length) return;

    Object.entries(record).forEach(([key, rawValue]) => {
      const normalizedKey = key.toLowerCase();
      const nextContext = `${context} ${normalizedKey} ${stringValue(record.title ?? record.name ?? record.type ?? record.kind ?? record.label)}`.toLowerCase();
      const url = materialUrlValue(rawValue);
      if (url) assignMaterialLink(links, nextContext, url);
      if (rawValue && typeof rawValue === 'object') visit(rawValue, nextContext);
    });
  };
  visit(value);
  return links;
}

function assignMaterialLink(links: KodlandLessonMaterialLinks, context: string, url: string) {
  if (!links.slideUrl && /slide|slides|presentation|presenta|deck|pdf/i.test(context)) {
    links.slideUrl = url;
    return;
  }
  if (!links.scriptUrl && /script|scenario|roteiro|teacher|plan|plano|lesson[_ -]?plan|conspect/i.test(context)) {
    links.scriptUrl = url;
    return;
  }
  if (!links.recordingUrl && /record|recording|zoom|video|grava|gravacao|gravação/i.test(context)) {
    links.recordingUrl = url;
  }
}

function materialUrlValue(value: unknown) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^\/[^/]/.test(trimmed)) return `https://bo.kodland.org${trimmed}`;
  return '';
}

function nextLessonValue(record: Record<string, unknown>) {
  const nextLesson = objectValue(record.next_lesson ?? record.nextLesson ?? record.next_lesson_data ?? record.nextLessonData);
  const directUrl = materialUrlValue(
    record.next_lesson_url
    ?? record.nextLessonUrl
    ?? record.next_lesson_link
    ?? record.nextLessonLink
    ?? nextLesson.url
    ?? nextLesson.link
    ?? nextLesson.href,
  );
  const lessonIdFromUrl = lessonIdFromKodlandLessonUrl(directUrl);
  const lessonId = stringValue(
    record.next_lesson_id
    ?? record.nextLessonId
    ?? nextLesson.lesson_id
    ?? nextLesson.lessonId
    ?? nextLesson.id,
  ) || lessonIdFromUrl;
  return {
    title: stringValue(record.next_lesson_title ?? record.nextLessonTitle ?? nextLesson.title ?? nextLesson.lesson_title ?? nextLesson.lesson_theme),
    url: directUrl,
    lessonId,
  };
}

export function lessonIdFromKodlandLessonUrl(url: string) {
  if (!url) return '';
  const match = url.match(/[?&]lessonId=([^&#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

export function courseIdFromKodlandLessonUrl(url: string) {
  if (!url) return '';
  const match = url.match(/\/courses\/([^/?#]+)/i);
  return match ? decodeURIComponent(match[1]) : '';
}

function materialUrlFromMaterialRecord(record: Record<string, unknown>): string {
  const direct = materialUrlValue(
    record.url
    ?? record.link
    ?? record.href
    ?? record.file
    ?? record.file_url
    ?? record.fileUrl
    ?? record.download_url
    ?? record.downloadUrl
    ?? record.presentation_url
    ?? record.presentationUrl
    ?? record.google_url
    ?? record.googleUrl,
  );
  if (direct) return direct;
  const nested = Object.values(record).map((value) => materialUrlValue(value)).find(Boolean);
  return nested ?? '';
}

function recordingUrlFromRecord(record: Record<string, unknown>): string {
  const direct = materialUrlValue(
    record.url
    ?? record.link
    ?? record.href
    ?? record.record_url
    ?? record.recordUrl
    ?? record.recording_url
    ?? record.recordingUrl
    ?? record.zoom_url
    ?? record.zoomUrl
    ?? record.video_url
    ?? record.videoUrl,
  );
  if (direct) return direct;
  for (const [key, value] of Object.entries(record)) {
    const context = key.toLowerCase();
    if (/record|recording|zoom|video|grava|gravacao|gravação/i.test(context)) {
      const url = materialUrlValue(value);
      if (url) return url;
    }
    if (value && typeof value === 'object') {
      const nested = recordingUrlFromRecord(objectValue(value));
      if (nested) return nested;
    }
  }
  return '';
}

function materialDownloadUrl(materialId: string) {
  return materialId ? `https://backoffice.kodland.org/api/v2/materials/${encodeURIComponent(materialId)}/download` : '';
}

export function statusLabelValue(statusKey: string) {
  if (statusKey === 'TASK_SUBMITTED_LATE') return 'Entregue com atraso';
  if (statusKey === 'TASK_SUBMITTED') return 'Entregue';
  return 'Pendente';
}

function moduleMapFromGroupStudentsPayload(payload: unknown) {
  const modulesByLessonId = new Map<string, string>();
  arrayValue(payload).forEach((studentInput) => {
    arrayValue(objectValue(studentInput).progress_info).forEach((moduleInput) => {
      const module = objectValue(moduleInput);
      const moduleNumber = stringValue(module.module_number);
      if (!moduleNumber) return;
      arrayValue(module.lessons_data).forEach((lessonInput) => {
        const lessonId = stringValue(objectValue(lessonInput).lesson_id);
        if (lessonId && !modulesByLessonId.has(lessonId)) modulesByLessonId.set(lessonId, moduleNumber);
      });
    });
  });
  return modulesByLessonId;
}
