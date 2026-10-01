"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button, Input, StatusBadge } from "@/components/ui";
import { ApiError, kodlandApi, type KodlandGroup, type KodlandStudent } from "@/lib/api";
import { whatsappUrl } from "@/lib/whatsapp";

const formatDate = (value: string) => {
  if (!value) return "Sem data";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(date);
};

const initialStudent = (student: KodlandStudent) => ({
  name: student.name,
  email: student.email,
  phone: student.phone,
  local_note: student.local_note,
  guardian_name: student.guardian_name,
  guardian_relationship: student.guardian_relationship,
  guardian_phone: student.guardian_phone,
  guardian_email: student.guardian_email,
  guardian_note: student.guardian_note,
});

function KodlandContent() {
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [selectedGroup, setSelectedGroup] = useState<string>("");
  const [selectedStudent, setSelectedStudent] = useState<KodlandStudent | null>(null);
  const [studentForm, setStudentForm] = useState<ReturnType<typeof initialStudent> | null>(null);
  const [contactStudent, setContactStudent] = useState<KodlandStudent | null>(null);
  const [message, setMessage] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [groupResult, studentResult] = await Promise.all([kodlandApi.groups(), kodlandApi.students()]);
      setGroups(groupResult.items);
      setStudents(studentResult.items);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível carregar os dados.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void load();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const visibleStudents = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return students.filter((student) => {
      if (selectedGroup && student.external_class_id !== selectedGroup) return false;
      if (!normalized) return true;
      return [student.name, student.email, student.phone, student.guardian_name, student.guardian_phone].some((value) => value.toLowerCase().includes(normalized));
    });
  }, [query, selectedGroup, students]);

  const openStudent = (student: KodlandStudent) => {
    setSelectedStudent(student);
    setStudentForm(initialStudent(student));
  };

  const updateStudentForm = (field: keyof NonNullable<typeof studentForm>, value: string) => {
    setStudentForm((current) => current ? { ...current, [field]: value } : current);
  };

  async function saveStudent(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStudent || !studentForm) return;
    setBusy(true);
    setError("");
    try {
      await kodlandApi.updateStudent(selectedStudent.id, studentForm);
      setStudents((current) => current.map((item) => item.id === selectedStudent.id ? { ...item, ...studentForm } : item));
      setSelectedStudent((current) => current ? { ...current, ...studentForm } : current);
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Não foi possível salvar os dados do aluno.");
    } finally {
      setBusy(false);
    }
  }

  function openContact(student: KodlandStudent) {
    setContactStudent(student);
    setMessage(`Olá! Tudo bem? Sou o professor de ${student.name}. Gostaria de falar sobre as próximas atividades.`);
  }

  async function sync(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!username.trim() || !password) return;
    setBusy(true);
    setError("");
    try {
      await kodlandApi.sync(username.trim(), password);
      setUsername("");
      setPassword("");
      setSyncOpen(false);
      await load();
    } catch (reason) {
      setError(reason instanceof ApiError ? reason.message : "Não foi possível sincronizar os dados.");
    } finally {
      setBusy(false);
    }
  }

  const studentCountByGroup = (groupId: string) => students.filter((student) => student.external_class_id === groupId).length;
  const contactPhone = contactStudent?.guardian_phone || contactStudent?.phone || "";
  const contactLabel = contactStudent?.guardian_phone ? "WhatsApp responsável" : "WhatsApp aluno";
  const contactLink = whatsappUrl(contactPhone, message);

  return (
    <div className="management-grid">
      <Modal open={syncOpen} title="Sincronizar dados" onClose={() => !busy && setSyncOpen(false)}>
        <form className="form management-form" onSubmit={sync}>
          <p className="muted">Use seu acesso apenas durante a sincronização. Ele não será salvo neste navegador.</p>
          <label className="field">Usuário<Input type="email" value={username} onChange={(event) => setUsername(event.target.value)} required autoComplete="username" /></label>
          <label className="field">Senha<Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="current-password" /></label>
          <div className="form-actions"><Button type="submit" disabled={busy}>{busy ? "Sincronizando…" : "Sincronizar"}</Button></div>
        </form>
      </Modal>

      <Modal open={Boolean(selectedStudent)} title={selectedStudent?.name || "Aluno"} className="student-modal" onClose={() => setSelectedStudent(null)}>
        {studentForm && <form className="form student-form" onSubmit={saveStudent}>
          <div className="student-form-layout">
            <section className="student-section" aria-labelledby="student-data-title">
              <div className="student-section-heading">
                <h3 id="student-data-title">Dados do aluno</h3>
                <span className="student-summary">{selectedStudent?.progress_summary || "Progresso não informado"}</span>
              </div>
              <div className="student-fields">
                <label className="field">Nome<Input value={studentForm.name} onChange={(event) => updateStudentForm("name", event.target.value)} required /></label>
                <label className="field">E-mail<Input type="email" value={studentForm.email} onChange={(event) => updateStudentForm("email", event.target.value)} /></label>
                <label className="field">WhatsApp do aluno<Input value={studentForm.phone} onChange={(event) => updateStudentForm("phone", event.target.value)} /></label>
                <label className="field">Observação<Input value={studentForm.local_note} onChange={(event) => updateStudentForm("local_note", event.target.value)} /></label>
              </div>
            </section>
            <section className="student-section" aria-labelledby="guardian-data-title">
              <div className="student-section-heading">
                <h3 id="guardian-data-title">Contato do responsável</h3>
                <span className="student-summary">Sincronizado do perfil</span>
              </div>
              <div className="student-fields">
                <label className="field">Nome<Input value={studentForm.guardian_name} readOnly aria-readonly="true" /></label>
                <label className="field">Parentesco<Input value={studentForm.guardian_relationship} readOnly aria-readonly="true" /></label>
                <label className="field">WhatsApp<Input value={studentForm.guardian_phone} readOnly aria-readonly="true" /></label>
                <label className="field">E-mail<Input type="email" value={studentForm.guardian_email} readOnly aria-readonly="true" /></label>
                <label className="field">Observação<Input value={studentForm.guardian_note} onChange={(event) => updateStudentForm("guardian_note", event.target.value)} /></label>
              </div>
            </section>
          </div>
          <div className="form-actions student-form-actions">
            <Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar dados locais"}</Button>
            <button className="button button-ghost" type="button" onClick={() => selectedStudent && openContact(selectedStudent)} disabled={!studentForm.guardian_phone && !studentForm.phone}>{studentForm.guardian_phone ? "WhatsApp responsável" : "WhatsApp aluno"}</button>
            {selectedStudent?.profile_url && <a className="button button-ghost" href={selectedStudent.profile_url} target="_blank" rel="noreferrer">Abrir perfil</a>}
          </div>
        </form>}
      </Modal>

      <Modal open={Boolean(contactStudent)} title={contactLabel} onClose={() => setContactStudent(null)}>
        <div className="form management-form">
          <p className="muted">Revise a mensagem antes de abrir o WhatsApp.</p>
          <label className="field">Mensagem<textarea className="input" rows={6} value={message} onChange={(event) => setMessage(event.target.value)} /></label>
          {contactLink ? <a className="button button-primary" href={contactLink} target="_blank" rel="noreferrer">Abrir conversa</a> : <p className="form-error">Cadastre um número de WhatsApp para continuar.</p>}
        </div>
      </Modal>

      <section className="panel">
        <div className="section-heading"><div><p className="eyebrow">Central pedagógica</p><h2>Turmas e alunos</h2></div><Button type="button" onClick={() => setSyncOpen(true)}>Sincronizar</Button></div>
        <div className="toolbar"><Input placeholder="Buscar turma ou aluno" value={query} onChange={(event) => setQuery(event.target.value)} /><select className="input" value={selectedGroup} onChange={(event) => setSelectedGroup(event.target.value)}><option value="">Todas as turmas</option>{groups.map((group) => <option value={group.external_id} key={group.id}>{group.title}</option>)}</select></div>
        {error && <p className="form-error" role="alert">{error}</p>}
      </section>

      {loading ? <section className="panel"><p className="muted">Carregando…</p></section> : <>
        <section className="panel">
          <div className="section-heading"><h2>Turmas</h2><span className="muted">{groups.length}</span></div>
          {groups.length === 0 ? <p className="muted">Nenhuma turma sincronizada.</p> : <div className="entity-list">{groups.filter((group) => !selectedGroup || group.external_id === selectedGroup).filter((group) => !query.trim() || group.title.toLowerCase().includes(query.trim().toLowerCase()) || group.course_name.toLowerCase().includes(query.trim().toLowerCase())).map((group) => <article className="entity-card" key={group.id}><div><div className="entity-title"><h3>{group.title}</h3><StatusBadge tone={group.archived ? "neutral" : "success"}>{group.archived ? "Arquivada" : "Ativa"}</StatusBadge></div><p className="entity-details">{group.course_name || "Curso não informado"}</p><p className="muted">{studentCountByGroup(group.external_id)} aluno(s) · Próxima aula: {formatDate(group.next_lesson_date)}</p></div></article>)}</div>}
        </section>
        <section className="panel">
          <div className="section-heading"><h2>Alunos</h2><span className="muted">{visibleStudents.length}</span></div>
          {visibleStudents.length === 0 ? <p className="muted">Nenhum aluno encontrado.</p> : <div className="entity-list">{visibleStudents.map((student) => <article className="entity-card" key={student.id}><div><div className="entity-title"><h3>{student.name}</h3><StatusBadge tone={student.status.toLowerCase().includes("active") ? "success" : "neutral"}>{student.status || "Sem status"}</StatusBadge></div><p className="entity-details">{student.external_class_name || "Turma não informada"} · {student.progress_summary || "Progresso não informado"}</p>{student.guardian_name && <p className="muted">Responsável: {student.guardian_name}{student.guardian_relationship ? ` (${student.guardian_relationship})` : ""}</p>}</div><div className="card-actions"><button className="button button-ghost" type="button" onClick={() => openContact(student)} disabled={!student.guardian_phone && !student.phone}>{student.guardian_phone ? "WhatsApp responsável" : "WhatsApp aluno"}</button><button className="button button-primary" type="button" onClick={() => openStudent(student)}>Detalhes</button></div></article>)}</div>}
        </section>
      </>}
    </div>
  );
}

export default function KodlandPage() {
  return <AuthGuard>{(user) => <Shell user={user}><KodlandContent /></Shell>}</AuthGuard>;
}
