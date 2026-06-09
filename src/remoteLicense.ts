export const AULAPAY_APP_ID = 'aulapay';
export const AULAPAY_APP_VERSION = '1.8.0';
export const remoteLicenseCsvUrl = 'https://docs.google.com/spreadsheets/d/1ca14M7LZqkrvHypVa0zAX2DsNd_2g543xWt1T2NNYw4/export?format=csv&gid=266913309';
export const remoteLicenseCheckIntervalMs = 60 * 60 * 1000;

export type RemoteLicenseStatus = {
  allowed: boolean;
  message: string;
  notification: string;
  checkedAt: string;
  source: 'remote' | 'cache' | 'fallback' | 'unconfigured';
};

export type RemoteLicenseDeviceInfo = {
  labels: string[];
};

export type RemoteLicenseInput = {
  appId: string;
  appVersion: string;
  csvUrl: string;
  cached: RemoteLicenseStatus | null;
  deviceInfo?: RemoteLicenseDeviceInfo;
  now: Date;
  force?: boolean;
  fetcher?: typeof fetch;
};

type LicenseControlRow = {
  appId: string;
  active: string;
  blocked: string;
  minVersion: string;
  maxVersion: string;
  blockedVersions: string;
  allowedModels: string;
  blockedModels: string;
  message: string;
  notification: string;
};

const fallbackAllowedMessage = 'Aplicativo liberado.';
const fallbackBlockedMessage = 'Aplicativo bloqueado. Entre em contato para liberar o acesso.';

export async function resolveRemoteLicense(input: RemoteLicenseInput): Promise<RemoteLicenseStatus> {
  if (!input.force && input.cached && !shouldRefreshRemoteLicense(input.cached.checkedAt, input.now)) {
    return { ...input.cached, source: 'cache' };
  }

  if (!input.csvUrl.trim()) {
    return input.cached
      ? { ...input.cached, source: 'cache' }
      : { allowed: true, message: fallbackAllowedMessage, notification: '', checkedAt: input.now.toISOString(), source: 'unconfigured' };
  }

  try {
    const response = await (input.fetcher ?? fetch)(input.csvUrl);
    if (!response.ok) throw new Error('Remote license unavailable');
    const csv = await response.text();
    return {
      ...evaluateLicenseRows(parseLicenseCsv(csv), input.appId, input.appVersion, input.deviceInfo),
      checkedAt: input.now.toISOString(),
      source: 'remote',
    };
  } catch {
    return input.cached
      ? { ...input.cached, source: 'cache' }
      : { allowed: true, message: fallbackAllowedMessage, notification: '', checkedAt: input.now.toISOString(), source: 'fallback' };
  }
}

export function shouldRefreshRemoteLicense(checkedAt: string, now: Date) {
  const previous = Date.parse(checkedAt);
  if (!Number.isFinite(previous)) return true;
  return now.getTime() - previous >= remoteLicenseCheckIntervalMs;
}

export function parseLicenseCsv(csv: string): LicenseControlRow[] {
  const rows = parseCsvRows(csv).filter((row) => row.some((cell) => cell.trim()));
  const [header, ...dataRows] = rows;
  if (!header) return [];
  const indexes = new Map(header.map((name, index) => [normalizeHeader(name), index]));
  return dataRows.map((row) => ({
    appId: cell(row, indexes, 'appid'),
    active: cell(row, indexes, 'active'),
    blocked: cell(row, indexes, 'blocked'),
    minVersion: cell(row, indexes, 'minversion'),
    maxVersion: cell(row, indexes, 'maxversion'),
    blockedVersions: cell(row, indexes, 'blockedversions'),
    allowedModels: cell(row, indexes, 'allowedmodels'),
    blockedModels: cell(row, indexes, 'blockedmodels'),
    message: cell(row, indexes, 'message'),
    notification: cell(row, indexes, 'notification'),
  })).filter((row) => row.appId);
}

export function evaluateLicenseRows(
  rows: LicenseControlRow[],
  appId: string,
  appVersion: string,
  deviceInfo: RemoteLicenseDeviceInfo = { labels: [] },
): Omit<RemoteLicenseStatus, 'checkedAt' | 'source'> {
  const row = rows.find((item) => item.appId.toLowerCase() === appId.toLowerCase());
  if (!row) return { allowed: true, message: fallbackAllowedMessage, notification: '' };
  if (isFalse(row.active)) return blocked(row.message || fallbackBlockedMessage);
  if (isTrue(row.blocked)) return blocked(row.message || fallbackBlockedMessage);
  if (listValues(row.blockedVersions).some((version) => compareVersions(appVersion, version) === 0)) {
    return blocked(row.message || 'Versao bloqueada. Entre em contato para liberar o acesso.');
  }
  if (listValues(row.allowedModels).length && !matchesAnyDeviceLabel(deviceInfo.labels, row.allowedModels)) {
    return blocked(row.message || fallbackBlockedMessage);
  }
  if (matchesAnyDeviceLabel(deviceInfo.labels, row.blockedModels)) {
    return blocked(row.message || fallbackBlockedMessage);
  }
  if (row.minVersion && compareVersions(appVersion, row.minVersion) < 0) {
    return blocked(row.message || 'Versao desatualizada. Atualize o aplicativo para continuar.');
  }
  if (row.maxVersion && compareVersions(appVersion, row.maxVersion) > 0) {
    return blocked(row.message || fallbackBlockedMessage);
  }
  return { allowed: true, message: row.message || fallbackAllowedMessage, notification: row.notification };
}

export function serializeRemoteLicenseStatus(status: RemoteLicenseStatus) {
  return JSON.stringify(status);
}

export function parseRemoteLicenseStatus(value: string): RemoteLicenseStatus | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<RemoteLicenseStatus>;
    if (typeof parsed.allowed !== 'boolean') return null;
    return {
      allowed: parsed.allowed,
      message: typeof parsed.message === 'string' ? parsed.message : '',
      notification: typeof parsed.notification === 'string' ? parsed.notification : '',
      checkedAt: typeof parsed.checkedAt === 'string' ? parsed.checkedAt : '',
      source: parsed.source === 'remote' || parsed.source === 'cache' || parsed.source === 'fallback' || parsed.source === 'unconfigured' ? parsed.source : 'cache',
    };
  } catch {
    return null;
  }
}

function blocked(message: string): Omit<RemoteLicenseStatus, 'checkedAt' | 'source'> {
  return { allowed: false, message, notification: '' };
}

function cell(row: string[], indexes: Map<string, number>, key: string) {
  const index = indexes.get(key);
  return index === undefined ? '' : (row[index] ?? '').trim();
}

function normalizeHeader(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function isTrue(value: string) {
  return ['true', '1', 'sim', 'yes', 'y'].includes(value.trim().toLowerCase());
}

function isFalse(value: string) {
  return ['false', '0', 'nao', 'nao', 'no', 'n'].includes(normalizeComparable(value));
}

function listValues(value: string) {
  return value
    .split(/[,;|\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function matchesAnyDeviceLabel(deviceLabels: string[], rules: string) {
  const normalizedLabels = deviceLabels.map(normalizeComparable).filter(Boolean);
  return listValues(rules).some((rule) => {
    const normalizedRule = normalizeComparable(rule);
    return normalizedRule && normalizedLabels.some((label) => label.includes(normalizedRule) || normalizedRule.includes(label));
  });
}

function normalizeComparable(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function compareVersions(current: string, expected: string) {
  const currentParts = versionParts(current);
  const expectedParts = versionParts(expected);
  for (let index = 0; index < Math.max(currentParts.length, expectedParts.length); index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const expectedPart = expectedParts[index] ?? 0;
    if (currentPart !== expectedPart) return currentPart > expectedPart ? 1 : -1;
  }
  return 0;
}

function versionParts(value: string) {
  return value.split('.').map((part) => Number(part.replace(/\D/g, '')) || 0);
}

function parseCsvRows(csv: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cellValue = '';
  let quoted = false;
  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];
    const next = csv[index + 1];
    if (char === '"' && quoted && next === '"') {
      cellValue += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      row.push(cellValue);
      cellValue = '';
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cellValue);
      rows.push(row);
      row = [];
      cellValue = '';
    } else {
      cellValue += char;
    }
  }
  row.push(cellValue);
  rows.push(row);
  return rows;
}
