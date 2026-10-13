"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/modal";
import { Button, Input } from "@/components/ui";
import { holidaysApi } from "@/lib/api";
import { brazilianNationalHolidays, type CustomHoliday } from "@/lib/holidays";

const monthName = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdayNames = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const pad = (value: number) => String(value).padStart(2, "0");
const monthDate = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`;
const initialMonth = () => { const now = new Date(); return { year: now.getFullYear(), month: now.getMonth() }; };

export function HolidayCalendarDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [cursor, setCursor] = useState(initialMonth);
  const [customHolidays, setCustomHolidays] = useState<CustomHoliday[]>([]);
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const load = async () => { setError(""); try { setCustomHolidays(await holidaysApi.list()); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar os feriados personalizados."); } };
  // Loading starts only when the dialog becomes visible; this synchronizes the
  // dialog with the authenticated Firestore collection, not with render state.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (open) void load(); }, [open]);
  const national = useMemo(() => brazilianNationalHolidays(cursor.year), [cursor.year]);
  const monthHolidays = useMemo(() => [...national, ...customHolidays].filter((holiday) => holiday.date.startsWith(`${cursor.year}-${pad(cursor.month + 1)}`)).sort((left, right) => left.date.localeCompare(right.date) || left.source.localeCompare(right.source)), [cursor, customHolidays, national]);
  const holidaysByDate = useMemo(() => new Map(monthHolidays.map((holiday) => [holiday.date, holiday])), [monthHolidays]);
  const days = useMemo(() => { const first = new Date(Date.UTC(cursor.year, cursor.month, 1)); const leading = (first.getUTCDay() + 6) % 7; const count = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate(); return Array.from({ length: leading + count }, (_, index) => index < leading ? null : index - leading + 1); }, [cursor]);
  const changeMonth = (delta: number) => setCursor((current) => { const next = new Date(Date.UTC(current.year, current.month + delta, 1)); return { year: next.getUTCFullYear(), month: next.getUTCMonth() }; });
  const changed = () => window.dispatchEvent(new Event("nexusclass:holidays-changed"));
  const save = async (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); if (saving) return; setSaving(true); setError(""); try { const saved = await holidaysApi.save({ date, name }); setCustomHolidays((items) => [...items.filter((item) => item.id !== saved.id), saved]); setDate(""); setName(""); changed(); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar o feriado."); } finally { setSaving(false); } };
  const label = monthName.format(new Date(Date.UTC(cursor.year, cursor.month, 1)));
  return <Modal open={open} onClose={() => !saving && onClose()} title="Calendário de feriados" className="holiday-calendar-modal">
    <p className="muted">Feriados nacionais não entram automaticamente na previsão. Cadastre também os dias locais, escolares ou pessoais.</p>
    <div className="holiday-calendar-navigation"><button type="button" className="button button-ghost calendar-nav-button" aria-label="Mês anterior" onClick={() => changeMonth(-1)}><ChevronLeft size={18} aria-hidden="true" /></button><strong>{label}</strong><button type="button" className="button button-ghost calendar-nav-button" aria-label="Próximo mês" onClick={() => changeMonth(1)}><ChevronRight size={18} aria-hidden="true" /></button></div>
    <div className="holiday-calendar-grid" role="grid" aria-label={`Calendário de ${label}`}>{weekdayNames.map((weekday) => <span className="holiday-calendar-weekday" role="columnheader" key={weekday}>{weekday}</span>)}{days.map((day, index) => { if (!day) return <span className="holiday-calendar-empty" aria-hidden="true" key={`empty-${index}`} />; const iso = monthDate(cursor.year, cursor.month, day); const holiday = holidaysByDate.get(iso); return <span className={holiday ? `holiday-calendar-day holiday-calendar-day-${holiday.source.toLowerCase()}` : "holiday-calendar-day"} role="gridcell" title={holiday ? `${holiday.name} (${holiday.source === "NATIONAL" ? "nacional" : "personalizado"})` : undefined} key={iso}><time dateTime={iso}>{day}</time>{holiday && <small>{holiday.name}</small>}</span>; })}</div>
    <div className="holiday-calendar-legend" aria-label="Legenda"><span className="holiday-national">Nacional</span><span className="holiday-custom">Personalizado</span></div>
    <form className="form holiday-form" onSubmit={save}><h3>Adicionar feriado personalizado</h3><label className="field">Data<Input type="date" required value={date} disabled={saving} onChange={(event) => setDate(event.target.value)} /></label><label className="field">Nome<Input required maxLength={120} value={name} disabled={saving} placeholder="Ex.: Feriado municipal" onChange={(event) => setName(event.target.value)} /></label>{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button type="submit" disabled={saving}>{saving ? "Salvando…" : "Adicionar feriado"}</Button></div></form>
  </Modal>;
}
