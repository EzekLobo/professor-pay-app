"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Modal } from "@/components/modal";
import { Shell } from "@/components/shell";
import { Button } from "@/components/ui";
import {
  ApiError,
  kodlandApi,
  type KodlandGroup,
  type KodlandStudent,
} from "@/lib/api";
import { KodlandSyncPersistenceError, KodlandSyncResponseError } from "@/lib/kodland-sync-response";
import { whatsappUrl } from "@/lib/whatsapp";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import {
  activeStudentsRankedByPoints,
  kodlandStudentPoints,
} from "@/lib/student-ranking";

const absoluteUrl = (value: string) =>
  value.startsWith("/") ? `https://bo.kodland.org${value}` : value;
export function GroupAccordion({
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

export function ClassesContent({ demo }: { demo?: { groups: KodlandGroup[]; students: KodlandStudent[]; onSync: () => void } } = {}) {
  const [groups, setGroups] = useState<KodlandGroup[]>([]);
  const [students, setStudents] = useState<KodlandStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    if (demo) { setGroups(demo.groups); setStudents(demo.students); setLoading(false); return; }
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

      <section className="panel pedagogical-panel">
        <div className="section-heading">
          <div>
            <h2>Turmas</h2>
          </div>
          <div className="card-actions">
            <Button type="button" data-tour="classes-sync" onClick={() => void syncClasses()} disabled={syncing}>
              {syncing ? "Atualizando…" : "Atualizar turmas"}
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
