export type KodlandStudentImport = {
  externalId: string;
  name: string;
  externalClassId: string;
  externalClassName: string;
  rawData: Record<string, unknown>;
};

export type KodlandCredentials = {
  username: string;
  password: string;
};

export type KodlandSyncResult =
  | { ok: true; students: KodlandStudentImport[] }
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

export async function syncKodlandStudents(credentials: KodlandCredentials): Promise<KodlandSyncResult> {
  if (!credentials.username.trim() || !credentials.password.trim()) {
    return { ok: false, message: 'Informe usuário e senha da Kodland.' };
  }
  return {
    ok: false,
    message: 'Credenciais salvas. O endpoint autenticado da Kodland ainda precisa ser mapeado antes da primeira sincronização.',
  };
}

function stringValue(value: unknown) {
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number') return String(value);
  return '';
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
