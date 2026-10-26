"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { DashboardContent } from "@/components/dashboard-content";
import { KodlandSummary } from "@/components/dashboard-page";
import { ClassesContent } from "@/components/classes-page";
import { LessonsContent } from "@/components/lessons-page";
import { PaymentsContent, type PaymentsAdapter } from "@/components/payments-page";
import { CorrectionsContent } from "@/components/corrections-page";
import { DataContent } from "@/components/data-page";
import { TasksContent } from "@/components/tasks-page";
import { demoTaskBoardStore, resetDemoTaskBoard } from "@/lib/demo-task-board-store";
import type { TaskCard, TaskList } from "@/lib/task-board";
import { SettingsContent } from "@/components/settings-page";
import { ReleaseNotes } from "@/components/release-notes";
import { localReleaseNotesStore } from "@/lib/release-notes-store";
import { ShellFrame } from "@/components/shell";
import { HolidayCalendarDialog } from "@/components/holiday-calendar-dialog";
import { CalendarDays } from "lucide-react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { createDemoSnapshot, demoDashboard, type DemoSnapshot } from "@/lib/demo-snapshot";
import { DEMO_STATE_KEY, restoreDemoState } from "@/lib/demo-storage";
import { createDemoManualAdapter } from "@/lib/demo-manual-adapter";
import type { ManualAdapters } from "@/lib/manual-adapters";
import { pendingManualActivities } from "@/lib/manual-pedagogy";
import { appRoutes } from "@/lib/routes";
import type { DashboardLesson, ExtraLessonPayload, KodlandReview } from "@/lib/api";
import type { CustomHoliday } from "@/lib/holidays";
import "../visitor.css";

type View = "/dashboard" | "/payments" | "/classes" | "/lessons" | "/corrections" | "/settings" | "/data" | "/tasks";

export default function DemoPage() {
  const router = useRouter();
  const [demoLists, setDemoLists] = useState<TaskList[]>([]);
  const [demoTasks, setDemoTasks] = useState<TaskCard[]>([]);
  const [snapshot, setSnapshot] = useState<DemoSnapshot | null>(null);
  const [manualAdapter, setManualAdapter] = useState<ManualAdapters | null>(null);
  const snapshotRef = useRef<DemoSnapshot | null>(null);
  const [view, setView] = useState<View>("/dashboard");
  const [notice, setNotice] = useState("");
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [resource, setResource] = useState("");
  const [review, setReview] = useState<KodlandReview | null>(null);
  const [feedback, setFeedback] = useState("");
  const [holidays, setHolidays] = useState<CustomHoliday[]>([]);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const holidaysRef = useRef<CustomHoliday[]>([]);
  const mutate = useCallback((change: (current: DemoSnapshot) => DemoSnapshot) => {
    if (!snapshotRef.current) return;
    const next = change(snapshotRef.current);
    snapshotRef.current = next;
    setSnapshot(next);
  }, []);
  useEffect(() => {
    const syncView = () => { const href = `/${window.location.hash.slice(1)}`; setView((href === "/data" || appRoutes.some((item) => item.href === href)) ? href as View : "/dashboard"); };
    const timer = window.setTimeout(() => { const seed = createDemoSnapshot(); let state = { snapshot: seed, holidays: [] as CustomHoliday[] }; try { state = restoreDemoState(seed, window.localStorage.getItem(DEMO_STATE_KEY)); } catch { /* Local storage is optional. */ } snapshotRef.current = state.snapshot; holidaysRef.current = state.holidays; setManualAdapter(createDemoManualAdapter(() => { if (!snapshotRef.current) throw new Error("Demonstração ainda não carregada."); return snapshotRef.current; }, mutate)); setSnapshot(state.snapshot); setHolidays(state.holidays); setUpdatedAt(new Date().toISOString()); syncView(); }, 0);
    window.addEventListener("hashchange", syncView);
    return () => { window.clearTimeout(timer); window.removeEventListener("hashchange", syncView); };
  }, [mutate]);
  useEffect(() => { if (!snapshot) return; try { window.localStorage.setItem(DEMO_STATE_KEY, JSON.stringify({ version: 2, snapshot, holidays })); } catch { /* The demo remains functional without storage. */ } }, [snapshot, holidays]);
  useEffect(() => { if (view !== "/data" && view !== "/settings") return; let active = true; void Promise.all([demoTaskBoardStore.list(), demoTaskBoardStore.columns!()]).then(([items, lists]) => { if (active) { setDemoTasks(items); setDemoLists(lists); } }); return () => { active = false; }; }, [view]);
  const navigate = (href: string) => { if (!appRoutes.some((item) => item.href === href)) return; setView(href as View); window.history.replaceState(null, "", `/demo#${href === "/settings#data" ? "data" : href.slice(1)}`); setNotice(""); };
  const update = useCallback(() => {
    const confirmedExtras = new Set(createDemoSnapshot().extras.filter((extra) => extra.completed).map((extra) => extra.id));
    mutate((current) => ({ ...current, extras: current.extras.map((extra) => confirmedExtras.has(extra.id) ? { ...extra, completed: true, manual_status: "DONE" } : extra) }));
    setUpdatedAt(new Date().toISOString());
    setNotice("Atualização simulada concluída. As aulas confirmadas no cenário fictício foram reconciliadas.");
  }, [mutate]);
  const reset = useCallback(() => { resetDemoTaskBoard(); void Promise.all([demoTaskBoardStore.list(), demoTaskBoardStore.columns!()]).then(([items, lists]) => { setDemoTasks(items); setDemoLists(lists); }); const seed = createDemoSnapshot(); snapshotRef.current = seed; setSnapshot(seed); setHolidays([]); holidaysRef.current = []; try { const keys = Object.keys(window.localStorage).filter((key) => key.startsWith("nexusclass.demo.note.")); keys.forEach((key) => window.localStorage.removeItem(key)); } catch { /* Storage is optional. */ } setUpdatedAt(new Date().toISOString()); setNotice("Cenário fictício restaurado."); }, []);
  const interceptMaterial = (event: MouseEvent<HTMLElement>) => { const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[href^='#demo-material']"); if (!link) return; event.preventDefault(); setResource(link.textContent?.trim() || "Material da aula"); };
  const saveExtra = useCallback(async (payload: ExtraLessonPayload) => {
    const date = new Date(`${payload.lesson_date}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + 1, 15);
    const lesson: DashboardLesson = { id: `demo-added-${Date.now()}`, class_id: null, class_name_snapshot: "Aula extra", number: 0, lesson_date: payload.lesson_date, student: payload.student, type: "EXTRA", duration_minutes: payload.duration_minutes, hourly_rate_cents: payload.hourly_rate_cents, period: payload.lesson_date.slice(0, 7), payment_date: date.toISOString().slice(0, 10), value_cents: Math.round(payload.duration_minutes / 60 * payload.hourly_rate_cents), status: "COMPLETED" };
    mutate((current) => ({ ...current, additionalExtras: [...current.additionalExtras, lesson] }));
  }, [mutate]);
  const getDashboard = useCallback(() => demoDashboard(snapshotRef.current!, holidaysRef.current), []);
  const paymentAdapter = useMemo<PaymentsAdapter>(() => ({
    list: async () => ({ items: getDashboard().payments }),
    get: async (date) => { const payment = getDashboard().payments.find((item) => item.payment_date === date); if (!payment) throw new Error("Competência fictícia não encontrada."); return { ...payment, received_at: payment.status === "RECEIVED" ? new Date().toISOString() : null, confirmation_note: null }; },
    updateLessonFinancialStatus: async (date, id, _source, status) => {
      if (getDashboard().payments.find((payment) => payment.payment_date === date)?.status === "RECEIVED") throw new Error("Competências recebidas não podem ter aulas alteradas.");
      mutate((current) => ({ ...current, financialStatus: { ...current.financialStatus, [id]: status } }));
    },
    setStatus: async (date, status) => {
      const payment = status === "RECEIVED" ? getDashboard().payments.find((item) => item.payment_date === date) : null;
      if (status === "RECEIVED" && !payment) throw new Error("Competência fictícia não encontrada.");
      mutate((current) => ({ ...current, paymentStatus: { ...current.paymentStatus, [date]: status }, paymentSnapshots: payment ? { ...current.paymentSnapshots, [date]: { ...payment, status: "RECEIVED" } } : current.paymentSnapshots }));
    },
    reverse: async (date) => mutate((current) => {
      const paymentStatus = { ...current.paymentStatus };
      delete paymentStatus[date];
      const paymentSnapshots = { ...current.paymentSnapshots };
      delete paymentSnapshots[date];
      return { ...current, paymentStatus, paymentSnapshots };
    }),
    confirm: async (date) => {
      const payment = getDashboard().payments.find((item) => item.payment_date === date);
      if (!payment) throw new Error("Competência fictícia não encontrada.");
      mutate((current) => ({ ...current, paymentStatus: { ...current.paymentStatus, [date]: "RECEIVED" }, paymentSnapshots: { ...current.paymentSnapshots, [date]: { ...payment, status: "RECEIVED" } } }));
    },
    createExtra: saveExtra,
  }), [getDashboard, mutate, saveExtra]);
  const holidayActions = useMemo(() => ({ list: async () => holidaysRef.current, save: async ({ date, name }: { date: string; name: string }) => { const saved: CustomHoliday = { id: `demo-holiday-${date}`, date, name, source: "CUSTOM", affects_financial_total: true, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; const next = [...holidaysRef.current.filter((item) => item.date !== date), saved]; holidaysRef.current = next; setHolidays(next); return saved; } }), []);
  const lessonData = useMemo(() => snapshot ? { groups: snapshot.groups, lessons: snapshot.lessons } : undefined, [snapshot]);
  const classData = useMemo(() => snapshot && manualAdapter ? { groups: snapshot.groups, students: snapshot.students, onSync: update, manualAdapter } : undefined, [snapshot, update, manualAdapter]);
  const dashboard = snapshot ? demoDashboard(snapshot, holidays) : null;

  return <div onClick={interceptMaterial}>
    <ShellFrame user={{ id: "demo-profile", name: "Marina", email: "marina@example.test" }} pathname={view === "/data" ? "/settings" : view} routeHref={(href) => `/demo#${href === "/settings#data" ? "data" : href.slice(1)}`} onNavigate={navigate} onLogout={() => router.push("/login")} logoutLabel="Acessar minha conta" headerActions={<><ReleaseNotes userId="demo-profile" store={localReleaseNotesStore} autoShow={false} routeHref={(href) => `/demo#${href === "/settings#data" ? "data" : href.slice(1)}`} /><button className="button button-ghost header-calendar-button" type="button" aria-label="Abrir calendário de feriados" title="Feriados" onClick={() => setCalendarOpen(true)}><CalendarDays size={18} aria-hidden="true" /><span>Feriados</span></button></>} banner={<div className="visitor-demo-banner" role="note"><strong>Demonstração — dados fictícios</strong><span>Explore o NexusClass com ações locais. Nenhuma conta ou plataforma real é acessada.</span></div>}>
    {notice && <div className="visitor-demo-notice" role="status">{notice}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice("")}>×</button></div>}
    {!snapshot || !dashboard || !manualAdapter ? <p className="muted">Carregando demonstração…</p> : <>
      {view === "/dashboard" && <><KodlandSummary {...snapshot} extraLessons={snapshot.extras} customHolidays={holidays} manualClasses={snapshot.manualClasses} manualStudents={snapshot.manualStudents} manualPendingCount={pendingManualActivities(snapshot.manualActivities).length} onRefresh={update} refreshing={false} refreshNotice="" scheduleLastUpdatedAt={updatedAt} onUpdateExtraStatus={async (id, status) => { const item = snapshot.extras.find((extra) => extra.id === id)!; const updated = { ...item, manual_status: status, completed: status === "DONE" }; mutate((current) => ({ ...current, extras: current.extras.map((extra) => extra.id === id ? updated : extra) })); return updated; }} onMaterialsLoaded={() => undefined} demoMode onOpenCorrections={() => navigate("/corrections")} /><DashboardContent state="ready" dashboard={dashboard} storageKey="nexusclass.demo.payments.visible" actions={{ updateLesson: async (date, lesson, status) => { await paymentAdapter.updateLessonFinancialStatus(date, lesson.id, lesson.financial_source_id, status); }, createExtra: saveExtra, setPaymentStatus: async (date, status) => { await paymentAdapter.setStatus(date, status); } }} /></>}
      {view === "/payments" && <PaymentsContent adapter={paymentAdapter} />}
      {view === "/classes" && <ClassesContent demo={classData} />}
      {view === "/lessons" && <LessonsContent demoData={lessonData} manualAdapter={manualAdapter} onDemoAction={() => setResource("Importar curso")} />}
      {view === "/corrections" && <CorrectionsContent preferenceKey="demo" demo={{ reviews: snapshot.reviews, lessons: snapshot.lessons, attendance: snapshot.attendance, students: snapshot.students, groups: snapshot.groups, manualActivities: snapshot.manualActivities, manualClasses: snapshot.manualClasses, manualStudents: snapshot.manualStudents, manualAdapter, onSaveManualActivity: (item) => manualAdapter.pedagogy.saveActivity(item), onSync: update, onCorrect: (item) => { setReview(item); setFeedback(""); }, onMaterial: () => setResource("Materiais da aula") }} />}
      {view === "/tasks" && <TasksContent store={demoTaskBoardStore} />}

      {(view === "/settings" || view === "/data") && <SettingsContent key={view} adapter={manualAdapter} initialSection={view === "/data" ? "data" : undefined} dataContent={<DataContent demo={{ snapshot: { ...snapshot, task_cards: demoTasks, task_settings: [{ id: "lists", lists: demoLists }] } as unknown as Record<string, unknown>, csvAdapter: manualAdapter, kodlandEnabled: snapshot.tutorPreferences.kodland_enabled, onSync: update, onReset: reset, onNotice: setNotice }} />} />}
    </>}
    </ShellFrame>
    <Modal open={Boolean(resource)} title={resource} onClose={() => setResource("")} className="visitor-demo-modal"><p className="muted">Conteúdo fictício da demonstração. Na sua conta, este atalho abre o material correspondente na plataforma.</p><section className="lesson-material-section"><h3>Preparando a aula</h3><ol><li>Revisar o desafio da aula anterior.</li><li>Apresentar o conceito com um exemplo guiado.</li><li>Construir o projeto com os alunos.</li><li>Reservar tempo para dúvidas e atividade individual.</li></ol></section></Modal>
    <Modal open={Boolean(review)} title={review ? `Correção · ${review.student_name}` : "Correção"} onClose={() => setReview(null)} className="visitor-demo-modal">{review && <form className="form-stack" onSubmit={(event) => { event.preventDefault(); mutate((current) => ({ ...current, reviews: current.reviews.filter((item) => item.id !== review.id) })); setReview(null); setNotice("Correção simulada concluída. A pendência foi removida apenas deste cenário."); }}><p><strong>{review.lesson_title}</strong></p><p>{review.task_title}</p><section className="lesson-material-section"><h3>Entrega fictícia</h3><p>O aluno criou um projeto com as etapas da atividade e incluiu uma solução própria para o desafio.</p></section><label className="field">Feedback<textarea className="input" rows={4} value={feedback} onChange={(event) => setFeedback(event.target.value)} required placeholder="Escreva uma orientação para o aluno…" /></label><div className="form-actions"><button className="button button-primary" type="submit">Concluir correção simulada</button></div></form>}</Modal>
    <HolidayCalendarDialog open={calendarOpen} onClose={() => setCalendarOpen(false)} actions={holidayActions} />
  </div>;
}
