"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Modal } from "@/components/modal";
import { tutorPreferencesApi } from "@/lib/api";

export function FirstAccessAssistant() {
  const [open, setOpen] = useState(false);
  useEffect(() => { void tutorPreferencesApi.get().then((preferences) => { if (!preferences.onboarding_completed) setOpen(true); }).catch(() => undefined); }, []);
  return <Modal open={open} title="Comece a organizar suas aulas" onClose={() => setOpen(false)}><div className="form-stack onboarding-assistant"><p className="muted">Este guia é opcional. Você pode fechá-lo e continuar usando qualquer área.</p><ol><li><strong>Defina seus padrões</strong><span>Duração, tarifa, pagamento e mensagem de ausência.</span></li><li><strong>Cadastre alunos e uma turma</strong><span>Informe contatos, horários e matrículas.</span></li><li><strong>Crie ou vincule um curso</strong><span>O cronograma usará a sequência real de módulos e aulas.</span></li></ol><div className="form-actions"><button className="button button-ghost" type="button" onClick={() => setOpen(false)}>Agora não</button><Link className="button button-primary" href="/settings" onClick={() => setOpen(false)}>Iniciar configuração</Link></div></div></Modal>;
}
