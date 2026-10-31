"use client";
import { useEffect, useRef, useState } from "react";
import { activityModuleLabel, missingActivityList, missingActivityMessage, type ActivityTarget } from "@/lib/activity-missing-list";
import type { NotificationSource } from "@/lib/student-notification-source";
import { RefreshCw } from "lucide-react";
import { Button } from "./ui";
export function ActivityMissingList({ target, loadSource, onInsert }: { target: ActivityTarget; loadSource: (force?: boolean) => Promise<NotificationSource>; onInsert: (block: string, previous: string) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [data, setData] = useState<ReturnType<typeof missingActivityList> | null>(null);
  const [module, setModule] = useState("unknown");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const inserted = useRef("");
  const loader = useRef(loadSource);
  useEffect(() => { loader.current = loadSource; }, [loadSource]);
  const identity = `${target.source}:${target.class_id}:${target.student_id}`;
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const [source, class_id, student_id] = [target.source, target.class_id, target.student_id];
    void loader.current(true).then(value => {
      if (!active) return;
      const result = missingActivityList(value, { source, class_id, student_id });
      setData(result); setModule(result.currentModule);
    }).catch(() => { if (active) { setData(null); setError("Não foi possível consultar as atividades. Tente novamente."); } }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled, attempt, identity, target.source, target.class_id, target.student_id]);
  const selected = data?.items.filter(item => module === "all" || item.module === module) ?? [];
  return <section className="activity-missing-picker" aria-label="Atividades não feitas">
    <label className="activity-missing-toggle"><input type="checkbox" checked={enabled} onChange={event => { setEnabled(event.target.checked); setLoading(event.target.checked); setError(""); }} />Listar atividades não feitas</label>
    {enabled && <>
      {loading ? <p className="muted" role="status">Consultando atividades…</p> : error ? <><p className="form-error" role="alert">{error}</p><Button type="button" className="button-ghost" onClick={() => { setLoading(true); setError(""); setAttempt(value => value + 1); }}>Tentar novamente</Button></> : data && <>
        <div className="activity-missing-controls"><label className="field">Módulo<select className="input" aria-label="Módulo das atividades" value={module} onChange={event => setModule(event.target.value)}>{data.modules.map(value => <option key={value} value={value}>{activityModuleLabel(value)}{value === data.currentModule && value !== "unknown" ? " (atual)" : ""}</option>)}<option value="all">Todos os módulos</option></select></label><Button type="button" className="button-ghost symbol-action" aria-label="Reconsultar atividades" title="Reconsultar dados sincronizados" onClick={() => { setLoading(true); setError(""); setAttempt(value => value + 1); }}><RefreshCw size={18} aria-hidden="true" /></Button></div>
        {data.currentModule === "unknown" && <p className="muted">O módulo atual não pôde ser identificado nas aulas sincronizadas. Escolha um módulo ou todos.</p>}

        {selected.length ? <ul className="activity-missing-preview">{selected.map(item => <li key={item.id}><strong>{item.lesson}</strong><span>{item.title}</span></li>)}</ul> : <div className="activity-missing-empty" role="status"><p className="muted">{!data.hasRecords ? "Não há registros de entrega deste aluno. Atualize Acompanhamento para carregar as atividades da Kodland." : data.items.length ? "Não há atividades não feitas neste módulo. Há pendências em outros módulos." : "Nenhuma atividade não entregue foi identificada nos dados disponíveis."}</p>{data.items.length > 0 && module !== "all" && <Button type="button" className="button-ghost" onClick={() => setModule("all")}>Ver todos os módulos</Button>}</div>}
        {selected.length > 0 && <Button type="button" className="button-ghost" onClick={() => { const block = missingActivityMessage(data.items, module); onInsert(block, inserted.current); inserted.current = block; }}>Inserir lista na mensagem</Button>}
      </>}
    </>}
  </section>;
}
