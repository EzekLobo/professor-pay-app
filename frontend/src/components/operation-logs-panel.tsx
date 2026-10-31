"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, Download, RefreshCw } from "lucide-react";
import { operationLogDeliveryState } from "@/lib/operation-log-client";
import { getFirebaseAuth } from "@/lib/firebase";
import { errorLabels, operationLabels, statusLabels, type OperationLogRow } from "@/lib/operation-log";
import { Button } from "./ui";

type Result = { logs: OperationLogRow[]; generatedAt: string; truncated: boolean; days: number };
type Loader = (days: number, signal: AbortSignal) => Promise<Result>;
const countLabels: Record<string, string> = { groups: "turmas", students: "alunos", lessons: "aulas", activities: "correções pendentes", progress: "registros de entrega", attendance: "presenças", alerts: "alertas", pending: "pendências", warnings: "avisos" };
const scopeLabels: Record<string, string> = { complete: "Sincronização completa", essential: "Turmas e agenda", schedule: "Agenda", profiles: "Contatos", corrections: "Presença e atividades" };
const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });
const loadLogs: Loader = async (days, signal) => {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("Entre novamente para consultar o diagnóstico.");
  const response = await fetch(`/api/admin/operation-logs?days=${days}`, { headers: { authorization: `Bearer ${await user.getIdToken()}` }, signal });
  const value = await response.json();
  if (!response.ok) throw new Error(value.message || "Não foi possível consultar os registros.");
  if (getFirebaseAuth().currentUser?.uid !== user.uid) throw new Error("Sua conta foi alterada.");
  return value as Result;
};
export function OperationLogsPanel({ users = [], loader = loadLogs }: { users?: Array<{ id: string; name: string }>; loader?: Loader }) {
  const [days, setDays] = useState(7);
  const [operation, setOperation] = useState(""); const [status, setStatus] = useState(""); const [user, setUser] = useState("");
  const [data, setData] = useState<Result | null>(null); const [error, setError] = useState(""); const [loading, setLoading] = useState(false);
  const [reload, setReload] = useState(0); const [copied, setCopied] = useState("");
  useEffect(() => {
    const abort = new AbortController(); let active = true; let running = false;
    const refresh = async () => {
      if (running || document.visibilityState === "hidden") return;
      running = true; setLoading(true);
      try { const result = await loader(days, abort.signal); if (active) { setData(result); setError(""); } }
      catch (reason) { if (active && !abort.signal.aborted) setError(reason instanceof Error ? reason.message : "Falha ao consultar os registros."); }
      finally { running = false; if (active) setLoading(false); }
    };
    const run = () => { void refresh(); };
    const first = setTimeout(run, 0); const interval = setInterval(run, 30000);
    document.addEventListener("visibilitychange", run);
    return () => { active = false; abort.abort(); clearTimeout(first); clearInterval(interval); document.removeEventListener("visibilitychange", run); };
  }, [days, loader, reload]);
  const delivery = operationLogDeliveryState();
  const logs = useMemo(() => data?.logs.filter(item => (!operation || item.operation === operation) && (!status || item.status === status) && (!user || item.userId === user)) ?? [], [data, operation, status, user]);
  const names = new Map(users.map(item => [item.id, item.name]));
  const userIds = [...new Set([...(data?.logs.map(item => item.userId) ?? []), ...(user ? [user] : [])])];
  const totals = (value: OperationLogRow["status"]) => logs.filter(item => item.status === value).length;
  const exportLogs = useCallback(() => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ generatedAt: data?.generatedAt, logs }, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = "nexusclass-diagnostico.json"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, [data, logs]);
  return <section className="panel operation-logs-panel" aria-label="Diagnóstico de operações" aria-busy={loading}>
    <div className="operation-logs-heading"><div><h2>Diagnóstico</h2><p className="muted">Sincronizações, alertas, tarefas e falhas da interface.</p></div><div className="operation-logs-actions">
      <Button type="button" className="button-ghost" aria-label="Atualizar diagnóstico" title="Atualizar diagnóstico" disabled={loading} onClick={() => setReload(value => value + 1)}><RefreshCw size={18} aria-hidden="true" /></Button>
      <Button type="button" className="button-ghost" aria-label="Exportar registros filtrados" title="Exportar registros filtrados" disabled={!logs.length} onClick={exportLogs}><Download size={18} aria-hidden="true" /></Button>
    </div></div>
    <div className="operation-log-filters"><label>Período<select className="input" value={days} onChange={event => { setData(null); setDays(Number(event.target.value)); }}><option value={1}>Últimas 24 horas</option><option value={7}>Últimos 7 dias</option><option value={30}>Últimos 30 dias</option></select></label>
      <label>Operação<select className="input" value={operation} onChange={event => setOperation(event.target.value)}><option value="">Todas</option>{Object.entries(operationLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Resultado<select className="input" value={status} onChange={event => setStatus(event.target.value)}><option value="">Todos</option>{Object.entries(statusLabels).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
      <label>Usuário<select className="input" value={user} onChange={event => setUser(event.target.value)}><option value="">Todos</option>{userIds.map(id => <option key={id} value={id}>{names.get(id) ?? id}</option>)}</select></label>
    </div>
    <p className="muted operation-log-caption">Até 200 operações mais recentes do período. Os filtros e totais se aplicam a esse recorte. Falhas repetidas são amostradas.{data?.truncated ? " Existem registros anteriores não carregados." : ""}</p>
    <div className="operation-log-summary" aria-label="Resultados no recorte carregado"><span>Concluídas: <b>{totals("success")}</b></span><span>Falhas: <b>{totals("error")}</b></span><span>Atenções: <b>{totals("warning")}</b></span><span>Sem resultado final: <b>{totals("running")}</b></span></div>
    {delivery.enabled && delivery.pending > 0 && <p className="muted" role="status">Coleta deste dispositivo: {delivery.pending} registro(s) aguardando envio.{delivery.retrying ? " Houve falha no envio; uma nova tentativa está agendada." : ""}</p>}
    {error && <p className="form-error" role="alert">{error} <button type="button" onClick={() => setReload(value => value + 1)}>Tentar novamente</button></p>}
    {loading && !data && <p className="muted" role="status">Consultando registros…</p>}
    {!loading && data && !logs.length && <p className="muted">Nenhum registro para os filtros selecionados. Ausência de registros não confirma que uma rotina foi executada.</p>}
    <div className="operation-log-list">{logs.map(item => <details key={item.id + item.userId} className={`operation-log-card is-${item.status}`}>
      <summary><span className="operation-log-status">{item.status === "running" && Date.parse(data?.generatedAt ?? item.updatedAt) - Date.parse(item.updatedAt) > 600000 ? "Sem conclusão" : statusLabels[item.status]}</span><strong>{operationLabels[item.operation]}</strong><time dateTime={item.updatedAt}>{date.format(new Date(item.updatedAt))}</time><ChevronDown size={15} className="operation-log-disclosure" aria-hidden="true" /></summary>
      <div className="operation-log-details"><dl><div><dt>Primeiro registro</dt><dd>{date.format(new Date(item.receivedAt))}</dd></div><div><dt>Usuário</dt><dd>{names.get(item.userId) ?? item.userId}</dd></div><div><dt>Identificador da conta</dt><dd>{item.userId}</dd></div><div><dt>Origem</dt><dd>Aplicação · {item.trigger === "automatic" ? "automática" : item.trigger === "manual" ? "manual" : "evento"}</dd></div>{item.scope && <div><dt>Escopo</dt><dd>{scopeLabels[item.scope]}</dd></div>}{item.durationMs !== undefined && <div><dt>Duração</dt><dd>{(item.durationMs / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} s</dd></div>}{item.errorCode && <div><dt>Diagnóstico</dt><dd>{errorLabels[item.errorCode]}</dd></div>}{item.errorType && <div><dt>Tipo técnico</dt><dd>{item.errorType}</dd></div>}{item.version && <div><dt>Versão da aplicação</dt><dd>{item.version}</dd></div>}{item.pathname && <div><dt>Tela</dt><dd>{item.pathname}</dd></div>}</dl>
        {item.counts && <p className="operation-log-counts">{Object.entries(item.counts).map(([key, value]) => `${countLabels[key] ?? key}: ${value}`).join(" · ")}</p>}
        {item.status === "running" && <p className="muted">Pode estar em execução ou ter sido interrompida antes de registrar o resultado.</p>}
        <div className="operation-log-reference"><code>{item.reference ?? item.id}</code><Button type="button" className="button-ghost button-small" onClick={async () => { try { await navigator.clipboard.writeText(item.reference ?? item.id); setCopied(item.id); } catch { setCopied(""); } }}>{copied === item.id ? "Copiado" : "Copiar referência"}</Button></div>
      </div>
    </details>)}</div>
    {data && <p className="muted operation-log-caption">Consulta: {date.format(new Date(data.generatedAt))}. Atualização a cada 30 segundos enquanto esta seção estiver visível.</p>}
  </section>;
}
