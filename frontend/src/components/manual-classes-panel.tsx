"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Modal } from "@/components/modal";
import { manualTeachingApi, teachingSettingsApi } from "@/lib/api";
import type { ManualClass, ManualClassGroup, ManualClassGroupInput, ManualClassInput, ManualStudent } from "@/lib/manual-teaching";
import type { ManualAdapters } from "@/lib/manual-adapters";

const weekDays = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
const moneyText = (cents: number | null | undefined) => cents == null ? "" : (cents / 100).toFixed(2);
const parseMoney = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
};
const todayLocal = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const emptyInput = (): ManualClassInput => ({ group_id: null, name: "", first_lesson_date: todayLocal(), end_date: null, schedule_slots: [{ id: crypto.randomUUID(), week_day: 0, start_time: "18:00", duration_minutes: 60 }], student_ids: [], hourly_rate_cents: null, payment_day: 15 });
const emptyStudent = () => ({ name: "", email: "", phone: "" });
const emptyGroup = (): ManualClassGroupInput => ({ name: "" });

type StudentInput = { id?: string; name: string; email: string; phone: string };

/** Personal teaching stays separate from the virtual Kodland grouping. */
export function ManualClassesPanel({ adapter }: { adapter?: ManualAdapters }) {
  const teaching = adapter?.teaching ?? manualTeachingApi;
  const settings = adapter?.settings ?? teachingSettingsApi;
  const [classes, setClasses] = useState<ManualClass[]>([]);
  const [students, setStudents] = useState<ManualStudent[]>([]);
  const [personalGroups, setPersonalGroups] = useState<ManualClassGroup[]>([]);
  const [defaultRate, setDefaultRate] = useState<number | null>(null);
  const [defaultRateInput, setDefaultRateInput] = useState("");
  const [editing, setEditing] = useState<ManualClass | "new" | null>(null);
  const [classInput, setClassInput] = useState<ManualClassInput>(emptyInput);
  const [classRateInput, setClassRateInput] = useState("");
  const [newGroupName, setNewGroupName] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [inlineStudent, setInlineStudent] = useState<StudentInput | null>(null);
  const [studentInput, setStudentInput] = useState<StudentInput | null>(null);
  const [groupManagerOpen, setGroupManagerOpen] = useState(false);
  const [groupInput, setGroupInput] = useState<ManualClassGroupInput | null>(null);
  const [financeOpen, setFinanceOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const [ownClasses, ownStudents, ownGroups, account] = await Promise.all([
      teaching.classes(), teaching.students(), teaching.groups(), settings.get(),
    ]);
    setClasses(ownClasses); setStudents(ownStudents); setPersonalGroups(ownGroups);
    setDefaultRate(account.default_hourly_rate_cents); setDefaultRateInput(moneyText(account.default_hourly_rate_cents));
  }, [teaching, settings]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar seus cadastros.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const save = async (action: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(""); setNotice("");
    try {
      await action(); await load(); setNotice(message);
      if (!adapter) window.dispatchEvent(new Event("nexusclass:manual-teaching-changed"));
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar.");
      return false;
    } finally { setBusy(false); }
  };

  const editClass = (item?: ManualClass) => {
    setError(""); setNewGroupName(""); setCreatingGroup(false); setInlineStudent(null); setEditing(item ?? "new");
    setClassRateInput(moneyText(item?.rate_history?.at(-1)?.hourly_rate_cents));
    setClassInput(item ? {
      group_id: item.group_id ?? null, name: item.name, first_lesson_date: item.first_lesson_date, end_date: item.end_date,
      schedule_slots: item.schedule_slots.filter((slot) => !slot.effective_until || slot.effective_until >= todayLocal()).map((slot) => ({ id: slot.id, week_day: slot.week_day, start_time: slot.start_time, duration_minutes: slot.duration_minutes })),
      student_ids: item.student_ids ?? [], hourly_rate_cents: item.rate_history?.at(-1)?.hourly_rate_cents ?? null, payment_day: item.payment_day ?? 15,
    } : emptyInput());
  };
  const changeSlot = (id: string, patch: Partial<ManualClassInput["schedule_slots"][number]>) => setClassInput((item) => ({ ...item, schedule_slots: item.schedule_slots.map((slot) => slot.id === id ? { ...slot, ...patch } : slot) }));
  const groupedClasses = (groupId: string) => classes.filter((item) => item.group_id === groupId);
  const legacyClasses = classes.filter((item) => !item.group_id);

  const saveInlineStudent = async () => {
    if (!inlineStudent) return;
    const student = await teaching.saveStudent(inlineStudent);
    await load();
    setClassInput((current) => ({ ...current, student_ids: current.student_ids.includes(student.id) ? current.student_ids : [...current.student_ids, student.id] }));
    setInlineStudent(null); setNotice("Aluno cadastrado e selecionado para esta turma.");
    if (!adapter) window.dispatchEvent(new Event("nexusclass:manual-teaching-changed"));
  };

  const saveClass = async () => {
    if (editing === null) return false;
    const groupName = newGroupName.trim();
    if (creatingGroup && !groupName) { setError("Informe o nome do novo grupo."); return false; }
    if (editing === "new" && !creatingGroup && !classInput.group_id) { setError("Selecione ou crie um grupo para a nova turma."); return false; }
    let createdGroup: ManualClassGroup | null = null;
    setBusy(true); setError(""); setNotice("");
    try {
      if (creatingGroup) createdGroup = await teaching.saveGroup({ name: groupName });
      await teaching.saveClass({ ...classInput, group_id: createdGroup?.id ?? classInput.group_id, hourly_rate_cents: parseMoney(classRateInput), id: editing === "new" ? undefined : editing.id });
      await load(); setEditing(null); setNotice(createdGroup ? "Grupo e turma salvos." : "Turma salva.");
      if (!adapter) window.dispatchEvent(new Event("nexusclass:manual-teaching-changed"));
      return true;
    } catch (reason) {
      if (createdGroup) { try { await teaching.deleteGroup(createdGroup.id); } catch { /* preserve the group if cleanup cannot run */ } }
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a turma.");
      return false;
    } finally { setBusy(false); }
  };

  return <>
    <section className="panel manual-teaching-panel" data-tour="classes-personal-groups">
      <div className="section-heading classes-compact-heading"><h2>Turmas pessoais</h2><div className="card-actions"><button className="button" data-tour="classes-add-class" type="button" onClick={() => editClass()}>Adicionar nova turma</button></div></div>
      <div className="manual-utilities"><button className="button button-ghost button-small" type="button" onClick={() => { setGroupInput(null); setGroupManagerOpen(true); }}>Gerenciar grupos e alunos</button><button className="button button-ghost button-small" type="button" onClick={() => { setDefaultRateInput(moneyText(defaultRate)); setFinanceOpen(true); }}>Configurações financeiras</button></div>
      {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
      {personalGroups.length === 0 && legacyClasses.length === 0 ? <p className="muted">Crie um grupo e cadastre sua primeira turma.</p> : <div className="accordion-list personal-groups-list">
        {personalGroups.map((group) => {
          const classrooms = groupedClasses(group.id);
          const studentCount = new Set(classrooms.flatMap((item) => item.student_ids).filter((id) => students.some((student) => student.id === id && student.active))).size;
          return <details className="group-accordion personal-group-accordion" key={group.id} open={group.active}>
            <summary className="group-accordion-summary"><span className="group-summary-copy"><strong>{group.name}</strong><span className="group-course-name">{group.active ? "Grupo pessoal" : "Grupo desativado"}</span></span><span className="group-student-count">{classrooms.length} turma{classrooms.length === 1 ? "" : "s"} · {studentCount} aluno{studentCount === 1 ? "" : "s"}</span></summary>
            <div className="group-accordion-body manual-group-body">{classrooms.length === 0 ? <p className="muted">Nenhuma turma neste grupo.</p> : classrooms.map((item) => <ClassRow key={item.id} item={item} students={students} busy={busy} onEdit={() => editClass(item)} onDeactivate={() => { if (window.confirm(`Desativar ${item.name}? As aulas anteriores serão preservadas.`)) void save(() => teaching.deactivateClass(item.id), "Turma desativada."); }} />)}</div>
          </details>;
        })}
        {legacyClasses.length > 0 && <details className="group-accordion personal-group-accordion legacy-group" open><summary className="group-accordion-summary"><span className="group-summary-copy"><strong>Sem grupo</strong><span className="group-course-name">Turmas cadastradas antes da organização por grupos</span></span><span className="group-student-count">{legacyClasses.length} turma{legacyClasses.length === 1 ? "" : "s"}</span></summary><div className="group-accordion-body manual-group-body"><p className="muted">Edite uma turma para vinculá-la a um grupo.</p>{legacyClasses.map((item) => <ClassRow key={item.id} item={item} students={students} busy={busy} onEdit={() => editClass(item)} onDeactivate={() => { if (window.confirm(`Desativar ${item.name}? As aulas anteriores serão preservadas.`)) void save(() => teaching.deactivateClass(item.id), "Turma desativada."); }} />)}</div></details>}
      </div>}
    </section>

    <Modal open={Boolean(editing)} title={editing === "new" ? "Adicionar nova turma" : "Editar turma"} onClose={() => setEditing(null)} className="manual-class-modal">
      {editing && <form className="management-form manual-class-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void saveClass(); }}>
        <section className="manual-form-section manual-class-basics" aria-labelledby="manual-class-basics-title">
          <div className="manual-section-heading"><h3 id="manual-class-basics-title">Turma e grupo</h3></div>
          <label className="manual-field-wide">Nome da turma<input required className="input" value={classInput.name} onChange={(event) => setClassInput({ ...classInput, name: event.target.value })} /></label>
          <fieldset className="manual-group-choice"><legend>Grupo</legend><div className="manual-group-options"><label className="manual-choice-card"><input type="radio" checked={!creatingGroup} onChange={() => setCreatingGroup(false)} /><span>Usar grupo existente</span></label><label className="manual-choice-card"><input type="radio" checked={creatingGroup} onChange={() => setCreatingGroup(true)} /><span>Criar novo grupo</span></label></div>{!creatingGroup ? <label>Grupo<select required className="input" value={classInput.group_id ?? ""} onChange={(event) => setClassInput({ ...classInput, group_id: event.target.value || null })}><option value="">{editing === "new" ? "Selecione um grupo" : "Sem grupo (legado)"}</option>{personalGroups.filter((group) => group.active || group.id === classInput.group_id).map((group) => <option key={group.id} value={group.id}>{group.name}{group.active ? "" : " (desativado)"}</option>)}</select></label> : <label>Nome do grupo<input required className="input" value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Ex.: Turmas autônomas" /></label>}</fieldset>
        </section>

        <section className="manual-form-section" aria-labelledby="manual-class-schedule-title">
          <div className="manual-section-heading"><h3 id="manual-class-schedule-title">Agenda</h3></div>
          <div className="manual-form-grid"><label>Início<input required type="date" className="input" disabled={editing !== "new"} value={classInput.first_lesson_date} onChange={(event) => setClassInput({ ...classInput, first_lesson_date: event.target.value })} /></label><label>Fim opcional<input type="date" className="input" value={classInput.end_date ?? ""} onChange={(event) => setClassInput({ ...classInput, end_date: event.target.value || null })} /></label></div>
          <fieldset className="manual-slots"><legend>Horários semanais</legend><div className="manual-slot-labels" aria-hidden="true"><span>Dia</span><span>Horário</span><span>Duração</span></div>{classInput.schedule_slots.map((slot) => <div className="manual-slot-row" key={slot.id}><select className="input" aria-label="Dia da semana" value={slot.week_day} onChange={(event) => changeSlot(slot.id, { week_day: Number(event.target.value) })}>{weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select><input className="input" type="time" aria-label="Hora" value={slot.start_time} onChange={(event) => changeSlot(slot.id, { start_time: event.target.value })} /><label className="manual-duration-input"><span className="sr-only">Duração em minutos</span><input className="input" type="number" min="1" aria-label="Duração em minutos" value={slot.duration_minutes} onChange={(event) => changeSlot(slot.id, { duration_minutes: Number(event.target.value) })} /><span>min</span></label><button className="button button-ghost button-small" type="button" aria-label="Remover horário" onClick={() => setClassInput((item) => ({ ...item, schedule_slots: item.schedule_slots.filter((current) => current.id !== slot.id) }))}>Remover</button></div>)}<button className="button button-ghost button-small manual-add-slot" type="button" onClick={() => setClassInput((item) => ({ ...item, schedule_slots: [...item.schedule_slots, { id: crypto.randomUUID(), week_day: 0, start_time: "18:00", duration_minutes: 60 }] }))}>Adicionar horário</button></fieldset>
        </section>

        <section className="manual-form-section" aria-labelledby="manual-class-finance-title">
          <div className="manual-section-heading"><h3 id="manual-class-finance-title">Financeiro</h3></div>
          <div className="manual-form-grid"><label>Tarifa da turma (R$/h)<input className="input" inputMode="decimal" value={classRateInput} onChange={(event) => setClassRateInput(event.target.value)} placeholder={defaultRate == null ? "Obrigatório sem padrão" : `Padrão R$ ${moneyText(defaultRate)}`} /></label><label>Dia do recebimento<input className="input" type="number" min="1" max="31" value={classInput.payment_day} onChange={(event) => setClassInput({ ...classInput, payment_day: Number(event.target.value) })} /></label></div>
        </section>

        <section className="manual-form-section" aria-labelledby="manual-class-students-title">
          <div className="manual-section-heading"><h3 id="manual-class-students-title">Alunos</h3><button className="button button-ghost button-small" type="button" onClick={() => { setInlineStudent(emptyStudent()); setError(""); }}>Cadastrar aluno</button></div>
          <fieldset className="manual-student-options"><legend className="sr-only">Alunos vinculados</legend>{students.filter((student) => student.active).length ? <div className="manual-student-list">{students.filter((student) => student.active).map((student) => <label key={student.id}><input type="checkbox" checked={classInput.student_ids.includes(student.id)} onChange={(event) => setClassInput((item) => ({ ...item, student_ids: event.target.checked ? [...item.student_ids, student.id] : item.student_ids.filter((id) => id !== student.id) }))} /> <span>{student.name}</span></label>)}</div> : <p className="muted">Cadastre um aluno para vinculá-lo a esta turma.</p>}</fieldset>
        </section>
        {inlineStudent && <fieldset className="inline-student-form"><legend>Novo aluno</legend><div className="manual-form-grid"><label>Nome<input required className="input" value={inlineStudent.name} onChange={(event) => setInlineStudent({ ...inlineStudent, name: event.target.value })} /></label><label>E-mail<input type="email" className="input" value={inlineStudent.email} onChange={(event) => setInlineStudent({ ...inlineStudent, email: event.target.value })} /></label></div><label>Telefone<input className="input" value={inlineStudent.phone} onChange={(event) => setInlineStudent({ ...inlineStudent, phone: event.target.value })} /></label><div className="card-actions"><button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => { void saveInlineStudent().catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível cadastrar o aluno.")); }}>Salvar aluno</button><button className="button button-ghost button-small" type="button" onClick={() => setInlineStudent(null)}>Cancelar</button></div></fieldset>}
        {error && <p className="form-error" role="alert">{error}</p>}<div className="manual-class-form-footer"><button className="button" disabled={busy} type="submit">Salvar turma</button></div>
      </form>}
    </Modal>

    <Modal open={groupManagerOpen} title="Gerenciar grupos e alunos" onClose={() => setGroupManagerOpen(false)} className="manual-class-modal"><div className="management-form"><div className="section-heading"><h3>Grupos pessoais</h3><button className="button button-ghost button-small" type="button" onClick={() => setGroupInput(groupInput ? null : emptyGroup())}>{groupInput ? "Cancelar" : "Novo grupo"}</button></div>{groupInput && <form className="inline-manager-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(() => teaching.saveGroup(groupInput), groupInput.id ? "Grupo atualizado." : "Grupo criado.").then((ok) => { if (ok) setGroupInput(null); }); }}><label>Nome<input required className="input" value={groupInput.name} onChange={(event) => setGroupInput({ ...groupInput, name: event.target.value })} /></label><label>Ordem<input className="input" type="number" min="0" value={groupInput.order ?? personalGroups.length} onChange={(event) => setGroupInput({ ...groupInput, order: Number(event.target.value) })} /></label><button className="button button-small" disabled={busy} type="submit">Salvar grupo</button></form>}<div className="student-list">{personalGroups.map((group) => <div className="student-row" key={group.id}><strong>{group.name}</strong><span className="muted">{group.active ? `${groupedClasses(group.id).length} turma(s)` : "Desativado"}</span><div className="card-actions"><button className="button button-ghost button-small" type="button" onClick={() => setGroupInput({ id: group.id, name: group.name, order: group.order, active: group.active })}>Editar</button><button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => void save(() => teaching.saveGroup({ id: group.id, name: group.name, order: group.order, active: !group.active }), group.active ? "Grupo desativado." : "Grupo reativado.")}>{group.active ? "Desativar" : "Reativar"}</button>{groupedClasses(group.id).length === 0 && <button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => { if (window.confirm(`Excluir o grupo ${group.name}?`)) void save(() => teaching.deleteGroup(group.id), "Grupo excluído."); }}>Excluir</button>}</div></div>)}</div><h3>Alunos próprios</h3><div className="student-list">{students.length === 0 ? <p className="muted">Os alunos podem ser cadastrados ao criar ou editar uma turma.</p> : students.map((student) => <div className="student-row" key={student.id}><strong>{student.name}</strong><span className="muted">{student.active ? student.email || student.phone || "Ativo" : "Inativo"}</span><div className="card-actions"><button className="button button-ghost button-small" type="button" onClick={() => setStudentInput(student)}>Editar</button>{student.active && <button className="button button-ghost button-small" type="button" disabled={busy} onClick={() => { if (window.confirm(`Desativar ${student.name}?`)) void save(() => teaching.deactivateStudent(student.id), "Aluno desativado."); }}>Desativar</button>}</div></div>)}</div></div></Modal>
    <Modal open={Boolean(studentInput)} title={studentInput?.id ? "Editar aluno" : "Adicionar aluno"} onClose={() => setStudentInput(null)}>{studentInput && <form className="management-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(() => teaching.saveStudent(studentInput), "Aluno salvo.").then((ok) => { if (ok) setStudentInput(null); }); }}><label>Nome<input required className="input" value={studentInput.name} onChange={(event) => setStudentInput({ ...studentInput, name: event.target.value })} /></label><label>E-mail<input type="email" className="input" value={studentInput.email} onChange={(event) => setStudentInput({ ...studentInput, email: event.target.value })} /></label><label>Telefone<input className="input" value={studentInput.phone} onChange={(event) => setStudentInput({ ...studentInput, phone: event.target.value })} /></label>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" disabled={busy} type="submit">Salvar aluno</button></form>}</Modal>
    <Modal open={financeOpen} title="Configurações financeiras" onClose={() => setFinanceOpen(false)}><form className="management-form" onSubmit={(event: FormEvent) => { event.preventDefault(); void save(() => settings.setDefaultRate(parseMoney(defaultRateInput) ?? NaN), "Valor padrão atualizado para as próximas aulas.").then((ok) => { if (ok) setFinanceOpen(false); }); }}><label>Valor padrão por hora (R$)<input className="input" inputMode="decimal" value={defaultRateInput} onChange={(event) => setDefaultRateInput(event.target.value)} placeholder="Ex.: 50,00" /></label><p className="muted">Turmas sem tarifa própria usam este valor somente nas próximas aulas.</p>{error && <p className="form-error" role="alert">{error}</p>}<button className="button" disabled={busy} type="submit">Salvar valor</button></form></Modal>
  </>;
}

function ClassRow({ item, students, busy, onEdit, onDeactivate }: { item: ManualClass; students: ManualStudent[]; busy: boolean; onEdit: () => void; onDeactivate: () => void }) {
  const futureSlots = item.schedule_slots.filter((slot) => !slot.effective_until || slot.effective_until >= todayLocal());
  return <div className="manual-class-card"><div className="group-accordion-summary"><span className="group-summary-copy"><strong>{item.name}</strong><span className="group-course-name">{item.active ? "Ativa" : "Inativa"} · {futureSlots.map((slot) => `${weekDays[slot.week_day]} ${slot.start_time}`).join(", ") || "Sem horários futuros"}</span></span><span className="group-student-count">{item.student_ids.filter((id) => students.some((student) => student.id === id && student.active)).length} alunos</span></div><div className="card-actions"><button className="button button-ghost button-small" type="button" onClick={onEdit}>Editar</button>{item.active && <button className="button button-ghost button-small" type="button" disabled={busy} onClick={onDeactivate}>Desativar</button>}</div></div>;
}
