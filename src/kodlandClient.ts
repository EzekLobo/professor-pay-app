import { KodlandCredentials, KodlandGroupImport, KodlandStudentImport, normalizeKodlandGroup, parseKodlandGroupStudentsPayload } from './kodland';

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

export type KodlandRemoteSnapshot = {
  teacherId: string;
  groups: KodlandGroupImport[];
  students: KodlandStudentImport[];
};

export async function fetchKodlandSnapshot(credentials: KodlandCredentials, fetcher: FetchLike = fetch): Promise<KodlandRemoteSnapshot> {
  const tokens = await loginKodland(credentials, fetcher);
  const teacherId = getUserIdFromAccessToken(tokens.access_token);
  const groups = await fetchTeacherGroups(teacherId, tokens.access_token, fetcher);
  const students = (await Promise.all(groups.filter((group) => !group.archived).map(async (group) => {
    const payload = await getJson(`student_groups/${group.externalId}/get_students_main_data/`, tokens.access_token, fetcher);
    return parseKodlandGroupStudentsPayload(payload, group);
  }))).flat();
  return { teacherId, groups, students };
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

async function fetchTeacherGroups(teacherId: string, token: string, fetcher: FetchLike) {
  const groups: KodlandGroupImport[] = [];
  let page = 1;
  while (true) {
    const payload = await getJson(`teachers/${teacherId}/get_teachers_groups/?page=${page}&page_size=${pageSize}`, token, fetcher) as TeacherGroupsResponse;
    const pageGroups = Array.isArray(payload.results)
      ? payload.results.map(normalizeKodlandGroup).filter((group): group is KodlandGroupImport => Boolean(group))
      : [];
    groups.push(...pageGroups);
    if (!payload.next || pageGroups.length === 0) break;
    page += 1;
  }
  return groups;
}

async function getJson(path: string, token: string, fetcher: FetchLike) {
  const response = await fetcher(`${backofficeBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new KodlandApiError(response.status === 401 ? 'Sua sessao da Kodland expirou. Sincronize novamente.' : 'A Kodland nao respondeu como esperado.', response.status);
  }
  return response.json();
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
