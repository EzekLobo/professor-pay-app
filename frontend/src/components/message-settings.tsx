"use client";
import { useState } from "react";
import { useStudentNotifications } from "./student-notifications";
import { ActivityMessageEditor } from "./activity-message-editor";
import { Button } from "./ui";
import { DEFAULT_ABSENCE_MESSAGE } from "@/lib/manual-operations";
import { validateActivityMessageTemplate, type NotificationSettings } from "@/lib/student-notification-rules";
import { DEFAULT_WELCOME_MESSAGE, validateWelcomeMessage, WELCOME_EXAMPLES } from "@/lib/welcome-message";
type Props = { absence: string; onAbsenceChange(value: string): void; saveAbsence(): Promise<unknown> };
export function MessageSettings(props: Props) {
  const notifications = useStudentNotifications();
  if (!notifications) return <p role="alert">Mensagens indisponíveis neste contexto.</p>;
  if (!notifications.settings) return notifications.error ? <div><p role="alert">{notifications.error}</p><Button type="button" onClick={() => void notifications.refresh(true)}>Tentar novamente</Button></div> : <p role="status">Carregando mensagens…</p>;
  return <MessageSettingsForm {...props} settings={notifications.settings} saveSettings={notifications.save} />;
}
function MessageSettingsForm({ absence, onAbsenceChange, saveAbsence, settings, saveSettings }: Props & { settings: NotificationSettings; saveSettings(value: NotificationSettings): Promise<void> }) {
  const [activity, setActivity] = useState(settings.activity_message_template);
  const [welcome, setWelcome] = useState(settings.welcome_message_template ?? DEFAULT_WELCOME_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  async function save() {
    if (busy) return;
    setBusy(true); setNotice(""); setError("");
    try {
      if (!absence.trim()) throw new Error("Informe a mensagem de ausência.");
      if (!activity.trim() || activity.length > 5000) throw new Error("Informe a mensagem de atividades com até 5000 caracteres.");
      validateActivityMessageTemplate(activity); validateWelcomeMessage(welcome);
      await saveAbsence();
      await saveSettings({ ...settings, activity_message_template: activity, welcome_message_template: welcome });
      setNotice("Mensagens salvas.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar as mensagens."); }
    finally { setBusy(false); }
  }
  return <form className="settings-form" onSubmit={event => { event.preventDefault(); void save(); }}><fieldset className="settings-fieldset" disabled={busy}>
    <section className="panel settings-section"><h3>Mensagem de ausência</h3><label className="field">Modelo da mensagem de ausência<textarea className="input" rows={5} required value={absence} onChange={event => onAbsenceChange(event.target.value)} /></label><div className="settings-message-help"><span>Variáveis disponíveis</span>{["primeiro_nome", "codigo_aula", "data", "link_gravacao", "gravacao"].map(key => <code key={key}>{`{${key}}`}</code>)}</div><Button type="button" className="button-ghost button-small" onClick={() => onAbsenceChange(DEFAULT_ABSENCE_MESSAGE)}>Restaurar padrão de ausência</Button></section>
    <section className="panel settings-section"><h3>Atividades pendentes</h3><ActivityMessageEditor value={activity} onChange={setActivity} /></section>
    <section className="panel settings-section"><h3>Boas-vindas</h3><ActivityMessageEditor label="Mensagem de boas-vindas" value={welcome} onChange={setWelcome} defaultValue={DEFAULT_WELCOME_MESSAGE} examples={WELCOME_EXAMPLES} /><p className="muted">O atalho junto ao aluno permite revisar a mensagem antes de abrir a conversa do responsável. Envie a mensagem e salve o contato no WhatsApp para adicioná-lo ao grupo.</p></section>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <div className="settings-save-bar"><span>Modelos usados nas conversas com os responsáveis.</span><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar mensagens"}</Button></div>
  </fieldset></form>;
}
