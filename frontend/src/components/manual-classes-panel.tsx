"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import {
  kodlandClassSettingsApi,
  manualTeachingApi,
  teachingSettingsApi,
  type KodlandGroup,
} from "@/lib/api";
import type { ManualClass, ManualClassInput, ManualStudent } from "@/lib/manual-teaching";

const weekDays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const moneyText = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2);
const parseMoney = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
};
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const emptyInput = (): ManualClassInput => ({
  name: "", first_lesson_date: todayLocal(), end_date: null,
  schedule_slots: [{ id: crypto.randomUUID(), week_day: 0, start_time: "18:00", duration_minutes: 60 }],
  student_ids: [], hourly_rate_cents: null, payment_day: 15,
});

export function ManualClassesPanel({ groups }: { groups: KodlandGroup[] }) {
  const [classes, setClasses] = useState<ManualClass[]>([]);
  const [students, setStudents] = useState<ManualStudent[]>([]);
  const [defaultRate, setDefaultRate] = useState<number | null>(null);
  const [defaultRateInput, setDefaultRateInput] = useState("");
  const [settingsByGroup, setSettingsByGroup] = useState<Record<string, { hourly_rate_cents: number | null; payment_day: number }>>({});
  const [selectedGroup, setSelectedGroup] = useState<KodlandGroup | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [paymentDay, setPaymentDay] = useState(15);
  const [editing, setEditing] = useState<ManualClass | "new" | null>(null);
  const [classInput, setClassInput] = useState<ManualClassInput>(emptyInput);
  const [classRateInput, setClassRateInput] = useState("");
  const [studentInput, setStudentInput] = useState<{ id?: string; name: string; email: string; phone: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [ownClasses, ownStudents, account, kodlandSettings] = await Promise.all([
      manualTeachingApi.classes(), manualTeachingApi.students(),
      teachingSettingsApi.get(), kodlandClassSettingsApi.list(),
    ]);
    setClasses(ownClasses);
    setStudents(ownStudents);
    setDefaultRate(account.default_hourly_rate_cents);
    setDefaultRateInput(moneyText(account.default_hourly_rate_cents));
    setSettingsByGroup(Object.fromEntries(kodlandSettings.map((item) => [item.id, {
      hourly_rate_cents: item.rate_history.at(-1)?.hourly_rate_cents ?? null,
      payment_day: item.payment_day,
    }])));
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar seus cadastros."));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const save = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await action();
      await load();
      setNotice(message);
      window.dispatchEvent(new Event("nexusclass:manual-teaching-changed"));
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
      return false;
    } finally { setBusy(false); }
  };
  const editClass = (item?: ManualClass) => {
    setError("");
    setEditing(item ?? "new");
    setClassRateInput(moneyText(item?.rate_history?.at(-1)?.hourly_rate_cents));
    setClassInput(item ? {
      name: item.name, first_lesson_date: item.first_lesson_date,
      end_date: item.end_date,
      schedule_slots: item.schedule_slots.filter((slot) => !slot.effective_until || slot.effective_until >= todayLocal()).map((slot) => ({
        id: slot.id, week_day: slot.week_day, start_time: slot.start_time, duration_minutes: slot.duration_minutes,
      })),
      student_ids: item.student_ids ?? [],
      hourly_rate_cents: item.rate_history?.at(-1)?.hourly_rate_cents ?? null,
      payment_day: item.payment_day ?? 15,
    } : emptyInput());
  };
  const openGroupSettings = (group: KodlandGroup) => {
    const current = settingsByGroup[group.external_id];
    setSelectedGroup(group);
    setRateInput(moneyText(current?.hourly_rate_cents));
    setPaymentDay(current?.payment_day ?? 15);
    setError("");
  };
  const changeSlot = (id: string, patch: Partial<ManualClassInput["schedule_slots"][number]>) =>
    setClassInput((item) => ({ ...item, schedule_slots: item.schedule_slots.map((slot) => slot.id === id ? { ...slot, ...patch } : slot) }));

  return <>
    <section className="panel manual-teaching-panel">
      <div className="section-heading"><div><h2>Suas turmas</h2><p className="muted">Cadastre turmas e alunos mesmo sem usar a Kodland.</p></div>
        <div className="card-actions"><button className="button button-ghost" type="button" onClick={() => setStudentInput({ name: "", email: "", phone: "" })}>Adicionar aluno</button>
          <button className="button" type="button" onClick={() => editClass()}>Adicionar turma</button></div>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}
      <form className="manual-rate-form" onSubmit={(event) => { event.preventDefault(); void save(() => teachingSettingsApi.setDefaultRate(parseMoney(defaultRateInput) ?? NaN), "Valor padrão atualizado para as próximas aulas."); }}>
        <label>Valor padrão por hora (R$)<input className="input" inputMode="decimal" value={defaultRateInput} onChange={(event) => setDefaultRateInput(event.target.value)} placeholder="Ex.: 50,00" /></label>
        <button className="button button-ghost" disabled={busy} type="submit">Salvar valor</button>
        <span className="muted">{defaultRate == null ? "Informe o valor padrão ou um valor próprio ao criar cada turma." : "Turmas sem valor específico usam esta tarifa."}</span>
      </form>
      {classes.length === 0 ? <p className="muted">Nenhuma turma própria cadastrada.</p> :
        <div className="accordion-list">{classes.map((item) => <div className="group-accordion manual-class-card" key={item.id}>
          <div className="group-accordion-summary"><span className="group-summary-copy"><strong>{item.name}</strong><span className="group-course-name">{item.active ? "Ativa" : "Inativa"} · {item.schedule_slots.filter((slot) => !slot.effective_until || slot.effective_until >= todayLocal()).map((slot) => `${weekDays[slot.week_day]} ${slot.start_time}`).join(", ") || "Sem horários futuros"}</span></span>
          <span className="group-student-count">{item.student_ids.filter((id) => students.some((student) => student.id === id && student.active)).length} alunos</span></div>
          <div className="card-actions"><button className="button button-ghost button-small" type="button" onClick={() => editClass(item)}>Editar</button>{item.active && <button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => { if (window.confirm(`Desativar ${item.name}? As aulas anteriores serão preservadas.`)) void save(() => manualTeachingApi.deactivateClass(item.id), "Turma desativada."); }}>Desativar</button>}</div>
        </div>)}</div>}
      {students.length > 0 && <div className="manual-students"><h3>Alunos próprios</h3><div className="student-list">{students.map((student) => <div className="student-row" key={student.id}><strong>{student.name}</strong><span className="muted">{student.active ? student.email || student.phone || "Ativo" : "Inativo"}</span><button className="button button-ghost button-small" type="button" onClick={() => setStudentInput(student)}>Editar</button>{student.active && <button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => { if (window.confirm(`Desativar ${student.name}?`)) void save(() => manualTeachingApi.deactivateStudent(student.id), "Aluno desativado."); }}>Desativar</button>}</div>)}</div></div>}
    </section>
    {groups.length > 0 && <section className="panel manual-teaching-panel"><h2>Valores das turmas Kodland</h2><p className="muted">As escolhas ficam no NexusClass e não são substituídas pela sincronização.</p><div className="student-list">{groups.filter((group) => !group.archived).map((group) => <div className="student-row" key={group.external_id}><strong>{group.title}</strong><span className="muted">{settingsByGroup[group.external_id]?.hourly_rate_cents == null ? "Valor padrão" : `R$ ${moneyText(settingsByGroup[group.external_id].hourly_rate_cents)}/h`}</span><button className="button button-ghost button-small" type="button" onClick={() => openGroupSettings(group)}>Configurar</button></div>)}</div></section>}
    <Modal open={Boolean(studentInput)} title={studentInput?.id ? "Editar aluno" : "Adicionar aluno"} onClose={() => setStudentInput(null)}>
      {studentInput && <form className="management-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(() => manualTeachingApi.saveStudent(studentInput), "Aluno salvo.").then((ok) => { if (ok) setStudentInput(null); }); }}>
        <label>Nome<input required className="input" value={studentInput.name} onChange={(event) => setStudentInput({ ...studentInput, name: event.target.value })} /></label>
        <label>E-mail<input type="email" className="input" value={studentInput.email} onChange={(event) => setStudentInput({ ...studentInput, email: event.target.value })} /></label>
        <label>Telefone<input className="input" value={studentInput.phone} onChange={(event) => setStudentInput({ ...studentInput, phone: event.target.value })} /></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button" disabled={busy} type="submit">Salvar aluno</button>
      </form>}
    </Modal>
    <Modal open={Boolean(editing)} title={editing === "new" ? "Adicionar turma" : "Editar turma"} onClose={() => setEditing(null)} className="manual-class-modal">
      {editing && <form className="management-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(() => manualTeachingApi.saveClass({ ...classInput, hourly_rate_cents: parseMoney(classRateInput), id: editing === "new" ? undefined : editing.id }), "Turma salva.").then((ok) => { if (ok) setEditing(null); }); }}>
        <label>Nome da turma<input required className="input" value={classInput.name} onChange={(event) => setClassInput({ ...classInput, name: event.target.value })} /></label>
        <div className="manual-form-grid"><label>Início<input required type="date" className="input" disabled={editing !== "new"} value={classInput.first_lesson_date} onChange={(event) => setClassInput({ ...classInput, first_lesson_date: event.target.value })} /></label><label>Fim opcional<input type="date" className="input" value={classInput.end_date ?? ""} onChange={(event) => setClassInput({ ...classInput, end_date: event.target.value || null })} /></label></div>
        <div className="manual-form-grid"><label>Tarifa da turma (R$/h)<input className="input" inputMode="decimal" value={classRateInput} onChange={(event) => setClassRateInput(event.target.value)} placeholder={defaultRate == null ? "Obrigatório sem padrão" : `Padrão R$ ${moneyText(defaultRate)}`} /></label><label>Dia do recebimento<input className="input" type="number" min="1" max="31" value={classInput.payment_day} onChange={(event) => setClassInput({ ...classInput, payment_day: Number(event.target.value) })} /></label></div>
        <fieldset className="manual-slots"><legend>Horários semanais</legend>{classInput.schedule_slots.map((slot) => <div className="manual-slot-row" key={slot.id}><select className="input" aria-label="Dia da semana" value={slot.week_day} onChange={(event) => changeSlot(slot.id, { week_day: Number(event.target.value) })}>{weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><input className="input" type="time" aria-label="Hora" value={slot.start_time} onChange={(event) => changeSlot(slot.id, { start_time: event.target.value })} /><input className="input" type="number" min="1" aria-label="Duração em minutos" value={slot.duration_minutes} onChange={(event) => changeSlot(slot.id, { duration_minutes: Number(event.target.value) })} /><button className="button button-ghost button-small" type="button" aria-label="Remover horário" onClick={() => setClassInput((item) => ({ ...item, schedule_slots: item.schedule_slots.filter((current) => current.id !== slot.id) }))}>Remover</button></div>)}<button className="button button-ghost button-small" type="button" onClick={() => setClassInput((item) => ({ ...item, schedule_slots: [...item.schedule_slots, { id: crypto.randomUUID(), week_day: 0, start_time: "18:00", duration_minutes: 60 }] }))}>Adicionar horário</button></fieldset>
        <fieldset className="manual-student-options"><legend>Alunos</legend>{students.filter((student) => student.active).length ? students.filter((student) => student.active).map((student) => <label key={student.id}><input type="checkbox" checked={classInput.student_ids.includes(student.id)} onChange={(event) => setClassInput((item) => ({ ...item, student_ids: event.target.checked ? [...item.student_ids, student.id] : item.student_ids.filter((id) => id !== student.id) }))} /> {student.name}</label>) : <p className="muted">Você pode adicionar alunos depois.</p>}</fieldset>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button" disabled={busy} type="submit">Salvar turma</button>
      </form>}
    </Modal>
    <Modal open={Boolean(selectedGroup)} title={selectedGroup ? `Valor · ${selectedGroup.title}` : "Valor"} onClose={() => setSelectedGroup(null)}>
      {selectedGroup && <form className="management-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(() => kodlandClassSettingsApi.save(selectedGroup.external_id, { hourly_rate_cents: parseMoney(rateInput), payment_day: paymentDay }), "Configuração salva para as próximas aulas.").then((ok) => { if (ok) setSelectedGroup(null); }); }}><label>Tarifa específica (R$/h)<input className="input" inputMode="decimal" value={rateInput} onChange={(event) => setRateInput(event.target.value)} placeholder="Deixe vazio para usar o padrão" /></label><label>Dia do recebimento<input className="input" type="number" min="1" max="31" value={paymentDay} onChange={(event) => setPaymentDay(Number(event.target.value))} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" disabled={busy} type="submit">Salvar</button></form>}
    </Modal>
  </>;
}
