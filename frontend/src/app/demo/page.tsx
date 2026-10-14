"use client";

import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { Modal } from "@/components/modal";
import "../visitor.css";
import { LocalDemoDataAdapter } from "@/lib/demo-data";
import type {
  Classroom,
  Lesson,
  Payment,
  PaymentStatus,
  Student,
  TeachingDataSnapshot,
} from "@/lib/teaching-data-contract";

type DemoView = "summary" | "classes" | "students" | "lessons" | "payments" | "corrections";
type Editor =
  | { kind: "student"; value?: Student }
  | { kind: "classroom"; value?: Classroom }
  | { kind: "lesson"; value?: Lesson }
  | { kind: "payment"; value?: Payment };

const navigation: { id: DemoView; label: string; icon: string }[] = [
  { id: "summary", label: "Resumo", icon: "▦" },
  { id: "classes", label: "Turmas", icon: "◫" },
  { id: "students", label: "Alunos", icon: "◉" },
  { id: "lessons", label: "Aulas", icon: "◷" },
  { id: "payments", label: "Pagamentos", icon: "R$" },
  { id: "corrections", label: "Correções", icon: "✓" },
];

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

function formatMoney(cents: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(`${value}T12:00:00Z`));
}

function inputMoney(cents: number) {
  return (cents / 100).toFixed(2);
}

function moneyToCents(value: FormDataEntryValue | null) {
  return Math.max(0, Math.round(Number(String(value ?? "0").replace(",", ".")) * 100));
}

function statusLabel(status: PaymentStatus) {
  return status === "RECEIVED" ? "Recebido" : status === "OVERDUE" ? "Em atraso" : "Em aberto";
}

function lessonStatus(status: Lesson["status"]) {
  return status === "COMPLETED" ? "Realizada" : status === "CANCELED" ? "Cancelada" : "Agendada";
}

function StatusPill({ children, tone = "neutral" }: { children: ReactNode; tone?: "success" | "warning" | "danger" | "neutral" }) {
  return <span className={`demo-status demo-status-${tone}`}>{children}</span>;
}

function DemoDialog({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <Modal open title={title} className="demo-dialog" onClose={onClose}>
        {children}
    </Modal>
  );
}

function StudentPicker({ students, selected }: { students: Student[]; selected: string[] }) {
  return (
    <fieldset className="demo-picker">
      <legend>Alunos vinculados</legend>
      {students.length ? students.map((student) => (
        <label key={student.id}>
          <input defaultChecked={selected.includes(student.id)} name="student_ids" type="checkbox" value={student.id} />
          {student.name}{!student.active ? " (inativo)" : ""}
        </label>
      )) : <p className="muted">Cadastre um aluno primeiro.</p>}
    </fieldset>
  );
}

function LessonPicker({ lessons, selected }: { lessons: Lesson[]; selected: string[] }) {
  return (
    <fieldset className="demo-picker">
      <legend>Aulas incluídas</legend>
      {lessons.length ? lessons.map((lesson) => (
        <label key={lesson.id}>
          <input defaultChecked={selected.includes(lesson.id)} name="lesson_ids" type="checkbox" value={lesson.id} />
          {lesson.title} · {formatDate(lesson.lesson_date)}
        </label>
      )) : <p className="muted">Nenhuma aula disponível.</p>}
    </fieldset>
  );
}

function StudentForm({ value, onSave }: { value?: Student; onSave: (input: Omit<Student, "id" | "source" | "created_at" | "updated_at">) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onSave({
      name: String(data.get("name") ?? "").trim(),
      email: String(data.get("email") ?? "").trim(),
      phone: String(data.get("phone") ?? "").trim(),
      guardian_name: String(data.get("guardian_name") ?? "").trim(),
      active: data.get("active") === "on",
    });
  };
  return (
    <form className="demo-form" onSubmit={submit}>
      <label>Nome<input autoFocus className="input" defaultValue={value?.name} name="name" required /></label>
      <label>E-mail<input className="input" defaultValue={value?.email} name="email" type="email" /></label>
      <label>Telefone<input className="input" defaultValue={value?.phone} name="phone" /></label>
      <label>Responsável<input className="input" defaultValue={value?.guardian_name} name="guardian_name" /></label>
      <label className="demo-check"><input defaultChecked={value?.active ?? true} name="active" type="checkbox" /> Aluno ativo</label>
      <div className="demo-form-actions"><button className="button button-primary" type="submit">Salvar aluno</button></div>
    </form>
  );
}

function ClassroomForm({ value, students, onSave }: { value?: Classroom; students: Student[]; onSave: (input: Omit<Classroom, "id" | "source" | "created_at" | "updated_at">) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    void onSave({
      name: String(data.get("name") ?? "").trim(),
      course_name: String(data.get("course_name") ?? "").trim(),
      student_ids: data.getAll("student_ids").map(String),
      week_days: [Number(data.get("week_day") ?? 1)],
      start_time: String(data.get("start_time") ?? "18:00"),
      duration_minutes: Number(data.get("duration_minutes") ?? 60),
      hourly_rate_cents: moneyToCents(data.get("hourly_rate")),
      active: data.get("active") === "on",
    });
  };
  return (
    <form className="demo-form" onSubmit={submit}>
      <label>Nome da turma<input autoFocus className="input" defaultValue={value?.name} name="name" required /></label>
      <label>Curso<input className="input" defaultValue={value?.course_name} name="course_name" required /></label>
      <div className="demo-form-grid">
        <label>Dia da semana<select className="input" defaultValue={String(value?.week_days[0] ?? 1)} name="week_day">{weekdays.map((day, index) => <option key={day} value={index}>{day}</option>)}</select></label>
        <label>Horário<input className="input" defaultValue={value?.start_time ?? "18:00"} name="start_time" required type="time" /></label>
        <label>Duração (min.)<input className="input" defaultValue={value?.duration_minutes ?? 60} min="15" name="duration_minutes" required step="15" type="number" /></label>
        <label>Valor por hora (R$)<input className="input" defaultValue={value ? inputMoney(value.hourly_rate_cents) : "65,00"} min="0" name="hourly_rate" required step="0.01" type="number" /></label>
      </div>
      <StudentPicker students={students} selected={value?.student_ids ?? []} />
      <label className="demo-check"><input defaultChecked={value?.active ?? true} name="active" type="checkbox" /> Turma ativa</label>
      <div className="demo-form-actions"><button className="button button-primary" type="submit">Salvar turma</button></div>
    </form>
  );
}

function LessonForm({ value, students, classrooms, onSave }: { value?: Lesson; students: Student[]; classrooms: Classroom[]; onSave: (input: Omit<Lesson, "id" | "source" | "created_at" | "updated_at">) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const classId = String(data.get("class_id") ?? "");
    void onSave({
      class_id: classId || null,
      student_ids: data.getAll("student_ids").map(String),
      title: String(data.get("title") ?? "").trim(),
      lesson_date: String(data.get("lesson_date") ?? ""),
      start_time: String(data.get("start_time") ?? ""),
      duration_minutes: Number(data.get("duration_minutes") ?? 60),
      value_cents: moneyToCents(data.get("value")),
      type: String(data.get("type")) === "EXTRA" ? "EXTRA" : "REGULAR",
      status: String(data.get("status")) as Lesson["status"],
      active: data.get("active") === "on",
    });
  };
  return (
    <form className="demo-form" onSubmit={submit}>
      <label>Título da aula<input autoFocus className="input" defaultValue={value?.title} name="title" required /></label>
      <label>Turma<select className="input" defaultValue={value?.class_id ?? ""} name="class_id"><option value="">Aula avulsa</option>{classrooms.map((classroom) => <option key={classroom.id} value={classroom.id}>{classroom.name}</option>)}</select></label>
      <div className="demo-form-grid">
        <label>Data<input className="input" defaultValue={value?.lesson_date} name="lesson_date" required type="date" /></label>
        <label>Horário<input className="input" defaultValue={value?.start_time ?? "18:00"} name="start_time" required type="time" /></label>
        <label>Duração (min.)<input className="input" defaultValue={value?.duration_minutes ?? 60} min="15" name="duration_minutes" required step="15" type="number" /></label>
        <label>Valor (R$)<input className="input" defaultValue={value ? inputMoney(value.value_cents) : "65,00"} min="0" name="value" required step="0.01" type="number" /></label>
        <label>Tipo<select className="input" defaultValue={value?.type ?? "REGULAR"} name="type"><option value="REGULAR">Regular</option><option value="EXTRA">Extra</option></select></label>
        <label>Status<select className="input" defaultValue={value?.status ?? "SCHEDULED"} name="status"><option value="SCHEDULED">Agendada</option><option value="COMPLETED">Realizada</option><option value="CANCELED">Cancelada</option></select></label>
      </div>
      <StudentPicker students={students} selected={value?.student_ids ?? []} />
      <label className="demo-check"><input defaultChecked={value?.active ?? true} name="active" type="checkbox" /> Aula ativa</label>
      <div className="demo-form-actions"><button className="button button-primary" type="submit">Salvar aula</button></div>
    </form>
  );
}

function PaymentForm({ value, lessons, onSave }: { value?: Payment; lessons: Lesson[]; onSave: (input: Omit<Payment, "id" | "source" | "created_at" | "updated_at">) => Promise<void> }) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const status = String(data.get("status")) as PaymentStatus;
    void onSave({
      period: String(data.get("period") ?? "").trim(),
      due_date: String(data.get("due_date") ?? ""),
      lesson_ids: data.getAll("lesson_ids").map(String),
      total_cents: moneyToCents(data.get("total")),
      status,
      received_at: status === "RECEIVED" ? value?.received_at ?? new Date().toISOString() : null,
      note: String(data.get("note") ?? "").trim(),
    });
  };
  return (
    <form className="demo-form" onSubmit={submit}>
      <label>Competência<input autoFocus className="input" defaultValue={value?.period} name="period" placeholder="Outubro de 2026" required /></label>
      <div className="demo-form-grid">
        <label>Vencimento<input className="input" defaultValue={value?.due_date} name="due_date" required type="date" /></label>
        <label>Valor total (R$)<input className="input" defaultValue={value ? inputMoney(value.total_cents) : "0.00"} min="0" name="total" required step="0.01" type="number" /></label>
        <label>Status<select className="input" defaultValue={value?.status ?? "PENDING"} name="status"><option value="PENDING">Em aberto</option><option value="RECEIVED">Recebido</option><option value="OVERDUE">Em atraso</option></select></label>
      </div>
      <label>Observação<textarea className="input demo-textarea" defaultValue={value?.note} name="note" rows={3} /></label>
      <LessonPicker lessons={lessons} selected={value?.lesson_ids ?? []} />
      <div className="demo-form-actions"><button className="button button-primary" type="submit">Salvar pagamento</button></div>
    </form>
  );
}

function DashboardView({ snapshot, setView }: { snapshot: TeachingDataSnapshot; setView: (view: DemoView) => void }) {
  const { indicators, lessons, payments } = snapshot;
  const nextLessons = lessons.filter((lesson) => lesson.active && lesson.status === "SCHEDULED").sort((a, b) => a.lesson_date.localeCompare(b.lesson_date)).slice(0, 3);
  const nextPayment = payments.filter((payment) => payment.status !== "RECEIVED").sort((a, b) => a.due_date.localeCompare(b.due_date))[0];
  return (
    <div className="demo-view-stack">
      <section className="demo-view-heading"><div><p className="eyebrow">VISÃO GERAL</p><h1>Uma semana mais previsível</h1><p className="muted">Este é um cenário fictício que você pode editar livremente.</p></div><button className="button button-ghost" onClick={() => setView("lessons")} type="button">Ver agenda</button></section>
      <section className="demo-metric-grid" aria-label="Indicadores da demonstração">
        <article><span>Alunos ativos</span><strong>{indicators.active_students}</strong><button onClick={() => setView("students")} type="button">Gerenciar alunos</button></article>
        <article><span>Turmas ativas</span><strong>{indicators.active_classes}</strong><button onClick={() => setView("classes")} type="button">Ver turmas</button></article>
        <article><span>Aulas agendadas</span><strong>{indicators.scheduled_lessons}</strong><button onClick={() => setView("lessons")} type="button">Abrir agenda</button></article>
        <article><span>Valores recebidos</span><strong>{formatMoney(indicators.received_cents)}</strong><button onClick={() => setView("payments")} type="button">Ver pagamentos</button></article>
      </section>
      <div className="demo-summary-grid">
        <section className="demo-panel"><div className="demo-panel-heading"><div><h2>Próximas aulas</h2><p>Agenda fictícia e editável</p></div><button className="demo-text-button" onClick={() => setView("lessons")} type="button">Abrir agenda</button></div>{nextLessons.length ? <ul className="demo-simple-list">{nextLessons.map((lesson) => <li key={lesson.id}><div><strong>{lesson.title}</strong><span>{formatDate(lesson.lesson_date)} · {lesson.start_time}</span></div><StatusPill tone="neutral">{lesson.type === "EXTRA" ? "Extra" : "Turma"}</StatusPill></li>)}</ul> : <p className="muted">Nenhuma aula agendada.</p>}</section>
        <section className="demo-panel"><div className="demo-panel-heading"><div><h2>Acompanhamento financeiro</h2><p>Valores do cenário de demonstração</p></div><button className="demo-text-button" onClick={() => setView("payments")} type="button">Ver pagamentos</button></div>{nextPayment ? <div className="demo-payment-highlight"><span>Próximo acompanhamento</span><strong>{nextPayment.period}</strong><b>{formatMoney(nextPayment.total_cents)}</b><p>Vence em {formatDate(nextPayment.due_date)}</p></div> : <p className="muted">Nenhum pagamento pendente.</p>}</section>
      </div>
    </div>
  );
}

function StudentsView({ students, onEdit, onDeactivate, onDelete }: { students: Student[]; onEdit: (student?: Student) => void; onDeactivate: (student: Student) => void; onDelete: (student: Student) => void }) {
  return <div className="demo-view-stack"><section className="demo-view-heading"><div><p className="eyebrow">CADASTRO FICTÍCIO</p><h1>Alunos</h1><p className="muted">Edite, desative ou crie perfis de teste sem afetar uma conta real.</p></div><button className="button button-primary" onClick={() => onEdit()} type="button">Adicionar aluno</button></section><section className="demo-entity-grid">{students.map((student) => <article className="demo-entity-card" key={student.id}><div className="demo-entity-title"><div className="demo-avatar" aria-hidden="true">{student.name.slice(0, 1)}</div><div><h2>{student.name}</h2><p>{student.email || "E-mail não informado"}</p></div></div><div className="demo-card-meta"><span>{student.guardian_name ? `Responsável: ${student.guardian_name}` : "Sem responsável informado"}</span><StatusPill tone={student.active ? "success" : "neutral"}>{student.active ? "Ativo" : "Inativo"}</StatusPill></div><div className="demo-card-actions"><button aria-label={`Editar ${student.name}`} className="button button-ghost" onClick={() => onEdit(student)} type="button">Editar</button>{student.active && <button aria-label={`Desativar ${student.name}`} className="button button-ghost" onClick={() => onDeactivate(student)} type="button">Desativar</button>}<button aria-label={`Excluir ${student.name}`} className="demo-text-danger" onClick={() => onDelete(student)} type="button">Excluir</button></div></article>)}</section></div>;
}

function ClassesView({ classrooms, students, onEdit, onDeactivate, onDelete }: { classrooms: Classroom[]; students: Student[]; onEdit: (classroom?: Classroom) => void; onDeactivate: (classroom: Classroom) => void; onDelete: (classroom: Classroom) => void }) {
  const studentNames = (ids: string[]) => ids.map((id) => students.find((student) => student.id === id)?.name).filter(Boolean).join(", ") || "Sem alunos vinculados";
  return <div className="demo-view-stack"><section className="demo-view-heading"><div><p className="eyebrow">ORGANIZAÇÃO FICTÍCIA</p><h1>Turmas</h1><p className="muted">Monte turmas de teste e defina a rotina semanal.</p></div><button className="button button-primary" onClick={() => onEdit()} type="button">Adicionar turma</button></section><section className="demo-entity-grid">{classrooms.map((classroom) => <article className="demo-entity-card" key={classroom.id}><div className="demo-entity-title"><div><h2>{classroom.name}</h2><p>{classroom.course_name}</p></div><StatusPill tone={classroom.active ? "success" : "neutral"}>{classroom.active ? "Ativa" : "Inativa"}</StatusPill></div><div className="demo-card-meta"><span>{classroom.week_days.map((day) => weekdays[day]).join(" e ")} · {classroom.start_time} · {classroom.duration_minutes} min</span><span>{studentNames(classroom.student_ids)}</span></div><div className="demo-card-actions"><button aria-label={`Editar ${classroom.name}`} className="button button-ghost" onClick={() => onEdit(classroom)} type="button">Editar</button>{classroom.active && <button aria-label={`Desativar ${classroom.name}`} className="button button-ghost" onClick={() => onDeactivate(classroom)} type="button">Desativar</button>}<button aria-label={`Excluir ${classroom.name}`} className="demo-text-danger" onClick={() => onDelete(classroom)} type="button">Excluir</button></div></article>)}</section></div>;
}

function LessonsView({ lessons, classrooms, onEdit, onDeactivate, onDelete }: { lessons: Lesson[]; classrooms: Classroom[]; onEdit: (lesson?: Lesson) => void; onDeactivate: (lesson: Lesson) => void; onDelete: (lesson: Lesson) => void }) {
  const classroomName = (id: string | null) => classrooms.find((classroom) => classroom.id === id)?.name ?? "Aula avulsa";
  return <div className="demo-view-stack"><section className="demo-view-heading"><div><p className="eyebrow">AGENDA FICTÍCIA</p><h1>Aulas</h1><p className="muted">Cadastre encontros regulares e extras para experimentar a agenda.</p></div><button className="button button-primary" onClick={() => onEdit()} type="button">Adicionar aula</button></section><section className="demo-timeline">{lessons.sort((a, b) => a.lesson_date.localeCompare(b.lesson_date)).map((lesson) => <article className="demo-timeline-item" key={lesson.id}><div className="demo-timeline-date"><strong>{formatDate(lesson.lesson_date)}</strong><span>{lesson.start_time}</span></div><div className="demo-timeline-content"><div><div className="demo-entity-title"><div><h2>{lesson.title}</h2><p>{classroomName(lesson.class_id)} · {lesson.duration_minutes} min · {formatMoney(lesson.value_cents)}</p></div><StatusPill tone={lesson.status === "COMPLETED" ? "success" : lesson.status === "CANCELED" ? "danger" : "warning"}>{lessonStatus(lesson.status)}</StatusPill></div><div className="demo-card-meta"><span>{lesson.type === "EXTRA" ? "Aula extra" : "Aula regular"}</span><span>{lesson.active ? "Disponível na agenda" : "Inativa"}</span></div></div><div className="demo-card-actions"><button aria-label={`Editar ${lesson.title}`} className="button button-ghost" onClick={() => onEdit(lesson)} type="button">Editar</button>{lesson.active && <button aria-label={`Desativar ${lesson.title}`} className="button button-ghost" onClick={() => onDeactivate(lesson)} type="button">Desativar</button>}<button aria-label={`Excluir ${lesson.title}`} className="demo-text-danger" onClick={() => onDelete(lesson)} type="button">Excluir</button></div></div></article>)}</section></div>;
}

function PaymentsView({ payments, onEdit, onStatus, onDelete }: { payments: Payment[]; onEdit: (payment?: Payment) => void; onStatus: (payment: Payment, status: PaymentStatus) => void; onDelete: (payment: Payment) => void }) {
  const tone = (status: PaymentStatus) => status === "RECEIVED" ? "success" : status === "OVERDUE" ? "danger" : "warning";
  return <div className="demo-view-stack"><section className="demo-view-heading"><div><p className="eyebrow">FINANCEIRO FICTÍCIO</p><h1>Pagamentos</h1><p className="muted">Altere valores, vencimentos e status para conhecer o acompanhamento.</p></div><button className="button button-primary" onClick={() => onEdit()} type="button">Adicionar pagamento</button></section><section className="demo-payment-list">{payments.sort((a, b) => b.due_date.localeCompare(a.due_date)).map((payment) => <article className="demo-payment-card" key={payment.id}><div><div className="demo-entity-title"><div><p>{payment.period}</p><h2>{formatMoney(payment.total_cents)}</h2></div><StatusPill tone={tone(payment.status)}>{statusLabel(payment.status)}</StatusPill></div><p className="demo-payment-note">Vencimento: {formatDate(payment.due_date)}{payment.note ? ` · ${payment.note}` : ""}</p></div><div className="demo-payment-actions"><div className="demo-card-actions"><button aria-label={`Editar ${payment.period}`} className="button button-ghost" onClick={() => onEdit(payment)} type="button">Editar</button>{payment.status !== "RECEIVED" && <button className="button button-ghost" onClick={() => onStatus(payment, "RECEIVED")} type="button">Marcar recebido</button>}{payment.status !== "OVERDUE" && <button className="demo-text-button" onClick={() => onStatus(payment, "OVERDUE")} type="button">Marcar em atraso</button>}<button aria-label={`Excluir ${payment.period}`} className="demo-text-danger" onClick={() => onDelete(payment)} type="button">Excluir</button></div></div></article>)}</section></div>;
}

function CorrectionsView() {
  return <div className="demo-view-stack"><section className="demo-view-heading"><div><p className="eyebrow">EXEMPLO VISUAL</p><h1>Correções</h1><p className="muted">Esta área ilustra uma fila de correções. Nenhum exercício real é aberto ou sincronizado na demonstração.</p></div></section><section className="demo-corrections"><article><div><StatusPill tone="warning">Pendente</StatusPill><h2>Ilustração com formas geométricas</h2><p>Luna Ribeiro · Atividade em sala</p></div><p className="demo-synthetic-note">Exemplo visual — o feedback e a entrega são fictícios.</p></article><article><div><StatusPill tone="warning">Pendente</StatusPill><h2>Personagem com movimento</h2><p>Caio Monteiro · Projeto de jogo</p></div><p className="demo-synthetic-note">Exemplo visual — não há link para plataforma externa.</p></article></section></div>;
}

export default function DemoPage() {
  const [adapter] = useState(() => new LocalDemoDataAdapter());
  const [snapshot, setSnapshot] = useState<TeachingDataSnapshot | null>(null);
  const [view, setView] = useState<DemoView>("summary");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setSnapshot(await adapter.getSnapshot());
      setError("");
    } catch {
      setError("Não foi possível carregar a demonstração. Tente restaurar o cenário.");
    }
  }, [adapter]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const commit = useCallback(async (action: () => Promise<unknown>, message: string) => {
    setIsSaving(true);
    setError("");
    try {
      await action();
      await load();
      setEditor(null);
      setNotice(message);
    } catch {
      setError("Não foi possível salvar essa alteração na demonstração. Tente novamente.");
    } finally {
      setIsSaving(false);
    }
  }, [load]);

  const remove = useCallback((label: string, action: () => Promise<void>) => {
    if (!window.confirm(`Excluir ${label}? Esta alteração fica somente nesta demonstração.`)) return;
    void commit(action, `${label} excluído da demonstração.`);
  }, [commit]);

  const reset = () => {
    if (!window.confirm("Restaurar o cenário original da demonstração? As alterações locais serão removidas.")) return;
    void commit(() => adapter.resetToSeed(), "Demonstração restaurada com o cenário original.");
  };

  const currentTitle = navigation.find((item) => item.id === view)?.label ?? "Resumo";
  const renderView = () => {
    if (!snapshot) return <div className="demo-loading" role="status">Carregando o cenário de demonstração…</div>;
    if (view === "students") return <StudentsView students={snapshot.students} onEdit={(value) => setEditor({ kind: "student", value })} onDeactivate={(value) => void commit(() => adapter.updateStudent(value.id, { active: false }), "Aluno desativado na demonstração.")} onDelete={(value) => remove("este aluno", () => adapter.deleteStudent(value.id))} />;
    if (view === "classes") return <ClassesView classrooms={snapshot.classrooms} students={snapshot.students} onEdit={(value) => setEditor({ kind: "classroom", value })} onDeactivate={(value) => void commit(() => adapter.updateClassroom(value.id, { active: false }), "Turma desativada na demonstração.")} onDelete={(value) => remove("esta turma", () => adapter.deleteClassroom(value.id))} />;
    if (view === "lessons") return <LessonsView lessons={[...snapshot.lessons]} classrooms={snapshot.classrooms} onEdit={(value) => setEditor({ kind: "lesson", value })} onDeactivate={(value) => void commit(() => adapter.updateLesson(value.id, { active: false }), "Aula desativada na demonstração.")} onDelete={(value) => remove("esta aula", () => adapter.deleteLesson(value.id))} />;
    if (view === "payments") return <PaymentsView payments={[...snapshot.payments]} onEdit={(value) => setEditor({ kind: "payment", value })} onStatus={(value, status) => void commit(() => adapter.updatePayment(value.id, { status, received_at: status === "RECEIVED" ? new Date().toISOString() : null }), "Status do pagamento atualizado na demonstração.")} onDelete={(value) => remove("este pagamento", () => adapter.deletePayment(value.id))} />;
    if (view === "corrections") return <CorrectionsView />;
    return <DashboardView snapshot={snapshot} setView={setView} />;
  };

  return (
    <main className="demo-page">
      <a className="demo-skip-link" href="#demo-content">Pular para o conteúdo</a>
      <header className="demo-topbar">
        <Link className="demo-brand" href="/" aria-label="Voltar para a página inicial do NexusClass"><span aria-hidden="true">N</span>NexusClass</Link>
        <div className="demo-mode-label"><span aria-hidden="true">◌</span> Modo demonstração</div>
        <Link className="demo-login-link" href="/login">Entrar</Link>
      </header>
      <aside className="demo-local-notice" aria-label="Aviso sobre a demonstração"><span aria-hidden="true">⌁</span><p><strong>Você está em uma demonstração pública.</strong> As alterações ficam somente neste navegador e não alcançam contas reais.</p><button className="button button-ghost" disabled={isSaving} onClick={reset} type="button">Restaurar demonstração</button></aside>
      <div className="demo-workspace">
        <nav className="demo-sidebar" aria-label="Navegação da demonstração" role="tablist">{navigation.map((item) => <button aria-controls="demo-content" aria-selected={view === item.id} className={view === item.id ? "active" : ""} key={item.id} onClick={() => setView(item.id)} role="tab" type="button"><span aria-hidden="true">{item.icon}</span>{item.label}</button>)}</nav>
        <section className="demo-content" id="demo-content" role="tabpanel" aria-label={currentTitle} tabIndex={-1}>{error && <p className="form-error" role="alert">{error}</p>}{notice && <div className="demo-toast" role="status"><span>{notice}</span><button aria-label="Fechar aviso" onClick={() => setNotice("")} type="button">×</button></div>}{renderView()}</section>
      </div>
      {editor && snapshot && <DemoDialog onClose={() => !isSaving && setEditor(null)} title={editor.kind === "student" ? editor.value ? "Editar aluno" : "Novo aluno" : editor.kind === "classroom" ? editor.value ? "Editar turma" : "Nova turma" : editor.kind === "lesson" ? editor.value ? "Editar aula" : "Nova aula" : editor.value ? "Editar pagamento" : "Novo pagamento"}>{editor.kind === "student" ? <StudentForm value={editor.value} onSave={(input) => commit(() => editor.value ? adapter.updateStudent(editor.value.id, input) : adapter.createStudent(input), "Aluno salvo na demonstração.")} /> : editor.kind === "classroom" ? <ClassroomForm students={snapshot.students} value={editor.value} onSave={(input) => commit(() => editor.value ? adapter.updateClassroom(editor.value.id, input) : adapter.createClassroom(input), "Turma salva na demonstração.")} /> : editor.kind === "lesson" ? <LessonForm classrooms={snapshot.classrooms} students={snapshot.students} value={editor.value} onSave={(input) => commit(() => editor.value ? adapter.updateLesson(editor.value.id, input) : adapter.createLesson(input), "Aula salva na demonstração.")} /> : <PaymentForm lessons={snapshot.lessons} value={editor.value} onSave={(input) => commit(() => editor.value ? adapter.updatePayment(editor.value.id, input) : adapter.createPayment(input), "Pagamento salvo na demonstração.")} />}</DemoDialog>}
    </main>
  );
}
