export const TASK_COLUMNS = [
  { id: "todo", label: "A fazer" },
  { id: "doing", label: "Em andamento" },
  { id: "waiting", label: "Aguardando" },
  { id: "done", label: "Concluído" },
] as const;
export type TaskColumn = (typeof TASK_COLUMNS)[number]["id"];
export type TaskPriority = "low" | "normal" | "high" | "urgent";
export type TaskKind = "task" | "problem";
export type TaskCard = {
  id: string; title: string; description: string; kind: TaskKind; priority: TaskPriority;
  category: string; due_date: string | null; column: TaskColumn; position: number;
  checklist: Array<{ id: string; text: string; done: boolean }>;
  resolution: string; archived_at: string | null; completed_at: string | null;
  created_at: string; updated_at: string;
};
export type TaskSyncState = { pending: number; error: string | null };
export type TaskBoardStore = {
  list(): Promise<TaskCard[]>;
  save(card: TaskCard): Promise<TaskCard>;
  remove(id: string): Promise<void>;
  sync?(): Promise<void>;
  status?(): TaskSyncState;
  subscribe?(listener: () => void): () => void;
};

const safeId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_-]{1,120}$/.test(value);
const timestamp = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}T/.test(value) && value.length <= 40 && Number.isFinite(Date.parse(value));
export function isTaskDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function createTaskCard(input: Partial<TaskCard> = {}): TaskCard {
  const now = new Date().toISOString();
  const card: TaskCard = {
    id: crypto.randomUUID(), title: "", description: "", kind: "task", priority: "normal",
    category: "", due_date: null, column: "todo", position: 0, checklist: [], resolution: "",
    archived_at: null, completed_at: null, created_at: now, updated_at: now, ...input,
  };
  if (card.column === "done" && !card.completed_at) card.completed_at = now;
  return card;
}

/** Return a canonical allowlisted record; never persist arbitrary imported fields. */
export function validateTaskCard(input: unknown): TaskCard {
  if (!input || typeof input !== "object") throw new Error("Tarefa inválida.");
  const card = input as Record<string, unknown>;
  const text = (field: string, maximum: number, required = false) => {
    const value = card[field];
    if (typeof value !== "string" || value.trim().length > maximum || (required && !value.trim())) throw new Error(`Informe ${field === "title" ? "um título de até 160 caracteres" : "um conteúdo válido para a tarefa"}.`);
    return value.trim();
  };
  if (!safeId(card.id)) throw new Error("Identificador da tarefa inválido.");
  if (!["task", "problem"].includes(String(card.kind))) throw new Error("Tipo de tarefa inválido.");
  if (!["low", "normal", "high", "urgent"].includes(String(card.priority))) throw new Error("Prioridade inválida.");
  if (!TASK_COLUMNS.some((column) => column.id === card.column)) throw new Error("Etapa da tarefa inválida.");
  if (card.due_date !== null && !isTaskDate(card.due_date)) throw new Error("Informe uma data de prazo válida.");
  if (typeof card.position !== "number" || !Number.isFinite(card.position) || Math.abs(card.position) > Number.MAX_SAFE_INTEGER) throw new Error("Posição da tarefa inválida.");
  if (!timestamp(card.created_at) || !timestamp(card.updated_at) || (card.completed_at !== null && !timestamp(card.completed_at)) || (card.archived_at !== null && !timestamp(card.archived_at))) throw new Error("Datas da tarefa inválidas.");
  if (!Array.isArray(card.checklist) || card.checklist.length > 50) throw new Error("Use no máximo 50 itens no checklist.");
  const itemIds = new Set<string>();
  const checklist = card.checklist.map((value: unknown) => {
    if (!value || typeof value !== "object") throw new Error("Item de checklist inválido.");
    const item = value as Record<string, unknown>;
    if (!safeId(item.id) || itemIds.has(item.id) || typeof item.text !== "string" || !item.text.trim() || item.text.trim().length > 300 || typeof item.done !== "boolean") throw new Error("Preencha os itens do checklist com até 300 caracteres e IDs únicos.");
    itemIds.add(item.id);
    return { id: item.id, text: item.text.trim(), done: item.done };
  });
  return {
    id: card.id, title: text("title", 160, true), description: text("description", 10000),
    kind: card.kind as TaskKind, priority: card.priority as TaskPriority, category: text("category", 80),
    due_date: card.due_date as string | null, column: card.column as TaskColumn, position: card.position,
    checklist, resolution: text("resolution", 2000), archived_at: card.archived_at as string | null,
    completed_at: card.column === "done" ? (card.completed_at as string | null) ?? card.updated_at : null,
    created_at: card.created_at, updated_at: card.updated_at,
  };
}

export function isTaskOverdue(card: TaskCard, today: string): boolean {
  return !card.archived_at && card.column !== "done" && Boolean(card.due_date && isTaskDate(today) && card.due_date < today);
}
export function sortTaskCards(cards: readonly TaskCard[]) {
  return [...cards].sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
}
