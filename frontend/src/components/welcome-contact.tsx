"use client";
import { useState } from "react";
import { ContactRound } from "lucide-react";
import { useStudentNotifications } from "./student-notifications";
import { Modal } from "./modal";
import { Button, Input } from "./ui";
import { DEFAULT_WELCOME_MESSAGE, renderWelcomeMessage } from "@/lib/welcome-message";
import { normalizeWhatsAppNumber, whatsappUrl } from "@/lib/whatsapp";
export function WelcomeContact({ name, phone, className = "", guardianName = "" }: { name: string; phone: string; className?: string; guardianName?: string }) {
  const notifications = useStudentNotifications();
  const [open, setOpen] = useState(false);
  const [number, setNumber] = useState("");
  const [message, setMessage] = useState("");
  const templateMessage = renderWelcomeMessage(notifications?.settings?.welcome_message_template ?? DEFAULT_WELCOME_MESSAGE, name, className, guardianName);
  const valid = (value: string) => /^\d{10,15}$/.test(value.replace(/\D/g, "")) && /^\d{10,15}$/.test(normalizeWhatsAppNumber(value));
  const label = `Dar boas-vindas ao responsável de ${name}`;
  const icon = <ContactRound size={18} aria-hidden="true" />;
  const canOpenChat = valid(number) && Boolean(message.trim());
  function review() { setNumber(phone); setMessage(templateMessage); setOpen(true); }
  return <><button className="student-contact-shortcut" type="button" aria-label={label} title={label} aria-haspopup="dialog" onClick={review}>{icon}</button>
    <Modal open={open} title="Boas-vindas ao responsável" onClose={() => setOpen(false)}>
      <div className="form management-form">
        <label className="field">WhatsApp do responsável<Input type="tel" inputMode="tel" value={number} onChange={event => setNumber(event.target.value)} placeholder="DDD e número" /></label>
        <label className="field">Mensagem de boas-vindas<textarea className="input" rows={6} maxLength={5000} value={message} onChange={event => setMessage(event.target.value)} /></label>
        <div className="form-actions"><Button type="button" className="button-ghost" onClick={() => setOpen(false)}>Cancelar</Button><a className="button button-primary" aria-disabled={!canOpenChat} href={canOpenChat ? whatsappUrl(number, message) : undefined} target="_blank" rel="noreferrer" onClick={event => { if (!canOpenChat) event.preventDefault(); }}>Abrir conversa no WhatsApp</a></div>
      </div>
    </Modal>
  </>;
}
