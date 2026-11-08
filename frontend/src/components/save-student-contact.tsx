"use client";
import { ContactRound } from "lucide-react";
import { studentContactCard } from "@/lib/student-contact-card";
export function SaveStudentContact({ name, phone, onMissing }: { name: string; phone: string; onMissing?: () => void }) {
  const card = studentContactCard(name, phone);
  const icon = <ContactRound size={18} aria-hidden="true" />;
  return card ? <a className="student-contact-shortcut" aria-label={`Salvar contato de ${name}`} title={`Salvar contato de ${name}`} href={card.href} download={card.filename}>{icon}</a>
    : <button className="student-contact-shortcut" type="button" aria-label={`Cadastrar número de ${name}`} title="Cadastrar número" onClick={onMissing} disabled={!onMissing}>{icon}</button>;
}
