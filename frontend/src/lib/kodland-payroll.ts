/** Allowlisted financial data. No tokens, bank details or raw provider payloads. */
export type PayrollEntry = {
  id: string; period_id: string; teacher_id: string; group_id: string;
  group_title: string; lesson_title: string; lesson_number: number; lesson_kind: string;
  lesson_date: string; planned_minutes: number; actual_minutes: number | null;
  currency: string; amount_cents: number | null; status: string; flagged_reasons: string[];
};
export type PayrollPeriod = {
  id: string; teacher_id: string; period_start: string; approval_status: string;
  currency: string; earned_cents: number | null; projected_cents: number | null;
  bonus_cents: number | null; corrections_cents: number | null;
  total_minutes: number; payable_lessons: number; projected_lessons: number;
  complete: boolean; issues: string[]; entries: PayrollEntry[]; synced_at: string;
};

export const objectRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const text = (v: unknown) => typeof v === "string" || typeof v === "number" ? String(v) : "";

/** Parse signed decimal money exactly; absent values are not zero. */
export function payrollCents(value: unknown): number | null {
  const match = text(value).match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return null;
  const cents = (Number(match[2]) * 100 + Number((match[3] ?? "").padEnd(2, "0"))) * (match[1] ? -1 : 1);
  return Number.isSafeInteger(cents) ? cents : null;
}

export function payrollList(value: unknown): Record<string, unknown>[] {
  if (objectRecord(value).next) throw new Error("A lista da folha está paginada; a importação parcial foi bloqueada.");
  const data = Array.isArray(value) ? value : objectRecord(value).results;
  if (!Array.isArray(data)) throw new Error("A folha retornou uma lista inválida.");
  return data.map(objectRecord);
}

export function normalizePayroll(summary: unknown, detail: unknown, teacherId: string): PayrollPeriod {
  const row = { ...objectRecord(summary), ...objectRecord(detail) };
  if (text(row.teacher) !== teacherId) throw new Error("A folha não pertence ao professor autenticado.");
  const id = text(row.id);
  const periodStart = text(row.period_start);
  if (!/^[\w-]+$/.test(id) || !/^\d{4}-\d{2}-01$/.test(periodStart) || !Array.isArray(row.entries)) {
    throw new Error("A folha está incompleta. O histórico anterior foi preservado.");
  }
  const issues: string[] = [];
  const currency = text(row.payout_currency || row.local_currency).toUpperCase();
  if (currency !== "BRL") issues.push("A moeda de pagamento não é BRL.");
  if (row.has_mixed_currencies || row.has_mixed_projected_currencies) issues.push("O período contém moedas diferentes.");
  if (row.has_missing_fx) issues.push("Há câmbio pendente.");
  if (row.has_missing_rate) issues.push("Há tarifa pendente.");
  const bonus = payrollCents(row.bonus_amount ?? "0");
  const corrections = payrollCents(row.corrections_amount ?? "0");
  let earned = payrollCents(row.payout_amount);
  if (earned === null && row.local_currency === "BRL" && currency === "BRL") {
    const base = payrollCents(row.total_payable_amount_local);
    if (base !== null && bonus !== null && corrections !== null) earned = base + bonus + corrections;
  }
  const projectedCount = Number(row.projected_lessons ?? 0);
  let projected = projectedCount === 0 ? 0 : payrollCents(row.projected_amount_local);
  if (projectedCount > 0 && row.projected_local_currency !== "BRL") projected = null;
  if (earned === null || projected === null) issues.push("O período não informa todos os valores em reais.");
  const entries: PayrollEntry[] = row.entries.map((value: unknown) => {
    const entry = objectRecord(value);
    const started = text(entry.lesson_started_at);
    let date = "";
    try {
      date = new Intl.DateTimeFormat("en-CA", { timeZone: text(entry.lesson_tz) || "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(started));
    } catch { /* Invalid provider dates block use of this period below. */ }
    return {
      id: text(entry.id), period_id: id, teacher_id: teacherId,
      group_id: text(entry.group_id ?? entry.group), group_title: text(entry.group_title),
      lesson_title: text(entry.lesson_title), lesson_number: Number(entry.lesson_number) || 0,
      lesson_kind: text(entry.lesson_kind), lesson_date: date,
      planned_minutes: Number(entry.lesson_length_minutes) || 0,
      actual_minutes: entry.actual_minutes == null ? null : Number(entry.actual_minutes),
      currency: text(entry.currency), amount_cents: payrollCents(entry.amount), status: text(entry.status),
      flagged_reasons: Array.isArray(entry.flagged_reasons) ? entry.flagged_reasons.map(text) : [],
    };
  });
  if (entries.some(e => !e.id || !/^\d{4}-\d{2}-\d{2}$/.test(e.lesson_date))) issues.push("Há aulas sem identificador ou data válida.");
  if (new Set(entries.map(e => e.id)).size !== entries.length) issues.push("Há aulas duplicadas na resposta.");
  if (currency === "BRL" && earned !== null && projected !== null && bonus !== null && corrections !== null) {
    const payable = entries.filter(e => ["calculated", "projected"].includes(e.status));
    if (payable.some(e => e.currency !== "BRL" || e.amount_cents === null)) issues.push("Há aulas pagáveis sem valor em reais.");
    else if (Math.abs(payable.reduce((sum, e) => sum + e.amount_cents!, 0) + bonus + corrections - earned - projected) > 1) {
      issues.push("A soma das aulas e ajustes diverge do total oficial. É necessário conferir a folha.");
    }
  }
  return {
    id, teacher_id: teacherId, period_start: periodStart, approval_status: text(row.approval_status),
    currency, earned_cents: earned, projected_cents: projected, bonus_cents: bonus, corrections_cents: corrections,
    total_minutes: Number(row.total_minutes) || 0, payable_lessons: Number(row.payable_lessons) || 0,
    projected_lessons: projectedCount, complete: issues.length === 0, issues, entries, synced_at: new Date().toISOString(),
  };
}

export const payrollStatusLabel = (value: string) => ({ draft: "Rascunho", approved: "Aprovado", paid: "Pago na Kodland" }[value] ?? value);

/** Keep provider facts separate: a non-payable entry is not necessarily canceled. */
export function payrollEntryLabels(status: string, flags: string[] = []): string[] {
  const statuses: Record<string, string> = {
    calculated: "Contabilizada", projected: "Prevista", reassigned: "Transferida para substituto",
    missing_rate: "Tarifa pendente", missing_fx: "Câmbio pendente", flagged: "Sinalizada pela Kodland",
    canceled: "Cancelada", cancelled: "Cancelada",
  };
  const reasons: Record<string, string> = {
    tutor_absent: "Falta do tutor", short_duration: "Duração insuficiente",
    no_recording: "Sem gravação", no_students: "Sem alunos na aula",
  };
  return [...new Set([
    ...(status ? [statuses[status] ?? `Situação Kodland: ${status}`] : []),
    ...flags.filter(Boolean).map(flag => reasons[flag] ?? `Sinalização Kodland: ${flag}`),
  ])];
}
