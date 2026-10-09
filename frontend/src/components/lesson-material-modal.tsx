"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "@/components/modal";
import { lessonNotesApi, type KodlandLesson } from "@/lib/api";

export type LessonMaterialDetails = Pick<
  KodlandLesson,
  | "title"
  | "slides_url"
  | "guide_url"
  | "homework_url"
  | "homework_title"
  | "external_url"
  | "classroom_tasks"
> & { location: string; source: string; note_key?: string };

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
}: {
  open: boolean;
  title: string;
  lesson: LessonMaterialDetails | null;
  onClose: () => void;
  children?: ReactNode;
  className?: string;
  titleNotice?: ReactNode;
}) {
  const [notesOpen, setNotesOpen] = useState(false);
  const [note, setNote] = useState("");
  const [noteLoading, setNoteLoading] = useState(false);
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");

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
        version: 2,
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
      {lesson && (
        <div className="lesson-details">
          <div className="lesson-overview lesson-overview-actions">
            <strong>{lesson.title}</strong>
            {lesson.note_key && (
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
          <section className="lesson-material-section">
            <h3>Tarefas em sala</h3>
            {lesson.classroom_tasks.length ? (
              <ul className="lesson-resource-list">
                {lesson.classroom_tasks.map((task) => (
                  <li key={task.url}>
                    <a href={task.url} target="_blank" rel="noreferrer">
                      {task.title || `Tarefa em sala ${lesson.location}`}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">
                Nenhuma tarefa em sala foi encontrada para esta aula.
              </p>
            )}
          </section>
          <section className="lesson-material-section">
            <h3>Lição de casa</h3>
            {lesson.homework_url ? (
              <ul className="lesson-resource-list">
                <li>
                  <a
                    href={lesson.homework_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {lesson.homework_title ||
                      `Lição de casa ${lesson.location}`}
                  </a>
                </li>
              </ul>
            ) : (
              <p className="muted">
                Nenhuma lição de casa foi encontrada para esta aula.
              </p>
            )}
          </section>
          <section className="lesson-material-section">
            <h3>Guias de estudo</h3>
            {lesson.slides_url || lesson.guide_url ? (
              <ul className="lesson-resource-list">
                {lesson.slides_url && (
                  <li>
                    <a
                      href={lesson.slides_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Slides {lesson.location}
                    </a>
                  </li>
                )}
                {lesson.guide_url && (
                  <li>
                    <a
                      href={lesson.guide_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Roteiro {lesson.location}
                    </a>
                  </li>
                )}
              </ul>
            ) : (
              <p className="muted">Slides e roteiro não foram encontrados.</p>
            )}
          </section>
          {lesson.external_url && (
            <a
              className="button secondary"
              href={lesson.external_url}
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
