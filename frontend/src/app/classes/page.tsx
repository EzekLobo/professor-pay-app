"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button, Input } from "@/components/ui";
import {
  ApiError,
  kodlandApi,
  type KodlandGroup,
  type KodlandStudent,
} from "@/lib/api";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import { whatsappUrl } from "@/lib/whatsapp";
import {
  rememberKodlandCredentials,
  restoreKodlandCredentials,
} from "@/lib/browser-credentials";
import {
  activeStudentsRankedByPoints,
  kodlandStudentPoints,
} from "@/lib/student-ranking";

const absoluteUrl = (value: string) =>
  value.startsWith("/") ? `https://bo.kodland.org${value}` : value;
function GroupAccordion({
  group,
  students,
  openByDefault,
}: {
  group: KodlandGroup;
  students: KodlandStudent[];
  openByDefault: boolean;
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

function ClassesContent() {
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncMode, setSyncMode] = useState<"essential" | "profiles">("essential");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [username, setUsername] = useState(() =>
    typeof window === "undefined"
      ? ""
      : window.localStorage.getItem("aulapay.kodland.username") ?? "",
  );
  const [password, setPassword] = useState("");
  const [saveCredentials, setSaveCredentials] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  function openSync(mode: "essential" | "profiles" = "essential") {
    setError("");
    setSyncMode(mode);
    setSyncOpen(true);
    void restoreKodlandCredentials().then((credentials) => {
      if (!credentials) return;
      setUsername((current) => current || credentials.username);
      setPassword((current) => current || credentials.password);
    });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [groupResult, studentResult] = await Promise.all([
        kodlandApi.groups(),
        kodlandApi.students(),
      ]);
      setGroups(groupResult.items);
      setStudents(studentResult.items);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Não foi possível carregar as turmas.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function syncClasses(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!username.trim() || !password || syncing) return;
    setSyncing(true);
    setError("");
    try {
      let savedInBrowser = false;
      const result = await kodlandApi.sync(
        username.trim(),
        password,
        syncMode,
      );
      if (saveCredentials) {
        try {
          window.localStorage.setItem("aulapay.kodland.username", username.trim());
          savedInBrowser = await rememberKodlandCredentials(formElement);
        } catch {
          // Browser credential storage is optional after a successful sync.
        }
      }
      setPassword("");
      setSyncOpen(false);
      if (syncMode === "profiles") {
        setNotice(`${result.student_count ?? 0} contato(s) de responsáveis atualizado(s).${saveCredentials ? savedInBrowser ? " Credenciais salvas neste navegador." : " O navegador não permitiu salvar as credenciais." : ""}`);
      } else {
        setNotice(
          `${result.extra_lesson_count ?? 0} aula(s) extra encontrada(s) na agenda da Kodland. Apenas as concluídas entram em Pagamentos.${saveCredentials ? savedInBrowser ? " Credenciais salvas neste navegador." : " O navegador não permitiu salvar as credenciais." : ""}`,
        );
      }
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

  return (
    <div className="management-grid">
      <Modal
        open={syncOpen}
        title={syncMode === "profiles" ? "Atualizar responsáveis" : "Atualizar turmas"}
        onClose={() => !syncing && setSyncOpen(false)}
        className="schedule-sync-modal"
      >
        <form className="form management-form" autoComplete="on" onSubmit={syncClasses}>
          <label className="field">
            Usuário ou e-mail
            <Input
              name="username"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              required
              autoComplete="username"
            />
          </label>
          <label className="field">
            Senha
            <Input
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoComplete="current-password"
            />
          </label>
          <label className="field">
            <input
              type="checkbox"
              checked={saveCredentials}
              disabled={syncing}
              onChange={(event) => setSaveCredentials(event.target.checked)}
            />{" "}
            Salvar credenciais no navegador
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Button type="submit" disabled={syncing}>
              {syncing ? "Atualizando…" : "Atualizar"}
            </Button>
          </div>
        </form>
      </Modal>

      {error && !syncOpen && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}

      <section className="panel pedagogical-panel">
        <div className="section-heading">
          <div>
            <h2>Turmas</h2>
          </div>
          <div className="card-actions">
            <Button type="button" data-tour="classes-sync" onClick={() => openSync()}>
              Atualizar turmas
            </Button>
            <Button type="button" className="button-ghost" onClick={() => openSync("profiles")}>
              Atualizar responsáveis
            </Button>
          </div>
        </div>
        {loading ? (
          <p className="muted">Carregando turmas…</p>
        ) : groups.length === 0 ? (
          <p className="muted">
            Nenhuma turma sincronizada. Use “Atualizar turmas” para importar
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
              />
            ))}
          </div>
        )}
      </section>
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
