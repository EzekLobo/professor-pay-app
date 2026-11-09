"use client";
import { kodlandReadPreference } from "@/lib/kodland-read-preference";
import { readWithDeadline } from "@/lib/read-deadline";
import { CorrectionsContent } from "./corrections-page";

import { useCallback, useEffect, useRef, useState } from "react";
import { MoreVertical, RefreshCw, Settings, Trash2 } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui";
import { ManualClassesPanel } from "@/components/manual-classes-panel";
import type { ManualAdapters } from "@/lib/manual-adapters";
import {
  ApiError,
  kodlandClassSettingsApi,
  kodlandApi,
  tutorPreferencesApi,
  type KodlandGroup,
  type KodlandStudent,
} from "@/lib/api";
import type { KodlandClassSettings } from "@/lib/manual-teaching";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import { whatsappUrl } from "@/lib/whatsapp";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import {
  activeStudentsRankedByPoints,
  kodlandStudentPoints,
} from "@/lib/student-ranking";

const parseMoney = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
};
const HIDDEN_KODLAND_GROUPS_KEY = "nexusclass.hidden-kodland-groups";
const KODLAND_GROUP_NAMES_KEY = "nexusclass.kodland-group-names";
const KODLAND_GROUP_LABEL_KEY = "nexusclass.kodland-group-label";
const readHiddenKodlandGroups = () => {
  if (typeof window === "undefined") return [] as string[];
  try {
    const value = JSON.parse(window.localStorage.getItem(HIDDEN_KODLAND_GROUPS_KEY) ?? "[]");
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};
const readKodlandGroupNames = () => {
  if (typeof window === "undefined") return {} as Record<string, string>;
  try {
    const value = JSON.parse(window.localStorage.getItem(KODLAND_GROUP_NAMES_KEY) ?? "{}");
    return value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim().length > 0))
      : {};
  } catch {
    return {};
  }
};
const readKodlandGroupLabel = () => {
  if (typeof window === "undefined") return "Turmas Kodland";
  try {
    return window.localStorage.getItem(KODLAND_GROUP_LABEL_KEY)?.trim() || "Turmas Kodland";
  } catch {
    return "Turmas Kodland";
  }
};
export function GroupAccordion({
  group,
  students,
  openByDefault,
  onDelete,
  onRename,
}: {
  group: KodlandGroup;
  students: KodlandStudent[];
  openByDefault: boolean;
  onDelete?: () => void;
  onRename?: (name: string) => void;
}) {
  const [selectedStudent, setSelectedStudent] = useState<KodlandStudent | null>(
    null,
  );
  const contact = selectedStudent?.phone;
  const contactLabel = "WhatsApp aluno";
  const contactHref = selectedStudent
    ? whatsappUrl(contact ?? "", `Olá! Sou o professor de ${selectedStudent.name}.`)
    : "";
  const activeStudents = activeStudentsRankedByPoints(students);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(group.title);

  const startRename = () => {
    setNameInput(group.title);
    setEditingName(true);
    setMenuOpen(true);
  };

  return (
    <>
      <details className={`group-accordion${onDelete ? " group-has-actions" : ""}`} open={openByDefault}>
        <summary className="group-accordion-summary">
          <span className="group-summary-copy">
            <strong>{group.title}</strong>
            <span className="group-course-name">
              Curso: {group.course_name || "Não informado"}
            </span>
          </span>
          <span className="group-summary-meta">
            {(onDelete || onRename) && <button className="group-menu-button" type="button" aria-label={`Ações da turma ${group.title}`} title="Ações da turma" onClick={(event) => { event.preventDefault(); event.stopPropagation(); setMenuOpen((open) => !open); }}><MoreVertical size={18} aria-hidden="true" /></button>}
          </span>
          {menuOpen && <div className="group-actions-menu" role="menu" onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}>
            {!editingName ? <>
              {onRename && <button type="button" role="menuitem" onClick={startRename}><Settings size={15} aria-hidden="true" /> Editar nome</button>}
              {onDelete && <button className="group-actions-menu-danger" type="button" role="menuitem" onClick={() => { setMenuOpen(false); onDelete(); }}><Trash2 size={15} aria-hidden="true" /> Excluir</button>}
            </> : <div className="group-rename-form">
              <label><span className="sr-only">Novo nome da turma</span><input className="input" autoFocus value={nameInput} onChange={(event) => setNameInput(event.target.value)} /></label>
              <div><button className="button button-ghost button-small" type="button" onClick={() => setEditingName(false)}>Cancelar</button><button className="button button-small" type="button" disabled={!nameInput.trim()} onClick={() => { onRename?.(nameInput.trim()); setEditingName(false); setMenuOpen(false); }}>Salvar</button></div>
            </div>}
          </div>}
        </summary>
        <div className="group-accordion-body">
          {activeStudents.length === 0 ? (
            <p className="muted">Nenhum aluno ativo sincronizado nesta turma.</p>
          ) : (
            <div className="student-list">
              {activeStudents.map((student, index) => (
                <button
                  className="student-row student-row-button"
                  type="button"
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                >
                  <span className="student-row-rank">{index + 1}º</span>
                  <strong>{student.name}</strong>
                  <span className="student-row-points">
                    {new Intl.NumberFormat("pt-BR").format(
                      kodlandStudentPoints(student.progress_summary),
                    )} pts
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </details>
      <Modal
        open={Boolean(selectedStudent)}
        title={selectedStudent?.name ?? "Aluno"}
        onClose={() => setSelectedStudent(null)}
      >
        {selectedStudent && (
          <div className="student-profile">
            <dl>
              <div>
                <dt>Status</dt>
                <dd>{selectedStudent.status || "Não informado"}</dd>
              </div>
              {selectedStudent.progress_summary && (
                <div>
                  <dt>Progresso</dt>
                  <dd>{selectedStudent.progress_summary}</dd>
                </div>
              )}
              {selectedStudent.phone && (
                <div>
                  <dt>Telefone</dt>
                  <dd>{selectedStudent.phone}</dd>
                </div>
              )}
            </dl>
            <div className="card-actions">
              {contactHref && (
                <a
                  className="button button-ghost button-small"
                  href={contactHref}
                  target="_blank"
                  rel="noreferrer"
                >
                  {contactLabel}
                </a>
              )}
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

export function ClassesContent({ demo }: { demo?: { groups: KodlandGroup[]; students: KodlandStudent[]; onSync: () => void; manualAdapter?: ManualAdapters } } = {}) {
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [, setStudents] = useState<KodlandStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsByGroup, setSettingsByGroup] = useState<Record<string, KodlandClassSettings>>({});
  const [selectedGroup, setSelectedGroup] = useState<KodlandGroup | null>(null);
  const [hiddenKodlandGroups, setHiddenKodlandGroups] = useState<string[]>(readHiddenKodlandGroups);
  const [kodlandGroupNames] = useState<Record<string, string>>(readKodlandGroupNames);
  const [kodlandGroupLabel, setKodlandGroupLabel] = useState(readKodlandGroupLabel);
  const [kodlandGroupLabelInput, setKodlandGroupLabelInput] = useState(readKodlandGroupLabel);
  const [rateInput, setRateInput] = useState("");
  const [paymentDay, setPaymentDay] = useState(15);
  const [savingSettings, setSavingSettings] = useState(false);
  const [kodlandEnabled, setKodlandEnabled] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const loadGeneration = useRef(0);
  const load = useCallback(async () => {
    const run = ++loadGeneration.current;
    setLoading(true); setError("");
    try {
      const result = await readWithDeadline(async () => {
        const settingsApi = demo?.manualAdapter?.kodland ?? kodlandClassSettingsApi;
        const preferencesApi = demo?.manualAdapter?.preferences ?? tutorPreferencesApi;
        const localOnly = !demo && Boolean((await kodlandApi.browserState())?.active);
        const preferences = await kodlandReadPreference(() => preferencesApi.get(), localOnly);
        if (!preferences.kodland_enabled) return { enabled: false, groups: [], students: [], settings: null };
        const [groups, students, settings] = await Promise.all([
          demo ? Promise.resolve(demo.groups) : kodlandApi.groups().then(value => value.items),
          demo ? Promise.resolve(demo.students) : kodlandApi.students().then(value => value.items),
          localOnly ? Promise.resolve(null) : settingsApi.list(),
        ]);
        return { enabled: true, groups, students, settings };
      }, "Turmas");
      if (run !== loadGeneration.current) return;
      setKodlandEnabled(result.enabled);
      setGroups(result.groups.filter(group => !hiddenKodlandGroups.includes(group.external_id)).map(group => ({ ...group, title: kodlandGroupNames[group.external_id] || group.title })));
      setStudents(result.students);
      if (result.settings) setSettingsByGroup(Object.fromEntries(result.settings.map(item => [item.id, item])));
    } catch (reason) {
      if (run === loadGeneration.current) setError(reason instanceof Error ? reason.message : "Não foi possível carregar as turmas.");
    } finally { if (run === loadGeneration.current) setLoading(false); }
  }, [demo, hiddenKodlandGroups, kodlandGroupNames]);

  useEffect(() => {
    const generation = loadGeneration;
    const timer = window.setTimeout(() => void load(), 0);
    const onSync = (event: Event) => {
      const mode = (event as CustomEvent<{ mode?: string }>).detail?.mode;
      if (mode === "essential" || mode === "schedule") void load();
    };
    window.addEventListener("nexusclass:kodland-synced", onSync);
    return () => { generation.current++; window.clearTimeout(timer); window.removeEventListener("nexusclass:kodland-synced", onSync); };
  }, [load]);

  async function syncClasses() {
    if (syncing) return;
    if (demo) { demo.onSync(); setNotice("Turmas atualizadas na demonstração."); return; }
    const credentials = await restoreKodlandCredentials();
    if (!credentials) {
      setError("Salve as credenciais em Dados e backup antes de atualizar as turmas.");
      return;
    }
    setSyncing(true);
    setError("");
    try {
      const result = await kodlandApi.sync(
        credentials.username.trim(),
        credentials.password,
        "essential",
      );
      setNotice(
        `${result.group_count} turma(s) e ${result.student_count} aluno(s) atualizado(s). ${result.extra_lesson_count ?? 0} aula(s) extra encontrada(s) na agenda.`,
      );
      await load();
    } catch (reason) {
      setError(
        reason instanceof ApiError || reason instanceof KodlandSyncResponseError || reason instanceof KodlandSyncPersistenceError
          ? reason.message
          : "Não foi possível sincronizar os dados.",
      );
    } finally {
      setSyncing(false);
    }
  }

  const openGroupSettings = (group: KodlandGroup) => {
    const current = settingsByGroup[group.external_id];
    setSelectedGroup(group);
    setRateInput(current?.rate_history.at(-1)?.hourly_rate_cents == null ? "" : String((current.rate_history.at(-1)!.hourly_rate_cents ?? 0) / 100).replace(".", ","));
    setPaymentDay(current?.payment_day ?? 15);
    setKodlandGroupLabelInput(kodlandGroupLabel);
    setError("");
  };

  async function saveGroupSettings() {
    if (!selectedGroup) return;
    setSavingSettings(true); setError("");
    try {
      const settingsApi = demo?.manualAdapter?.kodland ?? kodlandClassSettingsApi;
      const input = { hourly_rate_cents: parseMoney(rateInput), payment_day: paymentDay };
      await Promise.all(groups.map((group) => settingsApi.save(group.external_id, input)));
      const nextLabel = kodlandGroupLabelInput.trim() || "Turmas Kodland";
      window.localStorage.setItem(KODLAND_GROUP_LABEL_KEY, nextLabel);
      setKodlandGroupLabel(nextLabel);
      setSelectedGroup(null);
      setNotice("Configuração aplicada a todas as turmas Kodland.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a configuração da turma.");
    } finally { setSavingSettings(false); }
  }

  const deleteKodlandCollection = () => {
    if (!groups.length) {
      setError("Nenhuma turma Kodland disponível para excluir.");
      return;
    }
    if (!window.confirm(`Excluir o grupo ${kodlandGroupLabel}? Todas as turmas Kodland ficarão ocultas neste navegador.`)) return;
    const next = [...new Set([...hiddenKodlandGroups, ...groups.map((group) => group.external_id)])];
    window.localStorage.setItem(HIDDEN_KODLAND_GROUPS_KEY, JSON.stringify(next));
    setHiddenKodlandGroups(next);
    setGroups([]);
    setNotice("Grupo Kodland excluído da visualização.");
  };

  return (
    <div className="management-grid classes-management-grid">
      {error && <div role="alert"><p className="form-error">{error}</p><Button type="button" className="button-ghost" onClick={() => void load()}>Tentar novamente</Button></div>}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <ManualClassesPanel actionsOnly adapter={demo?.manualAdapter} hasKodlandGroups={groups.length > 0} kodlandLoading={loading} />
      {kodlandEnabled && <section className="panel pedagogical-panel page-fill-panel" data-tour="classes-list">
        <div className="section-heading classes-compact-heading">
          <h2>{kodlandGroupLabel}</h2>
          <div className="card-actions">
            <Button className="button-ghost sync-icon-button" type="button" data-tour="classes-sync" aria-label="Atualizar turmas" title={syncing ? "Atualizando turmas" : "Atualizar turmas"} aria-busy={syncing} onClick={() => void syncClasses()} disabled={syncing}>
              <RefreshCw size={18} aria-hidden="true" className={syncing ? "sync-icon-spinning" : undefined} />
            </Button>
            <Button className="button-ghost sync-icon-button" type="button" aria-label="Configurar grupos Kodland" title="Configurar grupos Kodland" onClick={() => groups[0] ? openGroupSettings(groups[0]) : setError("Nenhuma turma Kodland disponível para configurar.")}>
              <Settings size={18} aria-hidden="true" />
            </Button>
            <Button className="button-ghost sync-icon-button group-header-trash-button" type="button" aria-label={`Excluir grupo ${kodlandGroupLabel}`} title="Excluir grupo" onClick={deleteKodlandCollection}>
              <Trash2 size={18} aria-hidden="true" />
            </Button>
          </div>
        </div>

      </section>}
      <Modal open={Boolean(selectedGroup)} title={`Configurar ${kodlandGroupLabel}`} onClose={() => setSelectedGroup(null)}>
        {selectedGroup && <form className="management-form kodland-settings-form" onSubmit={(event) => { event.preventDefault(); void saveGroupSettings(); }}>
          <p className="muted kodland-settings-form-help">Uma única configuração será aplicada a todas as turmas Kodland sincronizadas.</p>
          <label className="kodland-group-name-field">Nome do grupo<input className="input" value={kodlandGroupLabelInput} onChange={(event) => setKodlandGroupLabelInput(event.target.value)} placeholder="Turmas Kodland" /></label>
          <label>Tarifa específica (R$/h)<input className="input" inputMode="decimal" value={rateInput} onChange={(event) => setRateInput(event.target.value)} placeholder="Deixe vazio para usar o padrão" /></label>
          <label>Dia do recebimento<input className="input" type="number" min="1" max="31" value={paymentDay} onChange={(event) => setPaymentDay(Number(event.target.value))} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button" disabled={savingSettings} type="submit">Salvar</button>
        </form>}
      </Modal>
    </div>
  );
}

export default function ClassesPage() {
  return (
    <AuthGuard>
      {(user) => (
        <Shell user={user}>
          <CorrectionsContent preferenceKey={user.id} classesContent={<ClassesContent />} />
        </Shell>
      )}
    </AuthGuard>
  );
}
