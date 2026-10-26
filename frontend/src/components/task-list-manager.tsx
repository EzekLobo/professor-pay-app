"use client";
import { useState } from "react";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button, Input } from "@/components/ui";
import { planTaskListChange, type TaskCard, type TaskList, type TaskListRemoval } from "@/lib/task-board";

export function TaskListManager({ lists, cards, initialId, onApply, onClose }: { lists: TaskList[]; cards: TaskCard[]; initialId: string; onApply: (lists: TaskList[], changes: TaskCard[], removedIds: string[]) => Promise<void>; onClose: () => void }) {
  const [draft, setDraft] = useState(() => lists.map((list) => ({ ...list })));
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [target, setTarget] = useState(""); const [deleteTasks, setDeleteTasks] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<{ lists: TaskList[]; removals: TaskListRemoval[] } | null>(null);
  function change(id: string, patch: Partial<TaskList>) { setDraft((current) => current.map((list) => list.id === id ? { ...list, ...patch } : list)); setError(""); }
  function reorder(index: number, offset: number) {
    const next = [...draft]; const targetIndex = index + offset;
    if (!next[targetIndex]) return;
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];
    setDraft(next.map((list, position) => ({ ...list, position: position * 1000 })));
  }
  async function apply(next = draft, removals: TaskListRemoval[] = [], confirmed = false) {
    if (busy) return;
    setError("");
    try {
      const plan = planTaskListChange(next, cards, removals);
      if (!confirmed && plan.changes.some((card) => card.completed_at && !cards.find((old) => old.id === card.id)?.completed_at && card.checklist.some((item) => !item.done))) { setPendingPlan({ lists: next, removals }); return; }
      setBusy(true); await onApply(plan.lists, plan.changes, plan.removedIds); onClose();
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Não foi possível salvar as listas."); }
    finally { setBusy(false); }
  }
  const deleting = draft.find((list) => list.id === deleteId);
  const taskCount = cards.filter((card) => card.column === deleteId).length;
  return <>
    <Modal open title="Organizar listas" onClose={() => !busy && onClose()} className="task-lists-modal">
      <p className="muted">Personalize seu fluxo. As alterações são aplicadas ao salvar.</p>
      <div className="task-lists-scroll"><div className="task-lists-editor">{draft.map((list, index) => <div className={`task-list-row${list.archived_at ? " is-archived" : ""}`} key={list.id}>
        <label><span className="sr-only">Nome da lista</span><Input aria-label={`Nome da lista ${index + 1}`} maxLength={60} value={list.label} disabled={busy} autoFocus={initialId === list.id} onChange={(event) => change(list.id, { label: event.target.value })} /></label>
        <div className="task-list-controls"><label><input type="checkbox" aria-label={`Concluir tarefas nesta lista: ${list.label}`} checked={list.role === "done"} disabled={busy} onChange={(event) => change(list.id, { role: event.target.checked ? "done" : "open" })} />Concluir tarefas</label><div><button type="button" disabled={busy || index === 0} aria-label={`Subir lista ${list.label}`} onClick={() => reorder(index, -1)}><ArrowUp size={16} /></button><button type="button" disabled={busy || index === draft.length - 1} aria-label={`Descer lista ${list.label}`} onClick={() => reorder(index, 1)}><ArrowDown size={16} /></button></div></div>
        <div className="task-list-actions">{list.archived_at && <span className="muted">Arquivada</span>}<Button type="button" className="button-ghost button-small task-icon-button" aria-label={list.archived_at ? "Restaurar lista" : "Arquivar lista"} title={list.archived_at ? "Restaurar lista" : "Arquivar lista"} disabled={busy} onClick={() => change(list.id, { archived_at: list.archived_at ? null : new Date().toISOString() })}>{list.archived_at ? <ArchiveRestore size={18} aria-hidden="true" /> : <Archive size={18} aria-hidden="true" />}</Button><Button type="button" className="button-ghost button-small task-delete-button task-icon-button" aria-label="Excluir lista" title="Excluir lista" disabled={busy} onClick={() => { setDeleteId(list.id); setTarget(draft.find((item) => item.id !== list.id && !item.archived_at)?.id ?? ""); setDeleteTasks(false); }}><Trash2 size={18} aria-hidden="true" /></Button></div>
      </div>)}</div>
      {draft.length === 0 && <p className="muted">Nenhuma lista. Adicione uma para organizar suas tarefas.</p>}
      <Button type="button" className="button-ghost button-small" disabled={busy || draft.length >= 100} onClick={() => setDraft((current) => [...current, { id: crypto.randomUUID(), label: "Nova lista", position: Math.max(-1000, ...current.map((list) => list.position)) + 1000, role: "open", archived_at: null }])}><Plus size={16} />Nova lista</Button>
      <p className="muted task-list-help">Listas arquivadas preservam suas tarefas. Alterar a opção de conclusão atualiza o estado das tarefas da lista ao salvar.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      </div><div className="form-actions task-lists-footer"><Button type="button" className="button-ghost" disabled={busy} onClick={onClose}>Cancelar</Button><Button type="button" disabled={busy} onClick={() => void apply()}>{busy ? "Salvando…" : "Salvar listas"}</Button></div>
    </Modal>
    <Modal open={Boolean(deleting)} title="Excluir lista" className="confirmation-dialog" onClose={() => !busy && setDeleteId(null)}>
      {deleting && <><p>Excluir a lista <strong>{deleting.label}</strong>?</p>{taskCount > 0 ? <div className="task-list-delete-options"><p>Esta lista contém {taskCount} tarefa(s), incluindo as arquivadas.</p><label>Destino das tarefas<select className="input" value={deleteTasks ? "__delete__" : target} disabled={busy} onChange={(event) => { setDeleteTasks(event.target.value === "__delete__"); setTarget(event.target.value === "__delete__" ? "" : event.target.value); }}><option value="" disabled>Escolha uma lista</option>{draft.filter((list) => list.id !== deleteId && !list.archived_at).map((list) => <option key={list.id} value={list.id}>Mover para {list.label}</option>)}<option value="__delete__">Excluir definitivamente todas as tarefas desta lista</option></select></label></div> : <p className="muted">Nenhuma tarefa será excluída.</p>}{error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button type="button" className="button-ghost" disabled={busy} onClick={() => setDeleteId(null)}>Cancelar</Button><Button type="button" className={deleteTasks ? "button-danger" : "button-primary"} disabled={busy || (taskCount > 0 && !deleteTasks && !target)} onClick={() => void apply(draft.filter((list) => list.id !== deleteId), [{ id: deleting.id, target: taskCount > 0 && !deleteTasks ? target : null }])}>{deleteTasks ? "Excluir lista e tarefas" : taskCount > 0 ? "Excluir lista e mover tarefas" : "Excluir lista"}</Button></div></>}
    </Modal>
    <ConfirmDialog open={pendingPlan !== null} title="Concluir tarefas com itens pendentes" confirmLabel="Salvar listas e concluir" onClose={() => setPendingPlan(null)} onConfirm={async () => { const plan = pendingPlan; setPendingPlan(null); if (plan) await apply(plan.lists, plan.removals, true); }}><p>Algumas tarefas serão concluídas com itens pendentes no checklist. Os itens continuarão pendentes. Deseja continuar?</p></ConfirmDialog>
  </>;
}
