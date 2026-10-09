"use client";

import { useState, type FormEvent, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { kodlandApi, lessonNotesApi, type KodlandLesson } from "@/lib/api";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";

export type LessonMaterialDetails = Pick<
  KodlandLesson,
  | "title"
  | "slides_url"
  | "guide_url"
  | "homework_url"
  | "homework_title"
  | "external_url"
  | "classroom_tasks"
> & { location: string; source: string; note_key?: string }
  & Partial<Pick<KodlandLesson, "id" | "external_class_id" | "source_lesson_id" | "materials_status">>;

function NoteIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M6.5 3.75h8.2l3.8 3.8v12.7H6.5a2 2 0 0 1-2-2v-12.5a2 2 0 0 1 2-2Z" />
      <path d="M14.5 3.9v4h4M8 12h8M8 15.5h6" />
    </svg>
  );
}

export function LessonMaterialModal({
  open,
  title,
  lesson,
  onClose,
  children,
  className = "",
  titleNotice,
  onMaterialsLoaded,
}: {
  open: boolean;
  title: string;
  lesson: LessonMaterialDetails | null;
  onClose: () => void;
  children?: ReactNode;
  className?: string;
  titleNotice?: ReactNode;
  onMaterialsLoaded?: (lesson: KodlandLesson) => void;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");
  const [loadedMaterial, setLoadedMaterial] = useState<{ key: string; lesson: LessonMaterialDetails } | null>(null);
  const [materialUsername, setMaterialUsername] = useState("");
  const [materialPassword, setMaterialPassword] = useState("");
  const [loadingMaterials, setLoadingMaterials] = useState(false);
  const [materialError, setMaterialError] = useState("");
  const activeLesson = loadedMaterial && loadedMaterial.key === lesson?.note_key
    ? loadedMaterial.lesson
    : lesson;
  const needsMaterials = Boolean(activeLesson?.id && activeLesson.external_class_id && activeLesson.source_lesson_id &&
    (activeLesson.materials_status === "pending" || activeLesson.materials_status === "error"));

  const loadMaterials = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeLesson?.id || !activeLesson.external_class_id || !activeLesson.source_lesson_id ||
        !materialUsername.trim() || !materialPassword || loadingMaterials) return;
    setLoadingMaterials(true);
    setMaterialError("");
    try {
      const updated = await kodlandApi.loadLessonMaterials({
        id: activeLesson.id,
        external_class_id: activeLesson.external_class_id,
        source_lesson_id: activeLesson.source_lesson_id,
      }, materialUsername.trim(), materialPassword);
      setLoadedMaterial({ key: lesson?.note_key ?? "", lesson: { ...activeLesson, ...updated } });
      onMaterialsLoaded?.(updated);
      setMaterialPassword("");
    } catch (reason) {
      setMaterialError(reason instanceof Error ? reason.message : "Não foi possível carregar os materiais da aula.");
    } finally {
      setLoadingMaterials(false);
    }
  };

  const openNotes = () => {
    if (!lesson?.note_key) return;
    let active = true;
    setNotesOpen(true);
    setNoteLoading(true);
    setNoteError("");
    void lessonNotesApi
      .get(lesson.note_key)
      .then((content) => {
        if (active) setNote(content);
      })
      .catch(() => {
        if (active) setNoteError("Não foi possível carregar a anotação.");
      })
      .finally(() => {
        if (active) setNoteLoading(false);
      });
    return () => {
      active = false;
    };
  };

  const closeModal = () => {
    setNotesOpen(false);
    setNoteError("");
    setMaterialPassword("");
    setMaterialError("");
    onClose();
  };

  const saveNote = async () => {
    if (!lesson?.note_key || noteSaving) return;
    setNoteSaving(true);
    setNoteError("");
    try {
      await lessonNotesApi.save(lesson.note_key, note.trim());
      setNotesOpen(false);
    } catch {
      setNoteError("Não foi possível salvar a anotação. Tente novamente.");
    } finally {
      setNoteSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title={title}
      onClose={closeModal}
      className={className}
      titleNotice={titleNotice}
      help={{
        id: "lesson-material",
        version: 3,
        intro: "Use este modal para preparar a aula e acompanhar a turma.",
        items: [
          { title: "Aulas", content: "Use as setas superiores para consultar a aula anterior ou a próxima.", target: ".class-lesson-navigation" },
          { title: "Alunos", content: "Abra a aba Alunos para conferir o ranking e acessar a turma na plataforma.", target: ".class-modal-tab" },
          { title: "Materiais", content: "Abra tarefas, lição de casa, slides e roteiro pelos links disponíveis.", target: ".lesson-material-section" },
          { title: "Anotações", content: "Use o ícone de folha para salvar lembretes particulares da aula.", target: ".lesson-note-toggle" },
        ],
      }}
    >
      {children}
      {activeLesson && (
        <div className="lesson-details">
          <div className="lesson-overview lesson-overview-actions">
            <strong>{activeLesson.title}</strong>
            {activeLesson.note_key && (
              <button
                className="lesson-note-toggle"
                type="button"
                aria-label="Abrir anotações da aula"
                title="Anotações da aula"
                onClick={openNotes}
              >
                <NoteIcon />
              </button>
            )}
          </div>
          {notesOpen ? (
            <section className="lesson-note-sheet" aria-label="Anotações da aula">
              <div className="lesson-note-sheet-heading">
                <div>
                  <h3>Folha de anotação</h3>
                  <p>Registre pontos importantes e um resumo para a próxima aula.</p>
                </div>
                <button
                  type="button"
                  className="button button-ghost button-small"
                  onClick={() => setNotesOpen(false)}
                >
                  Voltar aos materiais
                </button>
              </div>
              {noteLoading ? (
                <p className="muted">Carregando anotação…</p>
              ) : (
                <textarea
                  className="lesson-note-input"
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Ex.: aluno concluiu a primeira parte do projeto; retomar o desafio final no próximo encontro."
                  rows={9}
                  disabled={noteSaving}
                />
              )}
              {noteError && <p className="form-error" role="alert">{noteError}</p>}
              <div className="form-actions">
                <button
                  type="button"
                  className="button button-primary"
                  onClick={() => void saveNote()}
                  disabled={noteLoading || noteSaving}
                >
                  {noteSaving ? "Salvando…" : "Salvar anotação"}
                </button>
              </div>
            </section>
          ) : (
            <>
          {needsMaterials && (
            <form className="form lesson-material-load-form" onSubmit={loadMaterials}>
              <p className="muted">Os materiais desta aula ainda não foram consultados. Informe suas credenciais da Kodland para carregar apenas esta aula.</p>
              <label className="field">Usuário ou e-mail
                <input className="input" name="username" autoComplete="username" value={materialUsername} onChange={(event) => setMaterialUsername(event.target.value)} required disabled={loadingMaterials} />
              </label>
              <label className="field">Senha
                <input className="input" name="password" type="password" autoComplete="current-password" value={materialPassword} onChange={(event) => setMaterialPassword(event.target.value)} required disabled={loadingMaterials} />
              </label>
              {materialError && <p className="form-error" role="alert">{materialError}</p>}
              <div className="form-actions">
                <button type="button" className="button button-ghost button-small" disabled={loadingMaterials} onClick={() => {
                  void restoreKodlandCredentials().then((saved) => {
                    if (saved) { setMaterialUsername(saved.username); setMaterialPassword(saved.password); }
                  });
                }}>Usar credenciais salvas</button>
                <button type="submit" className="button button-primary" disabled={loadingMaterials}>
                  {loadingMaterials ? "Carregando…" : "Carregar materiais"}
                </button>
              </div>
            </form>
          )}
          {activeLesson.materials_status === "empty" && (
            <p className="muted">A Kodland não retornou materiais para esta aula.</p>
          )}
          <section className="lesson-material-section">
            <h3>Tarefas em sala</h3>
            {activeLesson.classroom_tasks.length ? (
              <ul className="lesson-resource-list">
                {activeLesson.classroom_tasks.map((task) => (
                  <li key={task.url}>
                    <a href={task.url} target="_blank" rel="noreferrer">
                      {task.title || `Tarefa em sala ${activeLesson.location}`}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                {needsMaterials ? "Carregue os materiais para consultar as tarefas." : "Nenhuma tarefa em sala foi encontrada para esta aula."}
              </p>
            )}
          </section>
          <section className="lesson-material-section">
            <h3>Lição de casa</h3>
            {activeLesson.homework_url ? (
              <ul className="lesson-resource-list">
                <li>
                  <a
                    href={activeLesson.homework_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {activeLesson.homework_title ||
                      `Lição de casa ${activeLesson.location}`}
                  </a>
                </li>
              </ul>
            ) : (
              <p className="muted">
                {needsMaterials ? "Carregue os materiais para consultar a lição de casa." : "Nenhuma lição de casa foi encontrada para esta aula."}
              </p>
            )}
          </section>
          <section className="lesson-material-section">
            <h3>Guias de estudo</h3>
            {activeLesson.slides_url || activeLesson.guide_url ? (
              <ul className="lesson-resource-list">
                {activeLesson.slides_url && (
                  <li>
                    <a
                      href={activeLesson.slides_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Slides {activeLesson.location}
                    </a>
                  </li>
                )}
                {activeLesson.guide_url && (
                  <li>
                    <a
                      href={activeLesson.guide_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Roteiro {activeLesson.location}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <p className="muted">{needsMaterials ? "Carregue os materiais para consultar slides e roteiro." : "Slides e roteiro não foram encontrados."}</p>
            )}
          </section>
          {activeLesson.external_url && (
            <a
              className="button secondary"
              href={activeLesson.external_url}
              target="_blank"
              rel="noreferrer"
            >
              Abrir na plataforma
            </a>
          )}
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
