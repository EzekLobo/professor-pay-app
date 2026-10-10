"use client";

import { type ChangeEvent, type FormEvent, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button, Input } from "@/components/ui";
import {
  ApiError,
  dataApi,
  kodlandApi,
  type ImportReport,
} from "@/lib/api";
import {
  rememberKodlandCredentials,
  restoreKodlandCredentials,
} from "@/lib/browser-credentials";
import { formatMoney } from "@/lib/finance";
import {
  KodlandSyncPersistenceError,
  KodlandSyncResponseError,
} from "@/lib/kodland-sync-response";

const savedCredentialsKey = "aulapay.kodland.server-credentials-saved";

const summary = (report: ImportReport) =>
  `${report.class_count} turmas, ${report.lesson_count} aulas, ${report.payment_confirmation_count} confirmações (${formatMoney(report.total_cents)}), ${report.pedagogical_group_count} turmas pedagógicas, ${report.pedagogical_student_count} alunos, ${report.pedagogical_lesson_count} aulas sincronizadas e ${report.pedagogical_review_count} correções`;

function Content() {
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [password, setPassword] = useState("");
  const [phrase, setPhrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncError, setSyncError] = useState("");
  const [syncProgress, setSyncProgress] = useState("");
  const [syncUsername, setSyncUsername] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("aulapay.kodland.username") ?? "",
  );
  const [syncPassword, setSyncPassword] = useState("");
  const [useSavedCredentials, setUseSavedCredentials] = useState(() =>
    typeof window !== "undefined" &&
    window.localStorage.getItem(savedCredentialsKey) === "true",
  );
  const [saveCredentials, setSaveCredentials] = useState(true);

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
    if (useSavedCredentials) return;
    void restoreKodlandCredentials().then((credentials) => {
      if (!credentials) return;
      setSyncUsername((current) => current || credentials.username);
      setSyncPassword((current) => current || credentials.password);
    });
  }

  async function synchronize(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const username = syncUsername.trim();
    if (busy || (!useSavedCredentials && (!username || !syncPassword))) return;

    setBusy(true);
    setSyncError("");
    setSyncProgress("");
    try {
      const result = await kodlandApi.syncAll(
        useSavedCredentials ? "" : username,
        useSavedCredentials ? "" : syncPassword,
        setSyncProgress,
        {
          useSavedCredentials,
          saveCredentials: !useSavedCredentials && saveCredentials,
        },
      );
      if (!useSavedCredentials && saveCredentials) {
        window.localStorage.setItem(savedCredentialsKey, "true");
        setUseSavedCredentials(true);
      }
      if (!useSavedCredentials) {
        try {
          window.localStorage.setItem("aulapay.kodland.username", username);
          await rememberKodlandCredentials(form);
        } catch {
          // Browser storage is optional after the encrypted server save.
        }
      }
      setSyncPassword("");
      setSyncOpen(false);
      setNotice(
        `Sincronização concluída: ${result.group_count} turma(s), ${result.student_count} aluno(s), ${result.lesson_count} aula(s), ${result.extra_lesson_count} extra(s) e ${result.review_count} correção(ões).`,
      );
    } catch (reason) {
      setSyncError(
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
      const data = await dataApi.export();
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `aulapay-backup-${data.exported_at.slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Backup baixado.");
    } catch (reason) {
      message(reason);
    } finally {
      setBusy(false);
    }
  }

  function file(event: ChangeEvent<HTMLInputElement>) {
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
    if (!payload || !preview || busy || !window.confirm("Importar estes dados?")) {
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
    } finally {
      setBusy(false);
    }
  }

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      phrase !== "RESETAR" ||
      !password ||
      busy ||
      !window.confirm("Apagar permanentemente todos os seus dados?")
    ) {
      return;
    }
    setBusy(true);
    try {
      await dataApi.reset(password);
      setPhrase("");
      setPassword("");
      setNotice("Dados apagados.");
    } catch (reason) {
      message(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="management-grid">
      <Modal
        open={syncOpen}
        title="Sincronizar aplicação"
        className="schedule-sync-modal"
        onClose={() => !busy && setSyncOpen(false)}
      >
        <form className="form management-form" autoComplete="on" onSubmit={synchronize}>
          <p className="muted">
            Atualiza turmas, alunos, grade, aulas extras e correções em etapas.
          </p>
          {useSavedCredentials ? (
            <div className="form">
              <p className="muted">
                Serão usadas as credenciais criptografadas vinculadas a esta conta.
              </p>
              <Button
                type="button"
                className="button-ghost button-small"
                disabled={busy}
                onClick={() => setUseSavedCredentials(false)}
              >
                Usar outras credenciais
              </Button>
            </div>
          ) : (
            <>
              <label className="field">
                Usuário ou e-mail
                <Input
                  name="username"
                  type="text"
                  required
                  autoComplete="username"
                  disabled={busy}
                  value={syncUsername}
                  onChange={(event) => setSyncUsername(event.target.value)}
                />
              </label>
              <label className="field">
                Senha
                <Input
                  name="password"
                  type="password"
                  required
                  autoComplete="current-password"
                  disabled={busy}
                  value={syncPassword}
                  onChange={(event) => setSyncPassword(event.target.value)}
                />
              </label>
              <label className="field">
                <input
                  type="checkbox"
                  checked={saveCredentials}
                  disabled={busy}
                  onChange={(event) => setSaveCredentials(event.target.checked)}
                />{" "}
                Salvar credenciais criptografadas para as próximas sincronizações
              </label>
            </>
          )}
          {syncProgress && <p className="notice" role="status">{syncProgress}</p>}
          {syncError && <p className="form-error" role="alert">{syncError}</p>}
          <div className="form-actions">
            <Button type="submit" disabled={busy}>
              {busy ? "Sincronizando…" : "Sincronizar tudo"}
            </Button>
          </div>
        </form>
      </Modal>

      <section className="page-heading">
        <p className="eyebrow">Privacidade e backup</p>
        <h1>Dados e backup</h1>
      </section>
      {error && <p className="form-error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      <section className="panel" data-tour="data-sync">
        <h2>Sincronização Kodland</h2>
        <p className="muted">
          Importe toda a aplicação de uma vez. As atualizações específicas continuam disponíveis em cada tela.
        </p>
        <Button type="button" disabled={busy} onClick={openSync}>
          Sincronizar tudo
        </Button>
      </section>

      <section className="panel" data-tour="data-export">
        <h2>Exportar backup</h2>
        <p className="muted">Baixe um JSON com seus dados e guarde-o em local seguro.</p>
        <Button disabled={busy} onClick={() => void download()}>
          {busy ? "Preparando…" : "Baixar backup JSON"}
        </Button>
      </section>

      <section className="panel" data-tour="data-import">
        <h2>Importar do aplicativo Expo</h2>
        <p className="muted">Selecione o JSON, confira a prévia e então confirme.</p>
        <div className="form">
          <Input type="file" accept="application/json,.json" disabled={busy} onChange={file} />
          {payload && (
            <Button type="button" disabled={busy} onClick={() => void check()}>
              Gerar prévia
            </Button>
          )}
        </div>
        {preview && (
          <div className="form">
            <p className="muted">
              Prévia: {summary(preview)}{preview.already_imported ? ". Já importado." : "."}
            </p>
            <Button disabled={busy} onClick={() => void importIt()}>
              Confirmar importação
            </Button>
          </div>
        )}
        {report && <p className="notice">Importação: {summary(report)}</p>}
      </section>

      <section className="panel" data-tour="data-delete">
        <h2>Apagar todos os dados</h2>
        <p className="muted">Turmas, aulas e confirmações serão removidas; sua conta continua existindo.</p>
        <form className="form" onSubmit={reset}>
          <label className="field">
            Digite RESETAR
            <Input value={phrase} onChange={(event) => setPhrase(event.target.value)} />
          </label>
          <label className="field">
            Senha atual
            <Input type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
          </label>
          <button className="button button-primary" disabled={busy || phrase !== "RESETAR" || !password}>
            Apagar dados permanentemente
          </button>
        </form>
      </section>
    </div>
  );
}

export default function DataPage() {
  return <AuthGuard>{(user) => <Shell user={user}><Content /></Shell>}</AuthGuard>;
}
