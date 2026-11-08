"use client";

import { useState } from "react";
import { kodlandApi, manualTeachingApi, type KodlandStudent } from "@/lib/api";
import type { ManualStudent } from "@/lib/manual-teaching";
import { notifyStudentNotificationsChanged } from "@/lib/student-notification-store";
import { whatsappUrl } from "@/lib/whatsapp";
import { SaveStudentContact } from "./save-student-contact";
import { Button, Input } from "./ui";

export function StudentContactFields({ student, demo = false, onSaved }: { student: KodlandStudent | ManualStudent; demo?: boolean; onSaved: (phone: string) => void }) {
  const demoKey = `nexusclass.demo.student-phone.${student.id}`;
  const [phone, setPhone] = useState(() => { try { return demo ? localStorage.getItem(demoKey) ?? student.student_phone ?? "" : student.student_phone ?? ""; } catch { return student.student_phone ?? ""; } });
  const [savedPhone, setSavedPhone] = useState(phone);
  const [profilePhone, setProfilePhone] = useState(student.student_phone ?? "");
  if (!demo && profilePhone !== (student.student_phone ?? "")) {
    const value = student.student_phone ?? "";
    setProfilePhone(value);
    if (phone === savedPhone) { setPhone(value); setSavedPhone(value); }
  }
  const [recipient, setRecipient] = useState("guardian");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const valid = (value: string) => /^\d{10,15}$/.test(value.replace(/\D/g, ""));
  const target = recipient === "student" ? savedPhone : student.phone;
  async function save() {
    setError(""); setNotice(""); setSaving(true);
    try {
      const value = phone.trim();
      if (demo) localStorage.setItem(demoKey, value);
      else if ("external_id" in student) await kodlandApi.updateStudent(student.id, { student_phone: value });
      else await manualTeachingApi.saveStudent({ ...student, student_phone: value });
      setSavedPhone(value); onSaved(value); if (!demo) notifyStudentNotificationsChanged(); setNotice("Número do aluno salvo.");
    } catch { setError("Não foi possível salvar o número. Tente novamente."); }
    finally { setSaving(false); }
  }
  return <div className="form management-form">
    <label className="field">WhatsApp do responsável / contato cadastrado<Input type="tel" value={student.phone} readOnly /></label>
    <label className="field">WhatsApp do aluno<Input type="tel" inputMode="tel" autoComplete="off" placeholder="DDD e número" value={phone} onChange={event => { setPhone(event.target.value); setNotice(""); }} /></label>
    <Button type="button" disabled={saving || phone.trim() === savedPhone || Boolean(phone.trim() && !valid(phone))} onClick={() => void save()}>{saving ? "Salvando…" : "Salvar número do aluno"}</Button>
    {phone.trim() && !valid(phone) && <p role="status">Informe de 10 a 15 dígitos, incluindo DDD.</p>}
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <label className="field">Enviar mensagem para<select className="input" value={recipient} onChange={event => setRecipient(event.target.value)}><option value="guardian">Responsável / contato cadastrado</option><option value="student">Aluno</option></select></label>
    {!valid(target) && <p className="muted">{recipient === "student" ? "Salve um número válido do aluno para enviar." : "Contato do responsável não cadastrado."}</p>}
    <SaveStudentContact name={recipient === "guardian" ? `${student.name} (responsável)` : student.name} phone={target || ""} />
    <a className="button button-primary" aria-disabled={!valid(target)} href={valid(target) ? whatsappUrl(target, `Olá! Gostaria de conversar sobre as aulas de ${student.name}.`) : undefined} target="_blank" rel="noreferrer" onClick={event => { if (!valid(target)) event.preventDefault(); }}>Abrir WhatsApp</a>
  </div>;
}
