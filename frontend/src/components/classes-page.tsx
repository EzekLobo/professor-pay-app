"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
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

const absoluteUrl = (value: string) =>
  value.startsWith("/") ? `https://bo.kodland.org${value}` : value;
const moneyText = (cents: number | null | undefined) => cents == null ? "Valor padrão" : `R$ ${(cents / 100).toFixed(2)}/h`;
const parseMoney = (value: string) => {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? Math.round(amount * 100) : NaN;
};
export function GroupAccordion({
  group,
  students,
  openByDefault,
  financeLabel,
  onConfigure,
}: {
  group: KodlandGroup;
  students: KodlandStudent[];
  openByDefault: boolean;
  financeLabel?: string;
  onConfigure?: () => void;
}) {
  const [selectedStudent, setSelectedStudent] = useState<KodlandStudent | null>(
    null,
  );
  const contact = selectedStudent?.guardian_phone || selectedStudent?.phone;
  const contactLabel = selectedStudent?.guardian_phone
    ? "WhatsApp responsável"
    : "WhatsApp aluno";
  const contactHref = selectedStudent
    ? whatsappUrl(contact ?? "", `Olá! Sou o professor de ${selectedStudent.name}.`)
    : "";
  const activeStudents = activeStudentsRankedByPoints(students);

  return (
    <>
      <details className="group-accordion" open={openByDefault}>
        <summary className="group-accordion-summary">
          <span className="group-summary-copy">
            <strong>{group.title}</strong>
            <span className="group-course-name">
              Curso: {group.course_name || "Não informado"}
            </span>
          </span>
          <span className="group-student-count">
            {activeStudents.length} aluno{activeStudents.length === 1 ? "" : "s"}
          </span>
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
          {onConfigure && <div className="class-finance-actions">
            <span className="muted">{financeLabel}</span>
            <button className="button button-ghost button-small" type="button" onClick={onConfigure}>Configurar turma</button>
          </div>}
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
              {selectedStudent.guardian_name && (
                <div>
                  <dt>Responsável</dt>
                  <dd>
                    {selectedStudent.guardian_name}
                    {selectedStudent.guardian_relationship
                      ? ` (${selectedStudent.guardian_relationship})`
                      : ""}
                  </dd>
                </div>
              )}
              {selectedStudent.guardian_phone && (
                <div>
                  <dt>Telefone do responsável</dt>
                  <dd>{selectedStudent.guardian_phone}</dd>
                </div>
              )}
              {selectedStudent.guardian_email && (
                <div>
                  <dt>E-mail do responsável</dt>
                  <dd>{selectedStudent.guardian_email}</dd>
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
              {selectedStudent.profile_url && (
                <a
                  className="button button-ghost button-small"
                  href={absoluteUrl(selectedStudent.profile_url)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Perfil
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
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [settingsByGroup, setSettingsByGroup] = useState<Record<string, KodlandClassSettings>>({});
  const [selectedGroup, setSelectedGroup] = useState<KodlandGroup | null>(null);
  const [rateInput, setRateInput] = useState("");
  const [paymentDay, setPaymentDay] = useState(15);
  const [savingSettings, setSavingSettings] = useState(false);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const settingsApi = demo?.manualAdapter?.kodland ?? kodlandClassSettingsApi;
    if (demo) {
      const currentSettings = await settingsApi.list();
      setGroups(demo.groups); setStudents(demo.students);
      setSettingsByGroup(Object.fromEntries(currentSettings.map((item) => [item.id, item])));
      setLoading(false); return;
    }
    try {
      const [groupResult, studentResult, currentSettings] = await Promise.all([
        kodlandApi.groups(),
        kodlandApi.students(),
        settingsApi.list(),
      ]);
      setGroups(groupResult.items);
      setStudents(studentResult.items);
      setSettingsByGroup(Object.fromEntries(currentSettings.map((item) => [item.id, item])));
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar as turmas.",
      );
    } finally {
      setLoading(false);
    }
  }, [demo]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
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
        `${result.extra_lesson_count ?? 0} aula(s) extra encontrada(s) na agenda da Kodland. Apenas as concluídas entram em Pagamentos.`,
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
    setError("");
  };

  async function saveGroupSettings() {
    if (!selectedGroup) return;
    setSavingSettings(true); setError("");
    try {
      const settingsApi = demo?.manualAdapter?.kodland ?? kodlandClassSettingsApi;
      await settingsApi.save(selectedGroup.external_id, { hourly_rate_cents: parseMoney(rateInput), payment_day: paymentDay });
      setSelectedGroup(null);
      setNotice("Configuração da turma salva para as próximas aulas.");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível salvar a configuração da turma.");
    } finally { setSavingSettings(false); }
  }

  return (
    <div className="management-grid">
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <ManualClassesPanel adapter={demo?.manualAdapter} />
      <section className="panel pedagogical-panel">
        <div className="section-heading classes-compact-heading">
          <h2>Turmas Kodland</h2>
          <div className="card-actions">
            <Button className="button-ghost sync-icon-button" type="button" data-tour="classes-sync" aria-label="Atualizar turmas" title={syncing ? "Atualizando turmas" : "Atualizar turmas"} aria-busy={syncing} onClick={() => void syncClasses()} disabled={syncing}>
              <RefreshCw size={18} aria-hidden="true" className={syncing ? "sync-icon-spinning" : undefined} />
            </Button>
          </div>
        </div>
        {loading ? (
          <p className="muted">Carregando turmas…</p>
        ) : groups.length === 0 ? (
          <p className="muted">
            Nenhuma turma sincronizada. Use o ícone de sincronização para importar
            suas turmas.
          </p>
        ) : (
          <div className="accordion-list" data-tour="classes-list">
            {groups.map((group) => (
              <GroupAccordion
                key={group.id}
                group={group}
                students={students.filter(
                  (student) => student.external_class_id === group.external_id,
                )}
                openByDefault={false}
                financeLabel={`${moneyText(settingsByGroup[group.external_id]?.rate_history.at(-1)?.hourly_rate_cents)} · Recebimento dia ${settingsByGroup[group.external_id]?.payment_day ?? 15}`}
                onConfigure={() => openGroupSettings(group)}
              />
            ))}
          </div>
        )}
      </section>
      <Modal open={Boolean(selectedGroup)} title={selectedGroup ? `Configurar · ${selectedGroup.title}` : "Configurar turma"} onClose={() => setSelectedGroup(null)}>
        {selectedGroup && <form className="management-form" onSubmit={(event) => { event.preventDefault(); void saveGroupSettings(); }}>
          <label>Tarifa específica (R$/h)<input className="input" inputMode="decimal" value={rateInput} onChange={(event) => setRateInput(event.target.value)} placeholder="Deixe vazio para usar o padrão" /></label>
          <label>Dia do recebimento<input className="input" type="number" min="1" max="31" value={paymentDay} onChange={(event) => setPaymentDay(Number(event.target.value))} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="button" disabled={savingSettings} type="submit">Salvar configuração</button>
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
          <ClassesContent />
        </Shell>
      )}
    </AuthGuard>
  );
}
