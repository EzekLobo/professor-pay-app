"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Button, Input } from "@/components/ui";
import Link from "next/link";
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
    {!preferences.onboarding_completed && <section className="panel onboarding-card"><h3>Primeiros passos</h3><p className="muted">Você pode usar a aplicação enquanto configura. Salve seus padrões e siga na ordem que preferir.</p><div className="card-actions"><Link className="button button-ghost" href="/classes">1. Cadastrar aluno e turma</Link><Link className="button button-ghost" href="/lessons">2. Criar curso</Link></div></section>}
    <section className="panel"><form className="management-form" onSubmit={save}>
      <label>Duração padrão (minutos)<Input type="number" min="15" max="480" value={preferences.default_duration_minutes} onChange={(event) => setPreferences({ ...preferences, default_duration_minutes: Number(event.target.value) })} /></label>
      <label>Dia padrão de pagamento<Input type="number" min="1" max="31" value={preferences.default_payment_day} onChange={(event) => setPreferences({ ...preferences, default_payment_day: Number(event.target.value) })} /></label>
      <label>Tarifa padrão (R$/h)<Input inputMode="decimal" value={defaultRate} onChange={(event) => setDefaultRate(event.target.value)} /></label>
      <label className="field-wide">Modelo da mensagem de ausência<textarea className="input" rows={9} value={preferences.absence_message_template} onChange={(event) => setPreferences({ ...preferences, absence_message_template: event.target.value })} /><small className="muted">Variáveis: {'{primeiro_nome}'}, {'{codigo_aula}'}, {'{data}'} e {'{link_gravacao}'}. Use {'{gravacao}'} para ocultar automaticamente o bloco quando não houver link.</small></label>
      <label className="checkbox-row field-wide"><input type="checkbox" checked={preferences.kodland_enabled} onChange={(event) => setPreferences({ ...preferences, kodland_enabled: event.target.checked })} />Ativar integração Kodland</label>
      <div className="form-actions"><Button type="button" className="button-ghost" onClick={() => setPreferences({ ...preferences, absence_message_template: DEFAULT_ABSENCE_MESSAGE })}>Restaurar mensagem</Button><Button disabled={busy}>{busy ? "Salvando…" : "Salvar configurações"}</Button></div>
    </form></section>
    <section className="panel"><div className="panel-heading"><div><h3>Disponibilidade semanal</h3><p>Cadastre os intervalos em que novas aulas podem ser agendadas.</p></div></div>
      <div className="availability-list">{availability.filter((item) => item.active).map((item) => <div className="availability-row" key={item.id}><span><strong>{weekdays[item.week_day]} · {item.start_time}–{item.end_time}</strong><small className="muted">Livre após descontar aulas: {freeByAvailability.get(item.id)}</small></span><button className="button button-ghost button-small" type="button" onClick={async () => { await adapter.operations.deleteAvailability(item.id); setAvailability((current) => current.filter((slot) => slot.id !== item.id)); }}>Remover</button></div>)}</div>
      <div className="availability-add"><select className="input" aria-label="Dia da semana" value={newSlot.week_day} onChange={(event) => setNewSlot({ ...newSlot, week_day: Number(event.target.value) })}>{weekdays.map((day, index) => <option value={index} key={day}>{day}</option>)}</select><Input aria-label="Início da disponibilidade" type="time" value={newSlot.start_time} onChange={(event) => setNewSlot({ ...newSlot, start_time: event.target.value })} /><Input aria-label="Fim da disponibilidade" type="time" value={newSlot.end_time} onChange={(event) => setNewSlot({ ...newSlot, end_time: event.target.value })} /><Button type="button" onClick={() => void addAvailability()}>Adicionar</Button></div>
    </section>
  </div>;
}

export default function SettingsPage() { return <AuthGuard>{(user) => <Shell user={user}><SettingsContent /></Shell>}</AuthGuard>; }
