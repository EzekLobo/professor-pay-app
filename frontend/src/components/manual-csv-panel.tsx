"use client";

import { useState, type ChangeEvent } from "react";
import { Button, Input } from "@/components/ui";
import type { ManualAdapters } from "@/lib/manual-adapters";
import { manualAdapter as productionAdapter } from "@/lib/manual-adapters-runtime";
import { csvText, downloadCsv, planClassCsvRows, previewCsv, validateStudentCsvRows, type CsvPreview } from "@/lib/manual-csv";

type Kind = "students" | "classes";
const studentHeaders = ["nome", "email", "telefone", "responsavel", "telefone_responsavel", "observacoes", "situacao"];
const classHeaders = ["grupo", "nome", "data_inicio", "data_fim", "dia_semana", "horario", "duracao_minutos", "tarifa_hora", "dia_pagamento", "curso", "emails_alunos"];

export function ManualCsvPanel({ adapter = productionAdapter }: { adapter?: ManualAdapters }) {
  const [kind, setKind] = useState<Kind>("students");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const read = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const selectedKind = kind;
    const reader = new FileReader();
    reader.onload = () => void (async () => {
      try {
        const parsed = previewCsv(String(reader.result), selectedKind === "students" ? ["nome"] : ["grupo", "nome", "data_inicio", "dia_semana", "horario", "duracao_minutos", "dia_pagamento"]);
        const semanticErrors = selectedKind === "students"
          ? validateStudentCsvRows(parsed.rows)
          : planClassCsvRows(parsed.rows, await adapter.teaching.students(), await adapter.courses.list()).errors;
        setPreview({ ...parsed, errors: [...parsed.errors, ...semanticErrors] });
        setError("");
      } catch (reason) { setError(reason instanceof Error ? reason.message : "CSV inválido."); }
    })();
    reader.readAsText(file, "UTF-8");
  };

  const exportRows = async () => {
    if (kind === "students") {
      const rows = await adapter.teaching.students();
      downloadCsv("alunos.csv", csvText(studentHeaders, rows.map((item) => [item.name, item.email, item.phone, item.guardian_name, item.guardian_phone, item.notes, item.active ? "ativo" : "inativo"])));
      return;
    }
    const [classes, groups, students, courses] = await Promise.all([adapter.teaching.classes(), adapter.teaching.groups(), adapter.teaching.students(), adapter.courses.list()]);
    downloadCsv("turmas.csv", csvText(classHeaders, classes.flatMap((item) => item.schedule_slots.map((slot) => {
      const rate = (item.rate_history ?? []).at(-1)?.hourly_rate_cents;
      return [groups.find((group) => group.id === item.group_id)?.name ?? "", item.name, item.first_lesson_date, item.end_date ?? "", slot.week_day, slot.start_time, slot.duration_minutes, rate == null ? "" : (rate / 100).toFixed(2), item.payment_day, courses.find((course) => course.id === item.course_id)?.name ?? "", item.student_ids.map((id) => students.find((student) => student.id === id)?.email).filter(Boolean).join(";")];
    }))));
  };

  const commit = async () => {
    if (!preview || preview.errors.length || busy) return;
    setBusy(true); setError("");
    try {
      if (kind === "students") {
        const validationErrors = validateStudentCsvRows(preview.rows);
        if (validationErrors.length) throw new Error(validationErrors.join("\n"));
        await Promise.all(preview.rows.map((row) => adapter.teaching.saveStudent({ name: row.nome, email: row.email, phone: row.telefone, guardian_name: row.responsavel, guardian_phone: row.telefone_responsavel, notes: row.observacoes, active: (row.situacao || "ativo").toLowerCase() !== "inativo" })));
        setNotice(`${preview.rows.length} aluno(s) importado(s).`);
      } else {
        const [existingGroups, students, courses] = await Promise.all([adapter.teaching.groups(), adapter.teaching.students(), adapter.courses.list()]);
        const { plans, errors } = planClassCsvRows(preview.rows, students, courses);
        if (errors.length) throw new Error(errors.join("\n"));
        const groupMap = new Map(existingGroups.map((item) => [item.name.toLocaleLowerCase("pt-BR"), item]));
        for (const plan of plans) {
          const groupKey = plan.groupName.toLocaleLowerCase("pt-BR");
          let group = groupMap.get(groupKey);
          if (!group) {
            group = await adapter.teaching.saveGroup({ name: plan.groupName, order: groupMap.size });
            groupMap.set(groupKey, group);
          }
          const saved = await adapter.teaching.saveClass({
            name: plan.name, group_id: group.id, course_id: plan.courseId,
            first_lesson_date: plan.firstLessonDate, end_date: plan.endDate,
            schedule_slots: plan.schedules.map((slot) => ({ id: crypto.randomUUID(), week_day: slot.weekDay, start_time: slot.startTime, duration_minutes: slot.durationMinutes })),
            hourly_rate_cents: plan.hourlyRateCents, payment_day: plan.paymentDay, student_ids: plan.studentIds, active: true,
          });
          await adapter.operations.ensureOccurrences(saved.id);
        }
        setNotice(`${plans.length} turma(s) importada(s) a partir de ${preview.rows.length} linha(s).`);
      }
      setPreview(null);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível importar o CSV."); }
    finally { setBusy(false); }
  };

  return <section className="panel data-backup-card">
    <div className="data-backup-heading"><div><h2>Importar e exportar CSV</h2><p className="muted">A prévia valida todas as linhas antes da gravação. Em turmas, use dia da semana de 0 (domingo) a 6 (sábado) e separe e-mails por ponto e vírgula.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice">{notice}</p>}
    <div className="data-backup-actions"><label className="field">Tipo<select className="input" value={kind} onChange={(event) => { setKind(event.target.value as Kind); setPreview(null); }}><option value="students">Alunos</option><option value="classes">Turmas e matrículas</option></select></label><label className="field">Arquivo CSV<Input aria-label="Arquivo CSV para importação" type="file" accept=".csv,text/csv" onChange={read} /></label><Button className="button-ghost" type="button" onClick={() => void exportRows()}>Exportar CSV</Button></div>
    {preview && <div className="csv-preview"><p>{preview.rows.length} linha(s) encontradas.</p>{preview.errors.length > 0 && <ul className="form-error">{preview.errors.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul>}<Button type="button" disabled={busy || preview.errors.length > 0} onClick={() => void commit()}>{busy ? "Importando…" : "Confirmar importação"}</Button></div>}
  </section>;
}
