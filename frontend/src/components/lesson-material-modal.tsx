"use client";

import type { ReactNode } from "react";
import { Modal } from "@/components/modal";
import type { KodlandLesson } from "@/lib/api";

export type LessonMaterialDetails = Pick<
  KodlandLesson,
  | "title"
  | "slides_url"
  | "guide_url"
  | "homework_url"
  | "homework_title"
  | "external_url"
  | "classroom_tasks"
> & { location: string; source: string };

export function LessonMaterialModal({
  open,
  title,
  lesson,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  lesson: LessonMaterialDetails | null;
  onClose: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      {children}
      {lesson && (
        <div className="lesson-details">
          <div className="lesson-overview">
            <span className="lesson-location">{lesson.location}</span>
            <strong>{lesson.title}</strong>
          </div>
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
              Abrir aula na plataforma
            </a>
          )}
        </div>
      )}
    </Modal>
  );
}
