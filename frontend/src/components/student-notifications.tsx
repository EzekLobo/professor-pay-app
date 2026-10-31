"use client";

import Link from "next/link";
import { HeaderDropdown } from "./header-dropdown";
import { ActivityMessageEditor } from "./activity-message-editor";
import { useKodlandAutoSync } from "./use-kodland-auto-sync";
import type { AutoSyncStatus } from "@/lib/kodland-auto-sync";
import { useSearchParams } from "next/navigation";
import { Bell, RefreshCw, Settings, X } from "lucide-react";
import { Suspense, createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Input } from "./ui";
import { kodlandApi, manualTeachingApi, tutorPreferencesApi } from "@/lib/api";
import type { DemoSnapshot } from "@/lib/demo-snapshot";
import { DEFAULT_ABSENCE_MESSAGE } from "@/lib/manual-operations";
import { defaultNotificationSettings, validateActivityMessageTemplate, validateNotificationSettings, evaluateStudentNotifications, needsNotificationContact, notificationMessage, notificationTarget, type NotificationCase, type NotificationSettings, type StudentNotification } from "@/lib/student-notification-rules";
import { clearStudentNotificationSourceCache, demoStudentNotificationSource, loadStudentNotificationSource, type NotificationSource } from "@/lib/student-notification-source";
import { createDemoStudentNotificationStore, createStudentNotificationStore, subscribeStudentNotifications } from "@/lib/student-notification-store";
import { whatsappUrl } from "@/lib/whatsapp";

type NotificationContext = {
  settings: NotificationSettings | null; cases: NotificationCase[]; warnings: string[]; error: string; loading: boolean; updated: string; demo: boolean;
  refresh: (force?: boolean) => Promise<void>;
  save: (settings: NotificationSettings) => Promise<void>;
  preview: (settings: NotificationSettings) => Promise<number>;
  confirm: (item: NotificationCase) => Promise<void>;
  read: (item: NotificationCase) => Promise<void>;
  contact: (item: StudentNotification, name: string, phone: string) => Promise<void>;
  absenceTemplate: string;
  autoSync: AutoSyncStatus;
};
const Context = createContext<NotificationContext | null>(null);
export const useStudentNotifications = () => useContext(Context);

export function StudentNotificationsProvider({ uid, snapshot, onDemoChange, children }: { uid: string; snapshot?: DemoSnapshot | null; onDemoChange?: (change: (value: DemoSnapshot) => DemoSnapshot) => void; children: ReactNode }) {
  const demo = uid === "demo-profile";
  const autoSync = useKodlandAutoSync(uid, demo);
  const store = useMemo(() => demo ? createDemoStudentNotificationStore() : createStudentNotificationStore(uid), [uid, demo]);
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [cases, setCases] = useState<NotificationCase[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updated, setUpdated] = useState("");
  const [absenceTemplate, setAbsenceTemplate] = useState(DEFAULT_ABSENCE_MESSAGE);
  const source = useCallback(async (value: NotificationSettings, force = false): Promise<NotificationSource> => {
    if (!demo) return loadStudentNotificationSource(uid, value, force);
    if (!snapshot) throw new Error("Demonstração ainda não carregada.");
    return demoStudentNotificationSource(snapshot, value);
  }, [demo, uid, snapshot]);
  const generation = useRef(0);
  const refresh = useCallback(async (force = false) => {
    const run = ++generation.current;
    const startedAt = new Date().toISOString();
    setLoading(true);
    try {
      const [value, history] = await Promise.all([store.settings(), store.cases()]);
      if (run !== generation.current) return;
      setSettings(value); setCases(history);
      const prefs = demo ? snapshot?.tutorPreferences : await tutorPreferencesApi.get();
      if (run !== generation.current) return;
      setAbsenceTemplate(prefs?.absence_message_template || DEFAULT_ABSENCE_MESSAGE);
      const data = value.enabled ? await source(value, force) : null;
      if (run !== generation.current) return;
      const items = data ? evaluateStudentNotifications(data.lessons, data.obligations, value, new Date()) : [];
      const rows = await store.reconcile(items, startedAt);
      if (run !== generation.current) return;
      setCases(rows); setWarnings(data?.warnings ?? []); setUpdated(data?.loaded_at ?? ""); setError("");
    } catch (reason) { if (run === generation.current) setError(reason instanceof Error ? reason.message : "Não foi possível atualizar os alertas. O histórico foi preservado."); }
    finally { if (run === generation.current) setLoading(false); }
  }, [demo, snapshot, store, source]);
  useEffect(() => {
    const reload = () => { if (document.visibilityState !== "hidden") void refresh(); };
    const timer = window.setTimeout(reload, 0);
    const interval = window.setInterval(reload, 60000);
    const unsubscribe = subscribeStudentNotifications(() => { clearStudentNotificationSourceCache(); reload(); });
    window.addEventListener("focus", reload); window.addEventListener("online", reload); window.addEventListener("storage", reload); document.addEventListener("visibilitychange", reload);
    const runGeneration = generation;
    return () => { runGeneration.current++; clearTimeout(timer); clearInterval(interval); unsubscribe(); window.removeEventListener("focus", reload); window.removeEventListener("online", reload); window.removeEventListener("storage", reload); document.removeEventListener("visibilitychange", reload); };
  }, [refresh]);
  const value: NotificationContext = {
    settings, cases, warnings, error, loading, updated, demo, absenceTemplate, autoSync,
    refresh: (force) => refresh(force),
    save: async input => { await store.saveSettings(input); await refresh(true); },
    preview: async input => { const checked = validateNotificationSettings(input); const data = await source(checked, true); return evaluateStudentNotifications(data.lessons, data.obligations, checked, new Date()).length; },
    read: item => store.markRead(item.id, item.notification.revision),
    confirm: async item => { await store.confirmContact(item.id, item.notification.revision); await refresh(); },
    contact: async (item, name, phone) => {
      if (!name.trim() || !phone.trim() || phone.replace(/\D/g, "").length < 10) throw new Error("Informe nome e telefone válido do responsável.");
      if (demo) {
        if (!onDemoChange) throw new Error("Demonstração indisponível.");
        onDemoChange(current => item.source === "manual" ? { ...current, manualStudents: current.manualStudents.map(student => student.id === item.student_id ? { ...student, guardian_name: name, guardian_phone: phone } : student) } : { ...current, students: current.students.map(student => student.external_id === item.student_id && student.external_class_id === item.class_id ? { ...student, guardian_name: name, guardian_phone: phone } : student) });
      } else if (item.source === "manual") {
        const student = (await manualTeachingApi.students()).find(student => student.id === item.student_id);
        if (!student) throw new Error("Aluno não encontrado.");
        await manualTeachingApi.saveStudent({ ...student, guardian_name: name, guardian_phone: phone });
      } else {
        const student = (await kodlandApi.students()).items.find(student => student.external_id === item.student_id && student.external_class_id === item.class_id);
        if (!student) throw new Error("Aluno não encontrado.");
        await kodlandApi.updateStudent(student.id, { guardian_name: name, guardian_phone: phone });
      }
      clearStudentNotificationSourceCache(); await refresh(true);
    },
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

const labels = { absence: "Falta", classroom: "Atividade de aula", homework: "Dever de casa" };
export function StudentNotificationBell() {
  const state = useStudentNotifications();
  const [open, setOpen] = useState(false);
  const [history, setHistory] = useState(false);
  const [filter, setFilter] = useState("all");
  const trigger = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  if (!state) return null;
  const NavigationLink = state.demo ? "a" : Link;
  const pending = state.settings?.enabled ? state.cases.filter(needsNotificationContact) : [];
  const list = (history ? state.cases.filter(item => !needsNotificationContact(item)) : pending).filter(item => filter === "all" || item.notification.category === filter).sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id));
  return <div className="notifications-anchor"><div><button ref={trigger} aria-expanded={open} aria-controls={panelId} type="button" className="button button-ghost notification-bell" aria-label={`Notificações: ${pending.length} pendentes`} title="Notificações" onClick={() => setOpen(value => !value)}><Bell size={20} aria-hidden="true" />{pending.length > 0 && <span className="notification-counter" aria-hidden="true">{pending.length > 99 ? "99+" : pending.length}</span>}</button>
    <HeaderDropdown open={open} id={panelId} label="Notificações" trigger={trigger} onClose={() => setOpen(false)} className="student-alerts-dropdown"><div className="notifications-heading"><h2>Notificações</h2><div className="notification-heading-actions"><NavigationLink aria-label="Configurar notificações" title="Configurar notificações" href={state.demo ? "/demo?section=notifications#settings" : "/settings#notifications"} onClick={() => { setOpen(false); window.dispatchEvent(new Event("nexusclass:open-notification-settings")); }}><Settings size={18} aria-hidden="true" /></NavigationLink><button type="button" aria-label="Fechar notificações" title="Fechar notificações" onClick={() => setOpen(false)}><X size={18} aria-hidden="true" /></button></div></div><div className="notifications-scroll"><div className="notification-toolbar"><Button className="button-ghost" onClick={() => setHistory(false)} aria-pressed={!history}>Pendentes ({pending.length})</Button><Button className="button-ghost" onClick={() => setHistory(true)} aria-pressed={history}>Histórico</Button><button className="button button-ghost" type="button" aria-label="Atualizar notificações" disabled={state.loading} onClick={() => void state.refresh(true)}><RefreshCw size={18} /></button></div>

      {!state.demo && state.autoSync.message && <p className={state.autoSync.phase === "error" ? "form-error" : "muted"} role="status">{state.autoSync.message}</p>}
      {!state.demo && state.autoSync.phase === "ready" && state.autoSync.updatedAt && <small className="muted">Kodland atualizada: {new Date(state.autoSync.updatedAt).toLocaleString("pt-BR")}</small>}
      {!state.settings?.enabled && <p>Ative e configure os alertas para começar o acompanhamento.</p>}
      {state.loading && <p role="status">Atualizando alertas…</p>}{state.error && <p className="form-error" role="alert">{state.error}</p>}
      {state.warnings.map(item => <p className="muted" key={item}>{item}</p>)}
      {state.updated && <small className="muted">Alertas verificados: {new Date(state.updated).toLocaleString("pt-BR")}</small>}
      <label className="field">Motivo<select className="input" aria-label="Motivo" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">Todos</option>{Object.entries(labels).map(([id, label]) => <option value={id} key={id}>{label}</option>)}</select></label>
      {!state.loading && !list.length && <p className="muted">{history ? "Nenhum alerta no histórico." : "Nenhum contato pendente pelas regras atuais."}</p>}
      <div className="notification-list">{list.map(item => <article className="notification-card" key={item.id}><small>{labels[item.notification.category]} · {item.notification.lesson_date.split("-").reverse().join("/")}</small><strong>{item.notification.student_name}</strong><span>{item.notification.class_name} · {item.notification.lesson_label}</span><p>{item.notification.reason}</p>{history && <small>{item.active ? "Contato confirmado" : "Fora das pendências atuais"}</small>}<NavigationLink className="button button-primary" href={notificationTarget(item.notification, state.demo)} onClick={() => { setOpen(false); void state.read(item).catch(() => undefined); }}>{history ? "Ver detalhes" : "Resolver"}</NavigationLink></article>)}</div>
    </div></HeaderDropdown></div></div>;
}

export function NotificationSettingsPanel() {
  const state = useStudentNotifications();
  const [draft, setDraft] = useState<NotificationSettings | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<number | null>(null);
  useEffect(() => { if (state?.settings) { const timer = setTimeout(() => setDraft(current => current ?? state.settings), 0); return () => clearTimeout(timer); } }, [state?.settings]);
  if (!state) return <p>Notificações indisponíveis neste contexto.</p>;
  if (!draft) return <div><p role="status">Carregando notificações…</p>{state.error && <p role="alert">{state.error}</p>}</div>;
  const change = (patch: Partial<NotificationSettings>) => { setDraft({ ...draft, ...patch }); setPreview(null); setNotice(""); };
  const run = async (save: boolean) => { setBusy(true); setError(""); try { validateActivityMessageTemplate(draft.activity_message_template); if (save) { await state.save(draft); setNotice("Regras de notificações salvas."); } else setPreview(await state.preview(draft)); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } finally { setBusy(false); } };
  return <section className="panel notification-settings"><h3>Notificações de acompanhamento</h3><p className="muted">Alertas dentro do NexusClass, atualizados enquanto o aplicativo estiver aberto. Para atualizar a Kodland automaticamente, mantenha a integração ativa e o acesso salvo em Dados e backup. O contato com os responsáveis é revisado por você.</p><form onSubmit={event => { event.preventDefault(); void run(true); }}><fieldset disabled={busy} className="settings-fieldset notification-fields">
    <label><input type="checkbox" checked={draft.enabled} onChange={event => change({ enabled: event.target.checked })} /> Ativar notificações</label>
    <label><input type="checkbox" checked={draft.attendance_enabled} onChange={event => change({ attendance_enabled: event.target.checked })} /> Alertar faltas sem justificativa</label>
    <label className="field">Atividades de aula<select className="input" value={draft.classroom_rule} onChange={event => change({ classroom_rule: event.target.value as NotificationSettings["classroom_rule"] })}><option value="off">Não alertar</option><option value="none_submitted">Nenhuma atividade da aula entregue</option><option value="more_than">Mais de N atividades sem entregar</option></select></label>
    {draft.classroom_rule === "more_than" && <label className="field">Limite de atividades (N)<Input type="number" min="0" max="1000" value={draft.classroom_threshold} onChange={event => change({ classroom_threshold: Number(event.target.value) })} /><small>Mais de 2 significa 3 ou mais pendentes.</small></label>}
    <label><input type="checkbox" checked={draft.homework_enabled} onChange={event => change({ homework_enabled: event.target.checked })} /> Alertar deveres de casa vencidos</label>
    <div className="notification-form-grid"><label className="field">Tolerância em minutos<Input type="number" min="0" max="43200" value={draft.tolerance_minutes} onChange={event => change({ tolerance_minutes: Number(event.target.value) })} /></label><label className="field">Casa sem prazo: dias após a aula<Input type="number" min="0" max="365" placeholder="Não cobrar sem prazo" value={draft.homework_days_after_lesson ?? ""} onChange={event => change({ homework_days_after_lesson: event.target.value === "" ? null : Number(event.target.value) })} /><small>Prazo às 23:59 no fuso escolhido. Vazio desativa cobrança sem prazo explícito.</small></label><label className="field">Acompanhar aulas a partir de<Input type="date" required value={draft.start_date} onChange={event => change({ start_date: event.target.value })} /></label><label className="field">Fuso horário<Input required value={draft.time_zone} onChange={event => change({ time_zone: event.target.value })} /></label></div>
    <ActivityMessageEditor value={draft.activity_message_template} onChange={value => change({ activity_message_template: value })} disabled={busy} />
    <small>Para faltas, use o modelo em Configurações → Mensagens. Salvar as notificações também salva este modelo de atividades.</small>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}{preview !== null && <p role="status">Prévia: {preview} alerta(s) pelas regras selecionadas.</p>}
    <div className="form-actions"><Button type="button" className="button-ghost" onClick={() => void run(false)}>Ver prévia</Button><Button type="submit">{busy ? "Salvando…" : "Salvar notificações"}</Button></div>
  </fieldset></form></section>;
}

export function NotificationResolution({ onContext }: { onContext?: (item: StudentNotification) => void }) {
  return <Suspense fallback={<p role="status">Localizando a pendência…</p>}><NotificationResolutionContent onContext={onContext} /></Suspense>;
}
function NotificationResolutionContent({ onContext }: { onContext?: (item: StudentNotification) => void }) {
  const state = useStudentNotifications();
  const id = useSearchParams().get("notification") ?? "";
  const notification = state?.cases.find(item => item.id === id)?.notification;
  useEffect(() => { if (notification) onContext?.(notification); }, [notification, onContext]);
  if (!state || !id) return null;
  const item = state.cases.find(item => item.id === id);
  if (state.loading && !item) return <p role="status">Localizando a pendência…</p>;
  if (!item) return <section className="panel"><h3>Alerta indisponível</h3><p>Este alerta foi removido ou não pertence a esta conta. Abra a central e atualize as notificações.</p></section>;
  return <NotificationResolutionCard key={`${item.id}:${item.notification.revision}`} item={item} />;
}

function NotificationResolutionCard({ item }: { item: NotificationCase }) {
  const state = useStudentNotifications()!;
  const notification = item.notification;
  const [message, setMessage] = useState(() => notificationMessage(notification, notification.category === "absence" ? state.absenceTemplate : state.settings?.activity_message_template ?? defaultNotificationSettings().activity_message_template));
  const [name, setName] = useState(notification.guardian_name);
  const [phone, setPhone] = useState(notification.guardian_phone);
  const [editingContact, setEditingContact] = useState(!notification.guardian_phone);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState(false);
  const run = async (action: () => Promise<void>) => { setBusy(true); setError(""); try { await action(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); } finally { setBusy(false); } };
  return <section className="panel notification-resolution" aria-label="Resolver notificação"><small>{labels[notification.category]} · {notification.lesson_date.split("-").reverse().join("/")}</small><h3>{notification.student_name} · {notification.class_name}</h3><strong>{notification.lesson_label}</strong><p>{notification.reason}</p>{!item.active && <p role="status">Esta condição não está mais nas pendências atuais. Consulte os dados antes de entrar em contato.</p>}
    {notification.activities.length > 0 && <ul>{notification.activities.map(activity => <li key={activity.id}>{activity.title}{activity.due_at ? ` · Prazo: ${new Date(activity.due_at).toLocaleString("pt-BR")}` : ""}</li>)}</ul>}
    <p>Responsável: {notification.guardian_name || "Não cadastrado"} · {notification.guardian_phone || "Telefone não cadastrado"}</p><Button type="button" className="button-ghost" onClick={() => setEditingContact(!editingContact)}>Cadastrar ou editar contato</Button>
    {editingContact && <form onSubmit={event => { event.preventDefault(); void run(async () => { await state.contact(notification, name, phone); setEditingContact(false); }); }}><fieldset disabled={busy} className="settings-fieldset notification-fields"><label className="field">Nome do responsável<Input value={name} required onChange={event => setName(event.target.value)} /></label><label className="field">Telefone do responsável<Input type="tel" value={phone} required onChange={event => setPhone(event.target.value)} /></label><Button type="submit">Salvar contato</Button></fieldset></form>}
    <label className="field">Mensagem para o responsável<textarea aria-label="Mensagem para o responsável" className="input" rows={6} value={message} onChange={event => setMessage(event.target.value)} /></label>
    <div className="form-actions">{notification.guardian_phone && message.trim() && <a className="button button-primary" href={whatsappUrl(notification.guardian_phone, message)} target="_blank" rel="noreferrer" onClick={() => setOpened(true)}>Abrir WhatsApp</a>}<Button type="button" className="button-ghost" disabled={busy || !item.active || !needsNotificationContact(item)} onClick={() => void run(() => state.confirm(item))}>Confirmar contato realizado</Button></div>
    {opened && <p className="muted">WhatsApp aberto. Após enviar a mensagem, confirme que realizou o contato.</p>}{!needsNotificationContact(item) && item.active && <p role="status">Contato confirmado para esta pendência.</p>}{error && <p className="form-error" role="alert">{error}</p>}
  </section>;
}
