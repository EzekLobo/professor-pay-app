"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input } from "@/components/ui";
import { CalendarClock, Clock3, MessageCircle, Plus, Plug, WalletCards } from "lucide-react";
import { manualAdapter as productionAdapter } from "@/lib/manual-adapters-runtime";
import type { ManualAdapters } from "@/lib/manual-adapters";
import { DEFAULT_ABSENCE_MESSAGE, type ManualAvailability, type ManualOccurrence, type TutorPreferences } from "@/lib/manual-operations";
import type { ManualClass } from "@/lib/manual-teaching";

const weekdays = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const minutes = (value: string) => { const [hour, minute] = value.split(":").map(Number); return hour * 60 + minute; };
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const todayInSaoPaulo = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

export function SettingsContent({ adapter = productionAdapter }: { adapter?: ManualAdapters }) {
  const [preferences, setPreferences] = useState<TutorPreferences | null>(null);
  const [availability, setAvailability] = useState<ManualAvailability[]>([]);
  const [classes, setClasses] = useState<ManualClass[]>([]);
  const [occurrences, setOccurrences] = useState<ManualOccurrence[]>([]);
  const [defaultRate, setDefaultRate] = useState("");
  const [newSlot, setNewSlot] = useState({ week_day: 1, start_time: "18:00", end_time: "21:00" });
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  useEffect(() => { void Promise.all([adapter.preferences.get(), adapter.operations.availability(), adapter.settings.get(), adapter.teaching.classes()]).then(async ([prefs, slots, finance, classRows]) => {
    const occurrenceRows = (await Promise.all(classRows.filter((item) => item.active).map((item) => adapter.operations.ensureOccurrences(item.id)))).flat();
    setPreferences(prefs); setAvailability(slots); setClasses(classRows); setOccurrences(occurrenceRows); setDefaultRate(finance.default_hourly_rate_cents == null ? "" : (finance.default_hourly_rate_cents / 100).toFixed(2).replace(".", ","));
  }).catch((reason) => setError(reason instanceof Error ? reason.message : "Não foi possível carregar as configurações.")); }, [adapter]);
  const freeByAvailability = useMemo(() => new Map(availability.map((availabilityItem) => {
    let free: Array<[number, number]> = [[minutes(availabilityItem.start_time), minutes(availabilityItem.end_time)]];
    const today = todayInSaoPaulo();
    const activeClassIds = new Set(classes.filter((item) => item.active).map((item) => item.id));
    const occupied = occurrences.filter((item) => activeClassIds.has(item.class_id) && item.lesson_date >= today && (item.status === "planned" || item.status === "held") && new Date(`${item.lesson_date}T12:00:00Z`).getUTCDay() === availabilityItem.week_day).map((item) => [minutes(item.start_time), minutes(item.start_time) + item.duration_minutes] as [number, number]);
    for (const [occupiedStart, occupiedEnd] of occupied) free = free.flatMap(([start, end]) => occupiedEnd <= start || occupiedStart >= end ? [[start, end]] : [[start, Math.max(start, occupiedStart)], [Math.min(end, occupiedEnd), end]].filter(([left, right]) => right > left) as Array<[number, number]>);
    return [availabilityItem.id, free.map(([start, end]) => `${clock(start)}–${clock(end)}`).join(", ") || "sem horário livre"];
  })), [availability, classes, occurrences]);

  async function save(event: FormEvent) {
    event.preventDefault(); if (!preferences || busy) return; setBusy(true); setError("");
    try {
      const rate = Math.round(Number(defaultRate.replace(",", ".")) * 100);
      if (!Number.isInteger(rate) || rate <= 0) throw new Error("Informe uma tarifa padrão válida.");
      const saved = await adapter.preferences.save({ ...preferences, onboarding_completed: true });
      await adapter.settings.setDefaultRate(rate);
      setPreferences(saved); setNotice("Configurações salvas.");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar."); }
    finally { setBusy(false); }
  }

  async function addAvailability() {
    setError("");
    try {
      const saved = await adapter.operations.saveAvailability({ id: `availability-${crypto.randomUUID()}`, ...newSlot, active: true });
      setAvailability((current) => [...current, saved].sort((a, b) => a.week_day - b.week_day || a.start_time.localeCompare(b.start_time)));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o horário."); }
  }

  if (!preferences) return <p className="muted">Carregando configurações…</p>;
  return <div className="management-grid page-fill-grid settings-page">
    <div className="page-heading"><div><h2>Configurações do tutor</h2><p>Padrões usados nos novos cadastros e na operação diária.</p></div></div>
    {error && <p className="form-error" role="alert">{error}</p>}{notice && <p className="notice" role="status">{notice}</p>}
    <form id="tutor-settings-form" className="settings-form" onSubmit={save}>
      <section className="panel settings-section settings-defaults">
        <div className="settings-section-heading"><span className="settings-section-icon"><Clock3 size={19} aria-hidden="true" /></span><div><h3>Padrões das aulas</h3><p>Valores preenchidos automaticamente em novos cadastros.</p></div></div>
        <div className="settings-default-grid">
          <label><span>Duração</span><span className="settings-input-with-suffix"><Input type="number" min="15" max="480" value={preferences.default_duration_minutes} onChange={(event) => setPreferences({ ...preferences, default_duration_minutes: Number(event.target.value) })} /><small>minutos</small></span></label>
          <label><span>Dia de pagamento</span><span className="settings-input-with-suffix"><Input type="number" min="1" max="31" value={preferences.default_payment_day} onChange={(event) => setPreferences({ ...preferences, default_payment_day: Number(event.target.value) })} /><small>do mês</small></span></label>
          <label><span>Tarifa por hora</span><span className="settings-input-with-prefix"><small>R$</small><Input inputMode="decimal" value={defaultRate} onChange={(event) => setDefaultRate(event.target.value)} /></span></label>
        </div>
      </section>
      <section className="panel settings-section settings-message">
        <div className="settings-section-heading"><span className="settings-section-icon"><MessageCircle size={19} aria-hidden="true" /></span><div><h3>Mensagem de ausência</h3><p>Texto editável apresentado antes do envio pelo WhatsApp.</p></div></div>
        <label className="settings-message-field"><span className="sr-only">Modelo da mensagem de ausência</span><textarea className="input" rows={7} value={preferences.absence_message_template} onChange={(event) => setPreferences({ ...preferences, absence_message_template: event.target.value })} /></label>
        <div className="settings-message-footer">
          <div className="settings-message-help"><span>Variáveis disponíveis</span><code>{'{primeiro_nome}'}</code><code>{'{codigo_aula}'}</code><code>{'{data}'}</code><code>{'{link_gravacao}'}</code><small>Use <code>{'{gravacao}'}</code> para ocultar o bloco quando não houver link.</small></div>
          <Button type="button" className="button-ghost settings-restore-button" onClick={() => setPreferences({ ...preferences, absence_message_template: DEFAULT_ABSENCE_MESSAGE })}>Restaurar padrão</Button>
        </div>
      </section>
      <section className="panel settings-section settings-integration">
        <div className="settings-section-heading"><span className="settings-section-icon"><Plug size={19} aria-hidden="true" /></span><div><h3>Integrações</h3><p>Recursos externos permanecem ocultos enquanto estiverem desativados.</p></div></div>
        <label className="settings-toggle"><span><strong>Kodland</strong><small>Importar turmas, cronograma e atividades.</small></span><input type="checkbox" checked={preferences.kodland_enabled} onChange={(event) => setPreferences({ ...preferences, kodland_enabled: event.target.checked })} /><i aria-hidden="true" /></label>
      </section>
    </form>
    <section className="panel settings-section settings-availability"><div className="settings-section-heading"><span className="settings-section-icon"><CalendarClock size={19} aria-hidden="true" /></span><div><h3>Disponibilidade semanal</h3><p>Cadastre os intervalos em que novas aulas podem ser agendadas.</p></div></div>
      <div className="availability-list">{availability.filter((item) => item.active).map((item) => <div className="availability-row" key={item.id}><span><strong>{weekdays[item.week_day]} · {item.start_time}–{item.end_time}</strong><small className="muted">Livre após descontar aulas: {freeByAvailability.get(item.id)}</small></span><button className="button button-ghost button-small" type="button" onClick={async () => { await adapter.operations.deleteAvailability(item.id); setAvailability((current) => current.filter((slot) => slot.id !== item.id)); }}>Remover</button></div>)}</div>
      <div className="availability-add"><label><span>Dia da semana</span><select className="input" value={newSlot.week_day} onChange={(event) => setNewSlot({ ...newSlot, week_day: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select></label><label><span>Início</span><Input type="time" value={newSlot.start_time} onChange={(event) => setNewSlot({ ...newSlot, start_time: event.target.value })} /></label><label><span>Fim</span><Input type="time" value={newSlot.end_time} onChange={(event) => setNewSlot({ ...newSlot, end_time: event.target.value })} /></label><Button className="availability-add-button" type="button" aria-label="Adicionar horário" title="Adicionar horário" onClick={() => void addAvailability()}><Plus size={20} aria-hidden="true" /></Button></div>
    </section>
    <div className="settings-save-bar"><span><WalletCards size={17} aria-hidden="true" />As alterações valem para os próximos cadastros.</span><Button form="tutor-settings-form" disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button></div>
  </div>;
}

export default function SettingsPage() { return <AuthGuard>{(user) => <Shell user={user}><SettingsContent /></Shell>}</AuthGuard>; }
