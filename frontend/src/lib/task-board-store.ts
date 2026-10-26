import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, updateDoc } from "firebase/firestore";
import { getFirebaseAuth, getFirebaseDb } from "@/lib/firebase";
import { defaultTaskLists, validateTaskLists, sortTaskCards, validateTaskCard, type TaskList, type TaskBoardStore, type TaskCard } from "@/lib/task-board";
type ListChange = { lists: TaskList[]; changes: TaskCard[]; removedIds: string[] };
type Operation = { board?: ListChange; token: string; id: string; card: TaskCard | null; update?: Partial<TaskCard> };
type Cache = { cards: TaskCard[]; pending: Operation[]; lists?: TaskList[] };
const listeners = new Set<() => void>();
const errors = new Map<string, string>();
const locks = new Map<string, Promise<void>>();
const key = (uid: string) => `nexusclass.tasks.v1.${uid}`;
function owner(expected?: string) {
  const uid = getFirebaseAuth().currentUser?.uid;
  if (!uid || (expected && uid !== expected)) throw new Error("Sua conta foi alterada. Entre novamente.");
  return uid;
}
function read(uid: string): Cache {
  if (typeof window === "undefined") return { cards: [], pending: [] };
  const raw = window.localStorage.getItem(key(uid));
  if (!raw) return { cards: [], pending: [] };
  const data = JSON.parse(raw) as Cache;
  if (!Array.isArray(data.cards) || !Array.isArray(data.pending)) throw new Error("Não foi possível ler as tarefas locais. Preserve o armazenamento deste navegador.");
  return { ...(data.lists ? { lists: validateTaskLists(data.lists) } : {}), cards: data.cards.map(validateTaskCard), pending: data.pending.map((op) => {
    if (!op || typeof op.token !== "string" || !/^[A-Za-z0-9_-]{1,120}$/.test(op.id)) throw new Error("Fila de tarefas inválida.");
    if (op.board) return { token: op.token, id: op.id, card: null, board: { lists: validateTaskLists(op.board.lists), changes: op.board.changes.map(validateTaskCard), removedIds: op.board.removedIds.filter((id) => /^[A-Za-z0-9_-]{1,120}$/.test(id)) } };
    const card = op.card === null ? null : validateTaskCard(op.card);
    const update = card && op.update && typeof op.update === "object" ? Object.fromEntries(Object.entries(card).filter(([field]) => Object.hasOwn(op.update!, field))) as Partial<TaskCard> : undefined;
    return { token: op.token, id: op.id, card, ...(update ? { update } : {}) };
  }) };
}
function write(uid: string, cache: Cache) {
  owner(uid);
  window.localStorage.setItem(key(uid), JSON.stringify({ ...cache, lists: cache.lists ?? read(uid).lists }));
  listeners.forEach((listener) => listener());
}
function apply(cards: TaskCard[], op: Operation) {
  if (op.board) {
    const { changes, removedIds } = op.board;
    return [...cards.filter((card) => !removedIds.includes(card.id) && !changes.some((change) => change.id === card.id)), ...changes];
  }
  const rest = cards.filter((card) => card.id !== op.id);
  return op.card ? [...rest, op.card] : rest;
}
async function exclusive<T>(name: string, action: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(name, action);
  return action();
}
async function mutate(uid: string, change: (cache: Cache) => Cache) {
  return exclusive(`tasks-local-${uid}`, async () => { owner(uid); write(uid, change(read(uid))); });
}
async function sync(uid = owner()): Promise<void> {
  if (locks.has(uid)) return locks.get(uid);
  const work = exclusive(`tasks-sync-${uid}`, async () => {
    try {
      while (true) {
        owner(uid);
        const op = read(uid).pending[0];
        if (!op) break;
        const reference = doc(getFirebaseDb(), "users", uid, "task_cards", op.id);
        if (op.board) {
          for (const card of op.board.changes) { owner(uid); await updateDoc(doc(getFirebaseDb(), "users", uid, "task_cards", card.id), { column: card.column, completed_at: card.completed_at, archived_at: card.archived_at, updated_at: card.updated_at }); }
          for (const id of op.board.removedIds) { owner(uid); await deleteDoc(doc(getFirebaseDb(), "users", uid, "task_cards", id)); }
          owner(uid);
          await setDoc(doc(getFirebaseDb(), "users", uid, "task_settings", "lists"), { lists: op.board.lists });
        }
        else if (op.card && op.update) await updateDoc(reference, op.update);
        else if (op.card) await setDoc(reference, op.card);
        else await deleteDoc(reference);
        owner(uid);
        await mutate(uid, (current) => ({ ...current, pending: current.pending.filter((item) => item.token !== op.token) }));
      }
      errors.delete(uid);
    } catch (error) {
      errors.set(uid, error instanceof Error ? error.message : "Não foi possível sincronizar as tarefas.");
      throw error;
    } finally { listeners.forEach((listener) => listener()); }
  });
  locks.set(uid, work);
  try { await work; } finally { if (locks.get(uid) === work) locks.delete(uid); }
}
export async function withTaskBoardDataChange<T>(uid: string, action: () => Promise<T>): Promise<T> {
  return exclusive(`tasks-sync-${uid}`, () => exclusive(`tasks-local-${uid}`, async () => {
    owner(uid);
    if (read(uid).pending.length) throw new Error("Sincronize as tarefas pendentes antes de alterar os dados.");
    return action();
  }));
}
export async function assertTaskBoardReadyForDataChange(uid: string) {
  owner(uid);
  if (read(uid).pending.length || locks.has(uid)) throw new Error("Sincronize as tarefas pendentes antes de exportar, importar ou apagar dados.");
}
export function clearTaskBoardLocalState(uid: string) {
  owner(uid);
  if (read(uid).pending.length || locks.has(uid)) throw new Error("Há tarefas pendentes. Sincronize antes de continuar.");
  if (typeof window !== "undefined") window.localStorage.removeItem(key(uid)); errors.delete(uid);
}
export const taskBoardStore: TaskBoardStore = {
  columns: async () => {
    const uid = owner();
    const initial = read(uid);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const snapshot = await Promise.race([getDoc(doc(getFirebaseDb(), "users", uid, "task_settings", "lists")), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 2000); })]);
      owner(uid);
      if (snapshot?.exists()) await mutate(uid, (cache) => ({ ...cache, lists: cache.pending.filter((op) => op.board).at(-1)?.board?.lists ?? (JSON.stringify(cache.lists) !== JSON.stringify(initial.lists) ? cache.lists : undefined) ?? initial.pending.filter((op) => op.board).at(-1)?.board?.lists ?? validateTaskLists(snapshot.data()?.lists) }));
    } catch { owner(uid); } finally { clearTimeout(timer); }
    return read(uid).lists ?? defaultTaskLists();
  },
  updateLists: async (input, changes, removedIds) => {
    const uid = owner(); const lists = validateTaskLists(input);
    const board = { lists, changes: changes.map(validateTaskCard), removedIds };
    if (removedIds.some((id) => !/^[A-Za-z0-9_-]{1,120}$/.test(id))) throw new Error("Tarefa inválida.");
    const op: Operation = { token: crypto.randomUUID(), id: "lists", card: null, board };
    await mutate(uid, (cache) => ({ cards: apply(cache.cards, op), lists, pending: [...cache.pending, op] }));
    void sync(uid).catch(() => undefined);
  },
  list: async () => {
    const uid = owner();
    const cached = read(uid);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const result = await Promise.race([getDocs(collection(getFirebaseDb(), "users", uid, "task_cards")), new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), 2000); })]);
      owner(uid);
      if (result) {
        const remote = result.docs.map((row) => validateTaskCard({ ...row.data(), id: row.id }));
        await mutate(uid, (current) => {
          const operations = [...cached.pending, ...current.pending.filter((op) => !cached.pending.some((old) => old.token === op.token))];
          return { cards: operations.reduce(apply, remote), pending: current.pending };
        });
      }
    } catch (error) {
      owner(uid);
      if (!cached.cards.length && !cached.pending.length) throw error;
      errors.set(uid, "Sem conexão. Exibindo as tarefas salvas neste navegador.");
    } finally { clearTimeout(timer); }
    void sync(uid).catch(() => undefined);
    return sortTaskCards(read(uid).cards);
  },
  save: async (input) => {
    const uid = owner(); const card = validateTaskCard(input);
    const op = { token: crypto.randomUUID(), id: card.id, card };
    await mutate(uid, (cache) => {
      const base = cache.cards.find((item) => item.id === card.id);
      const update = base ? Object.fromEntries(Object.entries(card).filter(([field, value]) => JSON.stringify(value) !== JSON.stringify(base[field as keyof TaskCard]))) as Partial<TaskCard> : undefined;
      return { cards: apply(cache.cards, op), pending: [...cache.pending, { ...op, ...(update ? { update } : {}) }] };
    });
    void sync(uid).catch(() => undefined);
    return card;
  },
  remove: async (id) => {
    const uid = owner();
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error("Tarefa inválida.");
    const op = { token: crypto.randomUUID(), id, card: null };
    await mutate(uid, (cache) => ({ cards: apply(cache.cards, op), pending: [...cache.pending, op] }));
    void sync(uid).catch(() => undefined);
  },
  sync: () => sync(),
  status: () => { try { const uid = owner(); return { pending: read(uid).pending.length, error: errors.get(uid) ?? null }; } catch { return { pending: 0, error: "Não foi possível acessar as tarefas locais." }; } },
  subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
