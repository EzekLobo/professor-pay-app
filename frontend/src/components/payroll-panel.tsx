"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import Link from "next/link";
import { kodlandPayrollApi, tutorPreferencesApi, type DashboardPayment, type PayrollState } from "@/lib/api";
import { restoreKodlandCredentials } from "@/lib/browser-credentials";
import { formatMoney } from "@/lib/finance";
import { payrollStatusLabel } from "@/lib/kodland-payroll";

export type PayrollDemo = { state: PayrollState; onMode: (mode: PayrollState["mode"]) => void };
export function PayrollPanel({ payments, onChange, demo }: { payments: DashboardPayment[]; onChange: () => Promise<void>; demo?: PayrollDemo }) {
  const [state, setState] = useState<PayrollState | null>(demo?.state ?? null);
  const [enabled, setEnabled] = useState(Boolean(demo));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [needsCredentials, setNeedsCredentials] = useState(false);
  const load = useCallback(async () => {
    if (demo) { setState(demo.state); return; }
    const preferences = await tutorPreferencesApi.get();
    setEnabled(preferences.kodland_enabled);
    if (preferences.kodland_enabled) setState(await kodlandPayrollApi.get());
  }, [demo]);
  useEffect(() => {
    const timer = window.setTimeout(() => { void load().catch(reason => setError(reason instanceof Error ? reason.message : "Não foi possível carregar a folha.")); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  async function synchronize() {
    if (busy) return;
    setBusy(true); setError(""); setNeedsCredentials(false);
    try {
      if (demo) { setState(demo.state); return; }
      const credentials = await restoreKodlandCredentials();
      if (!credentials) { setNeedsCredentials(true); return; }
      setState(await kodlandPayrollApi.sync(credentials.username, credentials.password, setProgress));
      await onChange();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "A folha não pôde ser atualizada."); }
    finally { setBusy(false); setProgress(""); }
  }
  async function changeMode() {
    if (!state || busy) return;
    setBusy(true); setError("");
    try {
      if (demo) {
        const mode = state.mode === "official" ? "comparison" : "official";
        demo.onMode(mode); setState({ ...state, mode }); await onChange(); return;
      }
      await kodlandPayrollApi.setMode(state.mode === "official" ? "comparison" : "official");
      await load(); await onChange();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível alterar a fonte."); }
    finally { setBusy(false); }
  }
  if (!enabled) return null;
  return <section className="panel payroll-panel" aria-label="Folha oficial Kodland">
    <div className="payroll-toolbar"><div><h2>Folha oficial Kodland</h2><p className="muted">{state?.mode === "official" ? "Valores oficiais nos períodos conferidos; estimativas locais nos demais." : "Compare a folha com sua projeção antes de trocar a fonte dos valores."}</p></div><div className="card-actions">
      {Boolean(state?.periods.some(p => p.complete)) && <button className="button button-ghost" type="button" disabled={busy} onClick={() => void changeMode()}>{state?.mode === "official" ? "Usar projeção local" : "Usar valores oficiais"}</button>}
      <button className="button button-ghost" type="button" disabled={busy} aria-busy={busy} onClick={() => void synchronize()}><RefreshCw size={16} aria-hidden="true" />{busy ? "Atualizando…" : "Sincronizar folha"}</button>
    </div></div>
    {state?.last_sync && <small className="muted">Última atualização: {new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" }).format(new Date(state.last_sync))}</small>}
    {progress && <p role="status">{progress}</p>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {needsCredentials && <p role="status">Informe as credenciais desta conta em <Link href="/data">Dados e backup</Link> para consultar a folha.</p>}
    {state?.last_sync && state.periods.length === 0 && <p className="muted">Nenhuma folha disponível nos dois últimos anos. A projeção local foi mantida.</p>}
    {Boolean(state?.periods.length) && <details><summary>Comparar competências ({state!.periods.length})</summary><div className="payroll-table-scroll"><table className="admin-table"><thead><tr><th>Competência trabalhada</th><th>Situação oficial</th><th>Contabilizado</th><th>Previsto</th><th>Diferença local</th><th>Conferência</th></tr></thead><tbody>{[...state!.periods].sort((a, b) => b.period_start.localeCompare(a.period_start)).map(period => {
      const reconciliation = payments.flatMap(p => p.payroll ?? []).find(p => p.period_id === period.id);
      const currency = (value: number | null) => value === null ? "Indisponível" : period.currency === "BRL" ? formatMoney(value) : `${period.currency} ${(value / 100).toFixed(2)}`;
      return <tr key={period.id}><td>{period.period_start.slice(5, 7)}/{period.period_start.slice(0, 4)}</td><td>{payrollStatusLabel(period.approval_status)}</td><td>{currency(period.earned_cents)}</td><td>{currency(period.projected_cents)}</td><td>{reconciliation ? formatMoney(reconciliation.difference_cents) : "—"}</td><td>{period.issues.length ? period.issues.join(" ") : reconciliation?.received_locked ? "Recebimento preservado" : state?.mode === "official" ? "Fonte oficial" : "Somente comparação"}</td></tr>;
    })}</tbody></table></div><p className="muted">Aprovado na Kodland não confirma recebimento. O pagamento continua previsto para o mês seguinte; confirmações antigas permanecem preservadas.</p></details>}
  </section>;
}
