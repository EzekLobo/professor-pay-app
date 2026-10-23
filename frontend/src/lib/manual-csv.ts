const dangerousFormula = /^[=+\-@]/;
const safe = (value: unknown) => {
  const text = String(value ?? "");
  return dangerousFormula.test(text) ? `'${text}` : text;
};
const quote = (value: unknown) => `"${safe(value).replaceAll('"', '""')}"`;

export const csvText = (headers: string[], rows: unknown[][]) =>
  [headers, ...rows].map((row) => row.map(quote).join(",")).join("\r\n");

export const parseCsv = (text: string): string[][] => {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(field.trim()); field = ""; }
    else if (char === "\n") { row.push(field.trim().replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row); row = []; field = ""; }
    else field += char;
  }
  row.push(field.trim().replace(/\r$/, "")); if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("CSV inválido: aspas não foram fechadas.");
  return rows;
};

export type CsvPreview = { headers: string[]; rows: Record<string, string>[]; errors: string[] };
export const previewCsv = (text: string, required: string[]): CsvPreview => {
  const matrix = parseCsv(text); const headers = matrix[0]?.map((item) => item.trim().toLowerCase()) ?? [];
  const missing = required.filter((item) => !headers.includes(item));
  const errors = missing.map((item) => `Cabeçalho obrigatório ausente: ${item}.`);
  const rows = matrix.slice(1).map((values, index) => {
    const record = Object.fromEntries(headers.map((header, column) => [header, values[column]?.trim() ?? ""]));
    required.forEach((header) => { if (!record[header]) errors.push(`Linha ${index + 2}: ${header} não informado.`); });
    return record;
  });
  if (!rows.length) errors.push("O arquivo não possui linhas para importar.");
  return { headers, rows, errors };
};

export type ClassCsvPlan = {
  groupName: string;
  name: string;
  firstLessonDate: string;
  endDate: string | null;
  courseId: string | null;
  paymentDay: number;
  hourlyRateCents: number | null;
  studentIds: string[];
  schedules: Array<{ weekDay: number; startTime: string; durationMinutes: number }>;
};

type CsvReference = { id: string; name?: string; email?: string };
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const validDate = (value: string) => {
  if (!isoDate.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
};
const normalized = (value: string) => value.trim().toLocaleLowerCase("pt-BR");

export const validateStudentCsvRows = (rows: Record<string, string>[]) => {
  const errors: string[] = [];
  const seenEmails = new Set<string>();
  rows.forEach((row, index) => {
    const line = index + 2;
    const email = normalized(row.email ?? "");
    const status = normalized(row.situacao ?? "ativo");
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push(`Linha ${line}: e-mail inválido.`);
    if (email && seenEmails.has(email)) errors.push(`Linha ${line}: e-mail repetido no arquivo.`);
    if (email) seenEmails.add(email);
    if (!['ativo', 'inativo'].includes(status)) errors.push(`Linha ${line}: situação deve ser ativo ou inativo.`);
  });
  return errors;
};

/** Validates the complete file and collapses exported schedule rows back into one class. */
export const planClassCsvRows = (
  rows: Record<string, string>[],
  students: CsvReference[],
  courses: CsvReference[],
): { plans: ClassCsvPlan[]; errors: string[] } => {
  const errors: string[] = [];
  const grouped = new Map<string, { plan: ClassCsvPlan; signature: string; schedules: Set<string> }>();
  const studentByEmail = new Map(students.filter((item) => item.email).map((item) => [normalized(item.email!), item.id]));
  const courseByName = new Map(courses.filter((item) => item.name).map((item) => [normalized(item.name!), item.id]));

  rows.forEach((row, index) => {
    const line = index + 2;
    const weekDay = Number(row.dia_semana);
    const duration = Number(row.duracao_minutos);
    const paymentDay = Number(row.dia_pagamento);
    const parsedRate = row.tarifa_hora ? Number(row.tarifa_hora.replace(",", ".")) : null;
    const rate = parsedRate == null ? null : Math.round(parsedRate * 100);
    const emails = (row.emails_alunos ?? "").split(";").map(normalized).filter(Boolean);
    const unknown = emails.filter((email) => !studentByEmail.has(email));
    const courseId = row.curso ? courseByName.get(normalized(row.curso)) : undefined;
    if (!validDate(row.data_inicio) || (row.data_fim && (!validDate(row.data_fim) || row.data_fim < row.data_inicio))) errors.push(`Linha ${line}: confira as datas inicial e final.`);
    if (!Number.isInteger(weekDay) || weekDay < 0 || weekDay > 6) errors.push(`Linha ${line}: dia da semana deve estar entre 0 e 6.`);
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(row.horario)) errors.push(`Linha ${line}: horário inválido.`);
    if (!Number.isInteger(duration) || duration < 15 || duration > 1440) errors.push(`Linha ${line}: duração inválida.`);
    if (!Number.isInteger(paymentDay) || paymentDay < 1 || paymentDay > 31) errors.push(`Linha ${line}: dia de pagamento inválido.`);
    if (rate != null && (!Number.isFinite(rate) || rate <= 0)) errors.push(`Linha ${line}: tarifa inválida.`);
    if (unknown.length) errors.push(`Linha ${line}: aluno(s) não encontrado(s): ${unknown.join(", ")}.`);
    if (row.curso && !courseId) errors.push(`Linha ${line}: curso não encontrado.`);

    const key = `${normalized(row.grupo)}\u0000${normalized(row.nome)}`;
    const signature = JSON.stringify([row.data_inicio, row.data_fim || "", rate, paymentDay, courseId ?? null, [...emails].sort()]);
    const scheduleKey = `${weekDay}|${row.horario}|${duration}`;
    const current = grouped.get(key);
    if (current && current.signature !== signature) errors.push(`Linha ${line}: os dados gerais da turma divergem das outras linhas com o mesmo grupo e nome.`);
    else if (current && current.schedules.has(scheduleKey)) errors.push(`Linha ${line}: horário semanal repetido para a turma.`);
    else if (current) {
      current.schedules.add(scheduleKey);
      current.plan.schedules.push({ weekDay, startTime: row.horario, durationMinutes: duration });
    } else {
      grouped.set(key, {
        signature,
        schedules: new Set([scheduleKey]),
        plan: {
          groupName: row.grupo.trim(), name: row.nome.trim(), firstLessonDate: row.data_inicio,
          endDate: row.data_fim || null, courseId: courseId ?? null, paymentDay,
          hourlyRateCents: rate, studentIds: emails.map((email) => studentByEmail.get(email)!).filter(Boolean),
          schedules: [{ weekDay, startTime: row.horario, durationMinutes: duration }],
        },
      });
    }
  });
  return { plans: [...grouped.values()].map((item) => item.plan), errors };
};

export const downloadCsv = (filename: string, content: string) => {
  const url = URL.createObjectURL(new Blob([`\uFEFF${content}`], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a"); link.href = url; link.download = filename; link.click(); URL.revokeObjectURL(url);
};
