"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, GripVertical, Plus, SlidersHorizontal } from "lucide-react";
import { AuthGuard } from "@/components/auth-guard";
import { Shell } from "@/components/shell";
import { Modal } from "@/components/modal";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button, Input } from "@/components/ui";
import { createTaskCard, isTaskOverdue, TASK_COLUMNS, validateTaskCard, type TaskCard, type TaskBoardStore } from "@/lib/task-board";
import { taskBoardStore } from "@/lib/task-board-store";
import "./tasks-page.css";

const priorities = { low: "Baixa", normal: "Normal", high: "Alta", urgent: "Urgente" } as const;
const categories = ["Aula", "Aluno", "Financeiro", "Técnico", "Outros"];
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const clone = (card: TaskCard) => ({ ...card, checklist: card.checklist.map((item) => ({ ...item })) });
const compare = (left: TaskCard, right: TaskCard) => left.position - right.position || left.id.localeCompare(right.id);
const searchText = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

export function TasksContent({ store = taskBoardStore }: { store?: TaskBoardStore }) {
  const [cards, setCards] = useState<TaskCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [draft, setDraft] = useState<TaskCard | null>(null);
  const [draftError, setDraftError] = useState("");
  const [newItem, setNewItem] = useState("");
  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [kind, setKind] = useState("");
  const [priority, setPriority] = useState("");
  const [category, setCategory] = useState("");
  const [due, setDue] = useState("");
  const [archive, setArchive] = useState(false);
  const [mobileColumn, setMobileColumn] = useState<TaskCard["column"]>("todo");
  const [dragId, setDragId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ type: "complete" | "delete"; card: TaskCard } | null>(null);
  const [syncStatus, setSyncStatus] = useState<{ pending: number; error: string | null }>({ pending: 0, error: null });

  useEffect(() => {
    let active = true;
    const refreshStatus = () => { if (active) setSyncStatus(store.status?.() ?? { pending: 0, error: null }); };
    void store.list().then((items) => { if (active) { setCards(items); setLoading(false); refreshStatus(); } }).catch((reason) => { if (active) { setError(reason instanceof Error ? reason.message : "Não foi possível carregar as tarefas."); setLoading(false); } });
    const unsubscribe = store.subscribe?.(refreshStatus);
    const sync = () => { if (store.sync) void store.sync().then(refreshStatus).catch(refreshStatus); };
    window.addEventListener("online", sync);
    return () => { active = false; unsubscribe?.(); window.removeEventListener("online", sync); };
  }, [store, reload]);

  const ordered = useMemo(() => [...cards].sort(compare), [cards]);
  const filtered = ordered.filter((card) => Boolean(card.archived_at) === archive && (!search.trim() || searchText(card.title).includes(searchText(search.trim()))) && (!kind || card.kind === kind) && (!priority || card.priority === priority) && (!category || card.category === category) && (!due || (due === "overdue" ? isTaskOverdue(card, today()) : card.column !== "done" && card.due_date === today())));
  const hasFilters = Boolean(search || kind || priority || category || due);
  const draftExists = draft && cards.some((card) => card.id === draft.id);

  async function persist(card: TaskCard) {
    setBusy(true); setError(""); setDraftError("");
    try {
      const saved = await store.save(validateTaskCard({ ...card, updated_at: new Date().toISOString() }));
      setCards((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setSyncStatus(store.status?.() ?? { pending: 0, error: null });
      setNotice(`Tarefa ${saved.column === "done" ? "concluída" : "salva"}: ${saved.title}.`);
      return saved;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : "Não foi possível salvar a tarefa.";
      setError(message); setDraftError(message); throw reason;
    } finally { setBusy(false); }
  }

  function requestMove(card: TaskCard, column: TaskCard["column"], position?: number) {
    if (busy) return;
    const last = ordered.filter((item) => item.column === column && !item.archived_at).at(-1)?.position ?? 0;
    const updated = { ...card, column, position: position ?? last + 1000, completed_at: column === "done" ? card.completed_at ?? new Date().toISOString() : null, updated_at: new Date().toISOString() };
    if (column === "done" && card.column !== "done" && card.checklist.some((item) => !item.done)) setConfirm({ type: "complete", card: updated });
    else void persist(updated).catch(() => undefined);
  }

  function reorder(card: TaskCard, direction: -1 | 1) {
    const siblings = ordered.filter((item) => item.column === card.column && !item.archived_at);
    const index = siblings.findIndex((item) => item.id === card.id);
    const target = siblings[index + direction];
    if (!target) return;
    const before = direction < 0 ? siblings[index - 2] : target;
    const after = direction < 0 ? target : siblings[index + 2];
    const position = before && after ? (before.position + after.position) / 2 : before ? before.position + 1000 : (after?.position ?? 1000) - 1000;
    requestMove(card, card.column, position);
  }

  function edit(card: TaskCard) { setDraft(clone(card)); setDraftError(""); setNewItem(""); }
  function create() {
    const card = createTaskCard();
    card.column = archive ? "todo" : mobileColumn;
    if (card.column === "done") card.column = "todo";
    card.position = (ordered.filter((item) => item.column === card.column).at(-1)?.position ?? 0) + 1000;
    setDraft(card); setDraftError(""); setNewItem("");
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!draft || busy) return;
    if (draft.column === "done" && draft.checklist.some((item) => !item.done) && cards.find((item) => item.id === draft.id)?.column !== "done") { setConfirm({ type: "complete", card: draft }); return; }
    try { await persist(draft); setDraft(null); } catch { /* Keep the draft for retry. */ }
  }
  function addItem() {
    if (!draft || !newItem.trim()) return;
    if (draft.checklist.length >= 50) { setDraftError("O checklist pode ter até 50 itens."); return; }
    setDraft({ ...draft, checklist: [...draft.checklist, { id: crypto.randomUUID(), text: newItem.trim(), done: false }] }); setNewItem("");
  }

  return <div className="tasks-page">
    <div className="tasks-toolbar"><div><h2>Minhas tarefas</h2><p className="muted">Organize suas atividades e problemas a resolver.</p></div><Button type="button" onClick={create} disabled={loading || busy}><Plus size={17} aria-hidden="true" />Nova tarefa</Button></div>
    <div className="tasks-tools"><label className="tasks-search"><span className="sr-only">Buscar tarefas</span><Input type="search" placeholder="Buscar tarefa" value={search} onChange={(event) => setSearch(event.target.value)} /></label><Button type="button" className="button-ghost button-small" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}><SlidersHorizontal size={16} aria-hidden="true" />Filtros</Button><Button type="button" className="button-ghost button-small" onClick={() => setArchive((value) => !value)}>{archive ? "Voltar ao quadro" : "Ver arquivo"}</Button></div>
    {filtersOpen && <div className="tasks-filters"><label>Tipo<select className="input" value={kind} onChange={(event) => setKind(event.target.value)}><option value="">Todos</option><option value="task">Tarefa</option><option value="problem">Problema</option></select></label><label>Prioridade<select className="input" value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">Todas</option>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Categoria<select className="input" value={category} onChange={(event) => setCategory(event.target.value)}><option value="">Todas</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label><label>Prazo<select className="input" value={due} onChange={(event) => setDue(event.target.value)}><option value="">Todos</option><option value="today">Hoje</option><option value="overdue">Atrasadas</option></select></label></div>}
    {hasFilters && <div className="tasks-filter-summary"><span>{filtered.length} resultado(s)</span><button type="button" onClick={() => { setSearch(""); setKind(""); setPriority(""); setCategory(""); setDue(""); }}>Limpar filtros</button></div>}
    {error && <div className="tasks-error"><p className="form-error" role="alert">{error}</p><Button type="button" className="button-ghost button-small" onClick={() => { setError(""); setLoading(true); setReload((value) => value + 1); }}>Tentar novamente</Button></div>}
    <p className="sr-only" aria-live="polite">{notice}</p>
    {(syncStatus.pending > 0 || syncStatus.error) && <p className="tasks-sync" role="status">{syncStatus.error ?? `${syncStatus.pending} alteração(ões) aguardando sincronização.`}{store.sync && <button type="button" onClick={() => void store.sync?.().then(() => setSyncStatus(store.status?.() ?? { pending: 0, error: null })).catch(() => undefined)}>Sincronizar</button>}</p>}
    {!archive && <label className="tasks-mobile-column">Etapa das tarefas<select className="input" value={mobileColumn} onChange={(event) => setMobileColumn(event.target.value as TaskCard["column"])}>{TASK_COLUMNS.map((column) => <option key={column.id} value={column.id}>{column.label} ({filtered.filter((card) => card.column === column.id).length})</option>)}</select></label>}
    {loading ? <p className="muted" role="status">Carregando tarefas…</p> : <div className={`tasks-board${archive ? " is-archive" : ""}`} aria-label={archive ? "Arquivo de tarefas" : "Quadro de tarefas"}>
      {(archive ? [{ id: "archive", label: "Arquivo" }] : TASK_COLUMNS).map((column) => {
        const items = filtered.filter((card) => archive || card.column === column.id);
        return <section className={`tasks-column${!archive && mobileColumn === column.id ? " is-mobile-active" : ""}`} key={column.id} aria-label={column.label} onDragOver={(event) => { if (dragId && !archive) event.preventDefault(); }} onDrop={(event) => { event.preventDefault(); const card = cards.find((item) => item.id === dragId); if (card && !archive) requestMove(card, column.id as TaskCard["column"]); setDragId(null); }}><div className="tasks-column-heading"><h3>{column.label}</h3><span>{items.length}</span></div>
          {items.length === 0 && <p className="tasks-empty">{hasFilters ? "Nenhuma tarefa com esses filtros." : archive ? "Nenhuma tarefa arquivada." : "Nenhuma tarefa nesta etapa."}</p>}
          {items.map((card) => <article className={`task-card${isTaskOverdue(card, today()) ? " is-overdue" : ""}`} key={card.id} onDragOver={(event) => { if (dragId && dragId !== card.id && !archive) { event.preventDefault(); event.stopPropagation(); } }} onDrop={(event) => { if (archive || dragId === card.id) return; event.preventDefault(); event.stopPropagation(); const moved = cards.find((item) => item.id === dragId); const siblings = ordered.filter((item) => item.column === card.column && !item.archived_at && item.id !== dragId); const index = siblings.findIndex((item) => item.id === card.id); const before = siblings[index - 1]; if (moved) requestMove(moved, card.column, before ? (before.position + card.position) / 2 : card.position - 1000); setDragId(null); }}>
            <div className="task-card-title"><button type="button" className="task-title-button" onClick={() => edit(card)}>{card.title}</button>{!archive && <span className="task-drag-handle" draggable={!busy} role="img" aria-label={`Arrastar ${card.title}; use Mover para como alternativa`} onDragStart={(event) => { if (busy) { event.preventDefault(); return; } setDragId(card.id); event.dataTransfer.setData("text/plain", card.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={() => setDragId(null)}><GripVertical size={17} aria-hidden="true" /></span>}</div>
            <div className="task-card-meta">{card.kind === "problem" && <span>Problema</span>}{card.priority !== "normal" && <span className={`task-priority-${card.priority}`}>{priorities[card.priority]}</span>}{card.due_date && <time dateTime={card.due_date}>{isTaskOverdue(card, today()) ? "Atrasada · " : ""}{new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" }).format(new Date(`${card.due_date}T12:00:00Z`))}</time>}{card.checklist.length > 0 && <span>{card.checklist.filter((item) => item.done).length}/{card.checklist.length} itens</span>}{card.category && <span>{card.category}</span>}</div>
            {!archive && <div className="task-card-actions"><select className="input" aria-label={`Mover ${card.title} para`} value={card.column} disabled={busy} onChange={(event) => requestMove(card, event.target.value as TaskCard["column"])}>{TASK_COLUMNS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><button type="button" disabled={busy || ordered.filter((item) => item.column === card.column && !item.archived_at)[0]?.id === card.id} aria-label={`Subir ${card.title}`} onClick={() => reorder(card, -1)}><ArrowUp size={15} /></button><button type="button" disabled={busy || ordered.filter((item) => item.column === card.column && !item.archived_at).at(-1)?.id === card.id} aria-label={`Descer ${card.title}`} onClick={() => reorder(card, 1)}><ArrowDown size={15} /></button></div>}
          </article>)}
        </section>;
      })}
    </div>}
    <Modal open={draft !== null} title={draftExists ? "Editar tarefa" : "Nova tarefa"} onClose={() => { if (!busy) setDraft(null); }} className="task-editor-modal">
      {draft && <form className="task-editor" onSubmit={submit}><fieldset disabled={busy}>
        <label>Título<Input required maxLength={160} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label>Descrição<textarea className="input" rows={3} maxLength={10000} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
        <div className="task-editor-grid"><label>Tipo<select className="input" value={draft.kind} onChange={(event) => setDraft({ ...draft, kind: event.target.value as TaskCard["kind"] })}><option value="task">Tarefa</option><option value="problem">Problema</option></select></label><label>Prioridade<select className="input" value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as TaskCard["priority"] })}>{Object.entries(priorities).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label>Prazo<Input type="date" value={draft.due_date ?? ""} onChange={(event) => setDraft({ ...draft, due_date: event.target.value || null })} /></label><label>Categoria<select className="input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option value="">Sem categoria</option>{categories.map((value) => <option key={value}>{value}</option>)}</select></label></div>
        <section className="task-checklist"><h3>Checklist <small>{draft.checklist.filter((item) => item.done).length}/{draft.checklist.length}</small></h3>{draft.checklist.map((item, index) => <div className="task-checklist-row" key={item.id}><input type="checkbox" checked={item.done} aria-label={item.text} onChange={(event) => setDraft({ ...draft, checklist: draft.checklist.map((entry) => entry.id === item.id ? { ...entry, done: event.target.checked } : entry) })} /><Input aria-label={`Texto do item ${index + 1}`} value={item.text} maxLength={300} onChange={(event) => setDraft({ ...draft, checklist: draft.checklist.map((entry) => entry.id === item.id ? { ...entry, text: event.target.value } : entry) })} /><button type="button" aria-label={`Remover item ${index + 1}`} onClick={() => setDraft({ ...draft, checklist: draft.checklist.filter((entry) => entry.id !== item.id) })}>×</button></div>)}<div className="task-checklist-add"><Input aria-label="Novo item do checklist" placeholder="Adicionar uma etapa" maxLength={300} value={newItem} onChange={(event) => setNewItem(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); addItem(); } }} /><Button type="button" className="button-ghost button-small" onClick={addItem} disabled={!newItem.trim() || draft.checklist.length >= 50}>Adicionar item</Button></div></section>
        {draft.kind === "problem" && <label>Resolução<textarea className="input" rows={2} maxLength={2000} placeholder="Como o problema foi resolvido" value={draft.resolution} onChange={(event) => setDraft({ ...draft, resolution: event.target.value })} /></label>}
        {draftError && <p className="form-error" role="alert">{draftError}</p>}
        {draftExists && <div className="task-editor-secondary"><Button type="button" className="button-ghost button-small" onClick={() => { const duplicate = { ...clone(draft), id: crypto.randomUUID(), title: `${draft.title.slice(0, 150)} (cópia)`, column: "todo" as const, completed_at: null, archived_at: null, checklist: draft.checklist.map((item) => ({ ...item, id: crypto.randomUUID(), done: false })), due_date: null, created_at: new Date().toISOString() }; setDraft(duplicate); }}>Duplicar</Button><Button type="button" className="button-ghost button-small" onClick={() => { void persist({ ...draft, archived_at: draft.archived_at ? null : new Date().toISOString() }).then(() => setDraft(null)).catch(() => undefined); }}>{draft.archived_at ? "Restaurar" : "Arquivar"}</Button>{draft.archived_at && <Button type="button" className="button-ghost button-small task-delete-button" onClick={() => setConfirm({ type: "delete", card: draft })}>Excluir definitivamente</Button>}</div>}
        <div className="form-actions"><Button type="button" className="button-ghost" onClick={() => setDraft(null)}>Cancelar</Button><Button type="submit">{busy ? "Salvando…" : "Salvar tarefa"}</Button></div>
      </fieldset></form>}
    </Modal>
    <ConfirmDialog open={confirm !== null} title={confirm?.type === "delete" ? "Excluir tarefa" : "Concluir com itens pendentes"} confirmLabel={confirm?.type === "delete" ? "Excluir" : "Concluir mesmo assim"} danger={confirm?.type === "delete"} onClose={() => setConfirm(null)} onConfirm={async () => { if (!confirm) return; if (confirm.type === "delete") { await store.remove(confirm.card.id); setCards((current) => current.filter((item) => item.id !== confirm.card.id)); setDraft(null); setNotice("Tarefa excluída."); } else { await persist(confirm.card); setDraft(null); } }}><p>{confirm?.type === "delete" ? "A tarefa será excluída definitivamente. Esta ação não pode ser desfeita." : "Ainda há itens não concluídos no checklist. Deseja concluir a tarefa mantendo esses itens pendentes?"}</p></ConfirmDialog>
  </div>;
}

export default function TasksPage() { return <AuthGuard>{(user) => <Shell user={user}><TasksContent key={user.id} /></Shell>}</AuthGuard>; }
