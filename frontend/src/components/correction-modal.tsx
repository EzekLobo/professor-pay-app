"use client";

import { useState } from "react";
import { Modal } from "./modal";
import { Button } from "./ui";
import type { KodlandReview } from "@/lib/api";
import { correctionUrl, lessonLabel } from "@/lib/correction-navigation";

export function CorrectionModal({ review, position, count, pending, syncing, error, notice,
  onClose, onPrevious, onNext, onSync }: {
  review: KodlandReview;
  position: number;
  count: number;
  pending: boolean;
  syncing: boolean;
  error: string;
  notice: string;
  onClose: () => void;
  onPrevious: () => void;
  onNext: () => void;
  onSync: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const url = correctionUrl(review.correction_url);
  return <Modal open title="Corrigir atividade" onClose={onClose} className="correction-modal">
    <div className="correction-modal-context">
      <strong>{review.student_name || "Aluno não informado"}</strong>
      <span>{review.external_class_name || "Turma não informada"} · {lessonLabel(review)}</span>
      <span>Atividade {review.task_number ? `${review.task_number}. ` : ""}{review.task_title || "Sem título"}</span>
    </div>
    <div className="correction-modal-toolbar">
      <div className="correction-modal-navigation" role="group" aria-label="Navegar atividades">
        <button className="button button-ghost" type="button" disabled={position === 0} onClick={onPrevious}>Anterior</button>
        <span>{position + 1} de {count}</span>
        <button className="button button-ghost" type="button" disabled={position === count - 1} onClick={onNext}>Próxima</button>
      </div>
      <div className="correction-modal-actions">
        <Button disabled={syncing} onClick={onSync}>{syncing ? "Atualizando…" : "Atualizar pendências"}</Button>
        <a className="button button-ghost" href={url ?? "https://learn.kodland.org"} target="_blank" rel="noopener noreferrer">Abrir na plataforma</a>
      </div>
    </div>
    <p className="correction-modal-hint">Se a Kodland pedir login, entre na própria plataforma. Se a atividade não abrir, use “Abrir na plataforma”.</p>
    {syncing && <p className="notice" role="status">Consultando as pendências da Kodland…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!pending && <p className="notice" role="status">Esta atividade não consta mais na lista de pendências sincronizada. Ela continua aberta para consulta.</p>}
    <div className="correction-modal-frame">
      {url ? <>
        {!loaded && <p className="correction-frame-loading" role="status">Carregando página da Kodland…</p>}
        <iframe src={url} title={`Correção de ${review.student_name}: ${review.task_title}`} onLoad={() => setLoaded(true)} referrerPolicy="strict-origin-when-cross-origin" />
      </> : <p className="muted">O link individual desta atividade não está disponível ou é inválido. Atualize as pendências ou abra a plataforma.</p>}
    </div>
  </Modal>;
}
