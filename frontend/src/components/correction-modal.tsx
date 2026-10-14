"use client";

import { useEffect, useState } from "react";
import { Modal } from "./modal";
import { Button } from "./ui";
import { kodlandApi, type KodlandReview } from "@/lib/api";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { authenticatedCorrectionUrl, correctionUrl, lessonLabel } from "@/lib/correction-navigation";

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
  const [frameUrl, setFrameUrl] = useState<string | null>(null);
  const [authError, setAuthError] = useState("");
  const [authenticating, setAuthenticating] = useState(true);
  const url = correctionUrl(review.correction_url);
  useEffect(() => {
    let active = true;
    const authenticate = async () => {
      try {
        if (!url) return;
        if (new URL(url).origin !== "https://learn.kodland.org") {
          if (active) setFrameUrl(url);
          return;
        }
        const credentials = await restoreKodlandCredentials();
        if (!active) return;
        if (!credentials) {
          setAuthError("Para entrar automaticamente, salve as credenciais em Dados e backup.");
          setFrameUrl(url);
          return;
        }
        const tokens = await kodlandApi.activitySession(credentials.username, credentials.password);
        if (active) setFrameUrl(authenticatedCorrectionUrl(url, tokens));
      } catch (reason) {
        if (active) {
          setAuthError(reason instanceof Error ? reason.message : "Não foi possível entrar automaticamente na Kodland.");
          setFrameUrl(url);
        }
      } finally {
        if (active) setAuthenticating(false);
      }
    };
    void authenticate();
    return () => { active = false; };
  }, [url]);
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
    <p className="correction-modal-hint">A atividade abre com as credenciais salvas. Se não abrir, use “Abrir na plataforma”.</p>
    {authError && <p className="form-error" role="alert">{authError}</p>}
    {syncing && <p className="notice" role="status">Consultando as pendências da Kodland…</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {notice && <p className="notice" role="status">{notice}</p>}
    {!pending && <p className="notice" role="status">Esta atividade não consta mais na lista de pendências sincronizada. Ela continua aberta para consulta.</p>}
    <div className="correction-modal-frame">
      {url ? <>
        {!loaded && <p className="correction-frame-loading" role="status">{authenticating ? "Entrando na Kodland…" : "Carregando página da Kodland…"}</p>}
        {frameUrl && <iframe src={frameUrl} title={`Correção de ${review.student_name}: ${review.task_title}`} onLoad={() => setLoaded(true)} referrerPolicy="no-referrer" />}
      </> : <p className="muted">O link individual desta atividade não está disponível ou é inválido. Atualize as pendências ou abra a plataforma.</p>}
    </div>
  </Modal>;
}
