"use client";
import { pauseKodlandAutoSync } from "@/lib/kodland-sync-lock";
import { reportOperation } from "@/lib/operation-log-client";
import { watchKodlandSync, KodlandSyncWaitError } from "@/lib/kodland-sync-client";

import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import { Database, Download, RefreshCw, Upload } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Modal } from "@/components/modal";
import { ManualCsvPanel } from "@/components/manual-csv-panel";
import { Shell } from "@/components/shell";
import { Button, Input } from "@/components/ui";
import {
  ApiError,
  dataApi,
  kodlandApi,
  tutorPreferencesApi,
  type ImportReport,
} from "@/lib/api";
import {
  rememberKodlandCredentials,
  restoreKodlandCredentials,
} from "@/lib/browser-credentials";
import { formatMoney } from "@/lib/finance";
import type { ManualAdapters } from "@/lib/manual-adapters";
import { getFirebaseAuth } from "@/lib/firebase";
import {
  KodlandSyncPersistenceError,
  KodlandSyncResponseError,
} from "@/lib/kodland-sync-response";

const summary = (report: ImportReport) =>
  `${report.class_count} turmas legadas, ${report.lesson_count} aulas financeiras, ${report.payment_confirmation_count} confirmações (${formatMoney(report.total_cents)}), ${report.pedagogical_group_count} turmas e ${report.pedagogical_student_count} alunos Kodland, ${report.manual_class_count ?? 0} turmas próprias, ${report.manual_student_count ?? 0} alunos próprios, ${report.manual_course_count ?? 0} cursos, ${report.manual_occurrence_count ?? 0} ocorrências, ${report.manual_attendance_count ?? 0} presenças, ${report.manual_lesson_count ?? 0} conteúdos, ${report.manual_activity_count ?? 0} atividades, ${report.payroll_period_count ?? 0} folhas oficiais e ${report.task_card_count ?? 0} tarefas pessoais`;

export interface DataDemoAdapter {
  csvAdapter?: ManualAdapters;
  snapshot: object;
  onSync: () => void | Promise<void>;
  onReset: () => void;
  onNotice?: (message: string) => void;
  kodlandEnabled?: boolean;
}

export function DataContent({ demo }: { demo?: DataDemoAdapter }) {
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [confirmation, setConfirmation] = useState<"import" | "reset" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncProgress, setSyncProgress] = useState("");
  const [syncUsername, setSyncUsername] = useState("");
  const [syncPassword, setSyncPassword] = useState("");
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [storedKodlandEnabled, setStoredKodlandEnabled] = useState(false);
  const kodlandEnabled = demo ? demo.kodlandEnabled === true : storedKodlandEnabled;
  useEffect(() => {
    if (demo || !syncOpen) return;
    const uid = getFirebaseAuth().currentUser?.uid;
    if (uid) return pauseKodlandAutoSync(uid);
  }, [demo, syncOpen]);

  useEffect(() => {
    if (demo) return;
    void tutorPreferencesApi.get().then((preferences) => setStoredKodlandEnabled(preferences.kodland_enabled)).catch(() => setStoredKodlandEnabled(false));
  }, [demo]);

  const message = (reason: unknown) =>
    setError(
      reason instanceof Error
        ? reason.message
        : "Não foi possível concluir a operação.",
    );

  function openSync() {
    setError("");
    setSyncError("");
    setSyncProgress("");
    setSyncOpen(true);
    if (demo) return;
    void restoreKodlandCredentials().then((credentials) => {
      if (!credentials) return;
      setSyncUsername((current) => current || credentials.username);
      setSyncPassword((current) => current || credentials.password);
    });
  }

  async function synchronize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) {
      if (busy) return;
      setBusy(true);
      try {
        await demo.onSync();
        setSyncOpen(false);
        setNotice("Sincronização simulada com dados fictícios. Nenhuma conexão com a Kodland foi feita.");
      } catch (reason) {
        setSyncError(reason instanceof Error ? reason.message : "Não foi possível atualizar a demonstração.");
      } finally {
        setBusy(false);
      }
      return;
    }
    const form = event.currentTarget;
    const ownerId = getFirebaseAuth().currentUser?.uid;
    const username = syncUsername.trim();
    if (busy || !username || !syncPassword) return;

    setBusy(true);
    setSyncError("");
    setSyncProgress("");
    try {
      let savedInBrowser = false;
      const result = await watchKodlandSync((report, assertActive) => kodlandApi.syncAll(username, syncPassword, report, { assertActive }), setSyncProgress);
      if (saveCredentials) {
        try {
          if (!ownerId || getFirebaseAuth().currentUser?.uid !== ownerId) throw new Error("A conta conectada mudou durante a sincronização.");
          setSyncProgress("Dados sincronizados. Salvando acesso neste navegador…");
          savedInBrowser = await watchKodlandSync(() => rememberKodlandCredentials({ username, password: syncPassword }, form), () => {}, 10_000);
        } catch {
          // Browser password storage is optional and controlled by the browser.
        }
      }
      setSyncPassword("");
      setSyncOpen(false);
      if (result.payroll_warning) setError(`Aulas e turmas sincronizadas. Folha oficial: ${result.payroll_warning}`);
      setNotice(
        `Sincronização concluída: ${result.group_count} turma(s), ${result.student_count} aluno(s), ${result.lesson_count} aula(s), ${result.extra_lesson_count} extra(s) e ${result.review_count} correção(ões).${saveCredentials ? savedInBrowser ? " Credenciais salvas neste navegador." : " O navegador não permitiu salvar as credenciais." : ""}`,
      );
    } catch (reason) {
      if (reason instanceof KodlandSyncWaitError) reportOperation("kodland_sync", "warning", { scope: "complete", trigger: "manual", errorCode: "timeout", reference: reason.syncId });
      setSyncError(
        reason instanceof KodlandSyncWaitError ||
          reason instanceof ApiError ||
          reason instanceof KodlandSyncResponseError ||
          reason instanceof KodlandSyncPersistenceError
          ? reason.message
          : "Não foi possível sincronizar os dados da Kodland.",
      );
    } finally {
      setBusy(false);
      setSyncProgress("");
    }
  }

  async function download() {
    if (busy) return;
    setBusy(true);
    try {
      const data = demo
        ? { ...demo.snapshot, exported_at: new Date().toISOString(), demonstration: true }
        : await dataApi.export();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${demo ? "nexusclass-demo" : "aulapay-backup"}-${data.exported_at.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice(demo ? "Backup demonstrativo baixado: contém apenas dados fictícios." : "Backup baixado.");
    } catch (reason) {
      message(reason);
    } finally {
      setBusy(false);
    }
  }

  function file(event: ChangeEvent<HTMLInputElement>) {
    if (demo) {
      setNotice("Importação indisponível na demonstração: seus arquivos pessoais não serão lidos.");
      return;
    }
    const selected = event.target.files?.[0];
    if (!selected) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const value: unknown = JSON.parse(String(reader.result));
        if (!value || typeof value !== "object" || Array.isArray(value)) {
          throw new Error("Invalid backup");
        }
        setPayload(value as Record<string, unknown>);
        setPreview(null);
        setReport(null);
        setNotice("Arquivo carregado. Gere a prévia antes de importar.");
      } catch {
        setError("O arquivo não contém um JSON válido.");
      }
    };
    reader.readAsText(selected, "UTF-8");
  }

  async function check() {
    if (demo) return;
    if (!payload || busy) return;
    setBusy(true);
    try {
      setPreview(await dataApi.previewImport(payload));
    } catch (reason) {
      message(reason);
    } finally {
      setBusy(false);
    }
  }

  async function importIt() {
    if (demo) return;
    if (!payload || !preview || busy) {
      return;
    }
    setBusy(true);
    try {
      const result = await dataApi.import(payload);
      setReport(result);
      setPreview(null);
      setPayload(null);
      setNotice(
        result.already_imported
          ? "Esta exportação já havia sido importada."
          : "Dados importados com sucesso.",
      );
    } catch (reason) {
      message(reason);
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (demo) {
      if (busy || phrase !== "RESETAR") return;
      demo.onReset();
      setPhrase("");
      setPassword("");
      setNotice("Demonstração restaurada. Nenhum dado de uma conta real foi alterado.");
      return;
    }
    if (
      phrase !== "RESETAR" ||
      !password ||
      busy
    ) {
      return;
    }
    setConfirmation("reset");
  }

  async function performReset() {
    if (demo || phrase !== "RESETAR" || !password || busy) return;
    setBusy(true);
    try {
      await dataApi.reset(password);
      setPhrase("");
      setPassword("");
      setNotice("Dados apagados.");
    } catch (reason) {
      message(reason);
      throw reason;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-grid page-fill-grid data-page">
      <ConfirmDialog open={confirmation !== null} title={confirmation === "reset" ? "Apagar dados" : "Importar backup"} confirmLabel={confirmation === "reset" ? "Apagar permanentemente" : "Importar dados"} danger={confirmation === "reset"} onClose={() => setConfirmation(null)} onConfirm={confirmation === "reset" ? performReset : importIt}><p>{confirmation === "reset" ? "Todos os dados da sua conta serão apagados permanentemente. Esta ação não pode ser desfeita." : "Importar os dados deste backup para sua conta? Confira a prévia antes de continuar."}</p></ConfirmDialog>
      {kodlandEnabled && <Modal
        open={syncOpen}
        title="Sincronizar aplicação"
        className="schedule-sync-modal"
        onClose={() => !busy && setSyncOpen(false)}
      >
        <form id="kodland-sync" name="kodland-sync" className="form management-form" autoComplete="off" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" onSubmit={synchronize}>
          <p className="muted">
            Atualiza turmas, alunos, aulas, presença, materiais e pagamentos.
          </p>
          {demo ? <p className="notice">Na demonstração, esta operação utiliza apenas dados fictícios e não solicita credenciais.</p> : <><label className="field">
            Usuário ou e-mail
            <Input
              id="kodland-sync-username"
              name="kodland_sync_username"
              type="text"
              required
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              readOnly={busy}
              value={syncUsername}
              onChange={(event) => setSyncUsername(event.target.value)}
            />
          </label>
          <label className="field">
            Senha
            <Input
              id="kodland-sync-password"
              name="kodland_sync_password"
              type="password"
              required
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              data-bwignore="true"
              readOnly={busy}
              value={syncPassword}
              onChange={(event) => setSyncPassword(event.target.value)}
            />
          </label>
          <label className="sync-remember">
            <input
              name="save_credentials"
              type="checkbox"
              checked={saveCredentials}
              disabled={busy}
              onChange={(event) => setSaveCredentials(event.target.checked)}
            />
            <span>Salvar credenciais da Kodland neste navegador</span>
          </label>
          </>}
          {!demo && <p className="muted sync-auto-pause">A atualização automática aguarda enquanto você usa esta janela.</p>}
          {syncProgress && <p className="sync-progress" role="status" aria-live="polite">{syncProgress}</p>}
          {syncError && <p className="form-error" role="alert">{syncError}</p>}
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              {busy ? "Sincronizando…" : "Sincronizar tudo"}
            </Button>
          </div>
        </form>
      </Modal>}

      <section className="page-heading">
        <p className="eyebrow">Privacidade e backup</p>
        <h1>Dados e backup</h1>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {kodlandEnabled && <section className="panel data-sync-card" data-tour="data-sync">
        <div className="data-section-copy">
          <h2><RefreshCw size={19} aria-hidden="true" /> Sincronização Kodland</h2>
        </div>
        <Button type="button" disabled={busy} onClick={openSync}>
          Sincronizar tudo
        </Button>
      </section>}

      <section className="panel data-backup-card" aria-label="Backup completo">
        <div className="data-backup-heading">
          <div>
            <h2><Database size={19} aria-hidden="true" /> Backup completo</h2>
            <p className="muted">Salve ou restaure os dados da conta.</p>
          </div>
        </div>
        <div className="data-backup-actions">
          <section className="data-backup-action" data-tour="data-export">
            <div>
              <h3>Salvar cópia</h3>
            </div>
            <Button className="button-ghost" disabled={busy} onClick={() => void download()}>
              <Download size={16} aria-hidden="true" />{busy ? "Preparando…" : "Baixar JSON"}
            </Button>
          </section>
          <section className="data-backup-action" data-tour="data-import">
            <div>
              <h3><Upload size={16} aria-hidden="true" /> Restaurar cópia</h3>
            </div>
            <label className="field data-backup-file">
              <Input aria-label="Arquivo de backup JSON" type="file" accept="application/json,.json" disabled={busy || Boolean(demo)} onChange={file} />
            </label>
            {demo && <p className="muted data-backup-note">Importação indisponível na demonstração.</p>}
            {payload && (
              <Button type="button" className="button-ghost" disabled={busy} onClick={() => void check()}>
                Gerar prévia
              </Button>
            )}
          </section>
        </div>
        {preview && (
          <div className="data-import-preview">
            <p className="muted">
              Prévia: {summary(preview)}{preview.already_imported ? ". Já importado." : "."}
            </p>
            <Button disabled={busy} onClick={() => setConfirmation("import")}>
              Confirmar importação
            </Button>
          </div>
        )}
        {report && <p className="notice">Importação: {summary(report)}</p>}
      </section>

      {(!demo || demo.csvAdapter) && <ManualCsvPanel adapter={demo?.csvAdapter} />}

      <details className="data-danger-zone" data-tour="data-delete">
        <summary>
          <span>{demo ? "Restaurar demonstração" : "Apagar dados"}</span>
        </summary>
        <p className="muted">{demo ? "Restaure o exemplo inicial. Apenas as alterações locais desta demonstração serão removidas." : "Turmas, aulas e confirmações serão removidas; sua conta continua existindo."}</p>
        <form className="form data-reset-form" onSubmit={reset}>
          <label className="field">
            Digite RESETAR
            <Input value={phrase} onChange={(event) => setPhrase(event.target.value)} />
          </label>
          <label className="field">
            Senha atual
            <Input type="password" autoComplete={demo ? "off" : undefined} disabled={Boolean(demo)} placeholder={demo ? "Não exigida na demonstração" : undefined} value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="button button-primary" disabled={busy || phrase !== "RESETAR" || (!demo && !password)}>
            {demo ? "Restaurar dados demonstrativos" : "Apagar dados permanentemente"}
          </button>
        </form>
      </details>
    </div>
  );
}

export default function DataPage() {
  return <AuthGuard>{(user) => <Shell user={user}><DataContent /></Shell>}</AuthGuard>;
}
