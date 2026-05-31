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
  studentCount: number;
  startDate: string;
  nextLessonDate: string;
  archived: boolean;
  rawData: Record<string, unknown>;
};

export type KodlandCredentials = {
  username: string;
  password: string;
};

export type KodlandSyncResult =
  | { ok: true; teacherId: string; groups: KodlandGroupImport[]; students: KodlandStudentImport[] }
  | { ok: false; message: string };

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
  return {
    externalId,
    title,
    courseName: stringValue(course.title ?? record.course_name),
    studentCount: numberValue(record.students_count ?? record.student_count),
    startDate: stringValue(record.start_timeslot ?? record.start_date),
    nextLessonDate: stringValue(record.next_lesson_date),
    archived: Boolean(record.is_archive ?? record.archived),
    rawData: {
      id: externalId,
      title,
      courseName: stringValue(course.title ?? record.course_name),
      studentsCount: numberValue(record.students_count ?? record.student_count),
      timetable: arrayValue(record.timetable),
      startTimeslot: stringValue(record.start_timeslot ?? record.start_date),
      nextLessonDate: stringValue(record.next_lesson_date),
      archived: Boolean(record.is_archive ?? record.archived),
    },
  };
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

export async function syncKodlandStudents(credentials: KodlandCredentials): Promise<KodlandSyncResult> {
  if (!credentials.username.trim() || !credentials.password.trim()) {
    return { ok: false, message: 'Informe usuario e senha da Kodland.' };
  }
  try {
    const { fetchKodlandSnapshot } = await import('./kodlandClient');
    return { ok: true, ...await fetchKodlandSnapshot(credentials) };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : 'Nao foi possivel sincronizar com a Kodland.' };
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

function progressValue(value: unknown) {
  const modules = arrayValue(value);
  if (!modules.length) return '';
  const completed = modules.reduce((total, module) => total + numberValue(objectValue(module).module_current_grade), 0);
  const maximum = modules.reduce((total, module) => total + numberValue(objectValue(module).module_max_grade), 0);
  return maximum > 0 ? `${completed}/${maximum}` : '';
}
