"use client";

import { useCallback, useEffect, useState } from "react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { StatusBadge } from "@/components/ui";
import { kodlandApi, type KodlandReview } from "@/lib/api";

function Content() {
  const [reviews, setReviews] = useState<KodlandReview[]>([]); const [error, setError] = useState("");
  const load = useCallback(async () => { try { setReviews((await kodlandApi.reviews()).items); } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar as correções."); } }, []);
  useEffect(() => { queueMicrotask(() => { void load(); }); }, [load]);
  return <div className="management-grid"><section className="page-heading"><div><p className="eyebrow">Kodland</p><h1>Correções</h1><p className="muted">Atividades entregues aguardando sua revisão.</p></div></section>{error && <p className="form-error">{error}</p>}<section className="panel"><div className="section-heading"><h2>Pendências</h2><span className="muted">{reviews.length} atividade(s)</span></div>{reviews.length === 0 ? <p className="muted">Sem pendências. Sincronize a Kodland para atualizar esta lista.</p> : <div className="entity-list">{reviews.map((review) => <article className="entity-card" key={review.id}><div><div className="entity-title"><h3>{review.student_name}</h3><StatusBadge tone="warning">{review.status_label}</StatusBadge></div><p className="entity-details">{review.external_class_name} · Aula {review.lesson_number || "–"}: {review.lesson_title || "Sem título"}</p><p className="muted">{review.task_number ? `${review.task_number}. ` : ""}{review.task_title || "Atividade"}</p></div><a className="button button-primary" target="_blank" rel="noreferrer" href={review.correction_url}>Corrigir na Kodland</a></article>)}</div>}</section></div>;
}

export default function CorrectionsPage() { return <AuthGuard>{(user) => <Shell user={user}><Content /></Shell>}</AuthGuard>; }
