"use client";

import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { DataContent } from "@/components/data-page";
import { AccountUsernameSettings } from "@/components/account-username-settings";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input } from "@/components/ui";
import { AtSign, CalendarClock, Clock3, DatabaseBackup, MessageCircle, Plus, Plug } from "lucide-react";
import { manualAdapter as productionAdapter } from "@/lib/manual-adapters-runtime";
import type { ManualAdapters } from "@/lib/manual-adapters";
import { DEFAULT_ABSENCE_MESSAGE, type ManualAvailability, type ManualOccurrence, type TutorPreferences } from "@/lib/manual-operations";
import type { ManualClass } from "@/lib/manual-teaching";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const minutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const todayInSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

const settingsSections = [
  { id: "account", label: "Conta", icon: AtSign },
  { id: "defaults", label: "Aulas e pagamentos", icon: Clock3 },
  { id: "message", label: "Mensagens", icon: MessageCircle },
  { id: "integration", label: "Integrações", icon: Plug },
  { id: "availability", label: "Disponibilidade", icon: CalendarClock },
  { id: "data", label: "Dados e backup", icon: DatabaseBackup },
] as const;
type SettingsSection = (typeof settingsSections)[number]["id"];

export function SettingsContent({ adapter = productionAdapter, accountAccess = false, dataContent, initialSection }: { adapter?: ManualAdapters; accountAccess?: boolean; dataContent?: ReactNode; initialSection?: SettingsSection }) {
  const sections = settingsSections.filter((section) => accountAccess || section.id !== "account");
  const [section, setSection] = useState<SettingsSection>(initialSection ?? (accountAccess ? "account" : "defaults"));
  useEffect(() => {
    const syncHash = () => { if (window.location.hash === "#data") setSection("data"); };
    const timer = window.setTimeout(syncHash, 0);
    window.addEventListener("hashchange", syncHash);
    return () => { window.clearTimeout(timer); window.removeEventListener("hashchange", syncHash); };
  }, []);
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [preferences, setPreferences] = useState<TutorPreferences | null>(null);
  const [availability, setAvailability] = useState<ManualAvailability[]>([]);
  const [classes, setClasses] = useState<ManualClass[]>([]);
  const [occurrences, setOccurrences] = useState<ManualOccurrence[]>([]);
  const [defaultRate, setDefaultRate] = useState("");
  const [newSlot, setNewSlot] = useState({ week_day: 1, start_time: "18:00", end_time: "21:00" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void Promise.all([adapter.preferences.get(), adapter.operations.availability(), adapter.settings.get(), adapter.teaching.classes()]).then(async ([prefs, slots, finance, classRows]) => {
      const occurrenceRows = (await Promise.all(classRows.filter((item) => item.active).map((item) => adapter.operations.ensureOccurrences(item.id)))).flat();
      if (!active) return;
      setPreferences(prefs); setAvailability(slots); setClasses(classRows); setOccurrences(occurrenceRows); setDefaultRate(finance.default_hourly_rate_cents == null ? "" : (finance.default_hourly_rate_cents / 100).toFixed(2).replace(".", ","));
    }).catch((reason) => { if (active) setError(reason instanceof Error ? reason.message : "Não foi possível carregar as configurações."); });
    return () => { active = false; };
  }, [adapter, loadAttempt]);
  const freeByAvailability = useMemo(() => new Map(availability.map((availabilityItem) => {
    let free: Array<[number, number]> = [[minutes(availabilityItem.start_time), minutes(availabilityItem.end_time)]];
    const today = todayInSaoPaulo();
    const activeClassIds = new Set(classes.filter((item) => item.active).map((item) => item.id));
    const occupied = occurrences.filter((item) => activeClassIds.has(item.class_id) && item.lesson_date >= today && (item.status === "planned" || item.status === "held") && new Date(`${item.lesson_date}T12:00:00Z`).getUTCDay() === availabilityItem.week_day).map((item) => [minutes(item.start_time), minutes(item.start_time) + item.duration_minutes] as [number, number]);
    for (const [occupiedStart, occupiedEnd] of occupied) free = free.flatMap(([start, end]) => occupiedEnd <= start || occupiedStart >= end ? [[start, end]] : [[start, Math.max(start, occupiedStart)], [Math.min(end, occupiedEnd), end]].filter(([left, right]) => right > left) as Array<[number, number]>);
    return [availabilityItem.id, free.map(([start, end]) => `${clock(start)}–${clock(end)}`).join(", ") || "sem horário livre"];
  })), [availability, classes, occurrences]);

  function selectSection(value: SettingsSection) {
    if (busy || availabilityBusy) return;
    setSection(value); setError(""); setNotice("");
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!preferences || busy || section === "account" || section === "availability" || section === "data") return;
    setBusy(true); setError(""); setNotice("");
    try {
      const rate = Math.round(Number(defaultRate.replace(",", ".")) * 100);
      if (section === "defaults" && (!Number.isInteger(rate) || rate <= 0)) throw new Error("Informe uma tarifa padrão válida.");
      const changes = section === "defaults"
        ? { default_duration_minutes: preferences.default_duration_minutes, default_payment_day: preferences.default_payment_day }
        : section === "message" ? { absence_message_template: preferences.absence_message_template }
        : { kodland_enabled: preferences.kodland_enabled };
      const saved = await adapter.preferences.save({ ...changes, onboarding_completed: true });
      if (section === "defaults") await adapter.settings.setDefaultRate(rate);
      setPreferences((current) => current ? { ...current, ...changes, onboarding_completed: saved.onboarding_completed, updated_at: saved.updated_at } : saved);
      setNotice("Configurações salvas.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }

  async function addAvailability() {
    if (availabilityBusy) return;
    setAvailabilityBusy(true); setError(""); setNotice("");
    try {
      const saved = await adapter.operations.saveAvailability({ id: `availability-${crypto.randomUUID()}`, ...newSlot, active: true });
      setAvailability((current) => [...current, saved].sort((a, b) => a.week_day - b.week_day || a.start_time.localeCompare(b.start_time)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o horário."); }
    finally { setAvailabilityBusy(false); }
  }

  async function removeAvailability(id: string) {
    if (availabilityBusy) return;
    setAvailabilityBusy(true); setError(""); setNotice("");
    try {
      await adapter.operations.deleteAvailability(id);
      setAvailability((current) => current.filter((slot) => slot.id !== id));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível remover o horário."); }
    finally { setAvailabilityBusy(false); }
  }

  if (!preferences) return error ? <div><p className="form-error" role="alert">{error}</p><Button type="button" className="button-ghost" onClick={() => { setError(""); setLoadAttempt((value) => value + 1); }}>Tentar novamente</Button></div> : <p className="muted" role="status">Carregando configurações…</p>;
  return <div className="settings-page settings-layout">
    <div className="settings-menu" role="tablist" aria-label="Seções das configurações">{sections.map((item, index) => {
      const Icon = item.icon;
      return <button key={item.id} id={`settings-tab-${item.id}`} type="button" role="tab" aria-selected={section === item.id} aria-controls={`settings-panel-${item.id}`} tabIndex={section === item.id ? 0 : -1} disabled={busy || availabilityBusy} onClick={() => selectSection(item.id)} onKeyDown={(event) => {
        const offset = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
        const target = event.key === "Home" ? 0 : event.key === "End" ? sections.length - 1 : offset ? (index + offset + sections.length) % sections.length : -1;
        if (target < 0) return;
        event.preventDefault(); selectSection(sections[target].id);
        document.getElementById(`settings-tab-${sections[target].id}`)?.focus();
      }}><Icon size={18} aria-hidden="true" /><span>{item.label}</span></button>;
    })}</div>
    <div className="settings-content">
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    {accountAccess && <div id="settings-panel-account" role="tabpanel" aria-labelledby="settings-tab-account" hidden={section !== "account"} tabIndex={0}><AccountUsernameSettings /></div>}
    <form id="tutor-settings-form" className="settings-form" onSubmit={save} hidden={section === "account" || section === "availability" || section === "data"}>
      <div id="settings-panel-defaults" role="tabpanel" aria-labelledby="settings-tab-defaults" hidden={section !== "defaults"} tabIndex={0}><fieldset className="settings-fieldset" disabled={section !== "defaults" || busy}>
      <section className="panel settings-section settings-defaults">
        <div className="settings-section-heading"><span className="settings-section-icon"><Clock3 size={19} aria-hidden="true" /></span><div><h3>Padrões das aulas</h3><p>Valores preenchidos automaticamente em novos cadastros.</p></div></div>
        <div className="settings-default-grid">
          <label><span>Duração</span><span className="settings-input-with-suffix"><Input type="number" min="15" max="480" value={preferences.default_duration_minutes} onChange={(event) => setPreferences({ ...preferences, default_duration_minutes: Number(event.target.value) })} /><small>minutos</small></span></label>
          <label><span>Dia de pagamento</span><span className="settings-input-with-suffix"><Input type="number" min="1" max="31" value={preferences.default_payment_day} onChange={(event) => setPreferences({ ...preferences, default_payment_day: Number(event.target.value) })} /><small>do mês</small></span></label>
          <label><span>Tarifa por hora</span><span className="settings-input-with-prefix"><small>R$</small><Input inputMode="decimal" value={defaultRate} onChange={(event) => setDefaultRate(event.target.value)} /></span></label>
        </div>
      </section>
      </fieldset></div>
      <div id="settings-panel-message" role="tabpanel" aria-labelledby="settings-tab-message" hidden={section !== "message"} tabIndex={0}><fieldset className="settings-fieldset" disabled={section !== "message" || busy}>
      <section className="panel settings-section settings-message">
        <div className="settings-section-heading"><span className="settings-section-icon"><MessageCircle size={19} aria-hidden="true" /></span><div><h3>Mensagem de ausência</h3><p>Texto editável apresentado antes do envio pelo WhatsApp.</p></div></div>
        <label className="settings-message-field"><span className="sr-only">Modelo da mensagem de ausência</span><textarea className="input" rows={7} value={preferences.absence_message_template} onChange={(event) => setPreferences({ ...preferences, absence_message_template: event.target.value })} /></label>
        <div className="settings-message-footer">
          <div className="settings-message-help"><span>Variáveis disponíveis</span><code>{'{primeiro_nome}'}</code><code>{'{codigo_aula}'}</code><code>{'{data}'}</code><code>{'{link_gravacao}'}</code><small>Use <code>{'{gravacao}'}</code> para ocultar o bloco quando não houver link.</small></div>
          <Button type="button" className="button-ghost settings-restore-button" onClick={() => setPreferences({ ...preferences, absence_message_template: DEFAULT_ABSENCE_MESSAGE })}>Restaurar padrão</Button>
        </div>
      </section>
      </fieldset></div>
      <div id="settings-panel-integration" role="tabpanel" aria-labelledby="settings-tab-integration" hidden={section !== "integration"} tabIndex={0}><fieldset className="settings-fieldset" disabled={section !== "integration" || busy}>
      <section className="panel settings-section settings-integration">
        <div className="settings-section-heading"><span className="settings-section-icon"><Plug size={19} aria-hidden="true" /></span><div><h3>Integrações</h3><p>Recursos externos permanecem ocultos enquanto estiverem desativados.</p></div></div>
        <label className="settings-toggle"><span><strong>Kodland</strong><small>Importar turmas, cronograma e atividades.</small></span><input type="checkbox" checked={preferences.kodland_enabled} onChange={(event) => setPreferences({ ...preferences, kodland_enabled: event.target.checked })} /><i aria-hidden="true" /></label>
      </section>
      </fieldset></div>
      <div className="settings-save-bar"><span>{section === "defaults" ? "Aplicado aos próximos cadastros." : section === "message" ? "Usada nas mensagens de ausência." : "Defina quais integrações deseja usar."}</span><Button type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button></div>
    </form>
    <section id="settings-panel-availability" role="tabpanel" aria-labelledby="settings-tab-availability" hidden={section !== "availability"} tabIndex={0} className="panel settings-section settings-availability"><div className="settings-section-heading"><span className="settings-section-icon"><CalendarClock size={19} aria-hidden="true" /></span><div><h3>Disponibilidade semanal</h3><p>Cadastre os horários disponíveis. As alterações são salvas automaticamente.</p></div></div>
      {availability.filter((item) => item.active).length === 0 && <p className="muted settings-empty">Nenhum horário cadastrado.</p>}
      <div className="availability-list">{availability.filter((item) => item.active).map((item) => <div className="availability-row" key={item.id}><span><strong>{weekdays[item.week_day]} · {item.start_time}–{item.end_time}</strong><small className="muted">Livre após descontar aulas: {freeByAvailability.get(item.id)}</small></span><button className="button button-ghost button-small" type="button" disabled={availabilityBusy} onClick={() => void removeAvailability(item.id)}>Remover</button></div>)}</div>
      <div className="availability-add"><label><span>Dia da semana</span><select className="input" value={newSlot.week_day} onChange={(event) => setNewSlot({ ...newSlot, week_day: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label><span>Início</span><Input type="time" value={newSlot.start_time} onChange={(event) => setNewSlot({ ...newSlot, start_time: event.target.value })} /></label><label><span>Fim</span><Input type="time" value={newSlot.end_time} onChange={(event) => setNewSlot({ ...newSlot, end_time: event.target.value })} /></label><Button className="availability-add-button" disabled={availabilityBusy} type="button" aria-label="Adicionar horário" title="Adicionar horário" onClick={() => void addAvailability()}><Plus size={20} aria-hidden="true" /></Button></div>
    </section>
    <div id="settings-panel-data" role="tabpanel" aria-labelledby="settings-tab-data" hidden={section !== "data"} tabIndex={0}>{section === "data" && (dataContent ?? <DataContent />)}</div>
    </div>
  </div>;
}

export default function SettingsPage() { return <AuthGuard>{(user) => <Shell user={user}><SettingsContent accountAccess /></Shell>}</AuthGuard>; }
