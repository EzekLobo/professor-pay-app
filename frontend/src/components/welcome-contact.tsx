"use client";
import { useState } from "react";
import { ContactRound } from "lucide-react";
import { useStudentNotifications } from "./student-notifications";
import { Modal } from "./modal";
import { Input } from "./ui";
import { DEFAULT_WELCOME_MESSAGE, renderWelcomeMessage } from "@/lib/welcome-message";
import { normalizeWhatsAppNumber, whatsappUrl } from "@/lib/whatsapp";
export function WelcomeContact({ name, phone, className = "", guardianName = "" }: { name: string; phone: string; className?: string; guardianName?: string }) {
  const notifications = useStudentNotifications();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const message = renderWelcomeMessage(notifications?.settings?.welcome_message_template ?? DEFAULT_WELCOME_MESSAGE, name, className, guardianName);
  const valid = (value: string) => /^\d{10,15}$/.test(value.replace(/\D/g, "")) && /^\d{10,15}$/.test(normalizeWhatsAppNumber(value));
  const label = `Dar boas-vindas ao responsável de ${name}`;
  const icon = <ContactRound size={18} aria-hidden="true" />;
  return <>{valid(phone) ? <a className="student-contact-shortcut" aria-label={label} title={label} href={whatsappUrl(phone, message)} target="_blank" rel="noreferrer">{icon}</a>
    : <button className="student-contact-shortcut" type="button" aria-label={label} title={label} onClick={() => setOpen(true)}>{icon}</button>}
    <Modal open={open} title="Boas-vindas ao responsável" onClose={() => setOpen(false)}>
      <div className="form management-form"><label className="field">WhatsApp do responsável<Input type="tel" inputMode="tel" value={number} onChange={event => setNumber(event.target.value)} placeholder="DDD e número" /></label><p className="muted">{message}</p><a className="button button-primary" aria-disabled={!valid(number)} href={valid(number) ? whatsappUrl(number, message) : undefined} target="_blank" rel="noreferrer" onClick={event => { if (!valid(number)) event.preventDefault(); }}>Abrir conversa no WhatsApp</a></div>
    </Modal>
  </>;
}
