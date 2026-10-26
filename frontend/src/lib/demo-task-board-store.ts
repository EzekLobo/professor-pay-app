import { createTaskCard, defaultTaskLists, sortTaskCards, validateTaskCard, validateTaskLists, type TaskList, type TaskBoardStore, type TaskCard } from "@/lib/task-board";
export const DEMO_TASK_BOARD_KEY = "nexusclass.demo.task-board.v1";
const listeners = new Set<() => void>();
type Board = { cards: TaskCard[]; lists: TaskList[] };
let memory: Board | null = null;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
function seed(): Board {
  return { lists: defaultTaskLists(), cards: [
    createTaskCard({ id: "demo-task-prepare", title: "Preparar a próxima aula", category: "Aula", position: 1000, checklist: [{ id: "demo-check-guide", text: "Revisar o guia da aula", done: true }, { id: "demo-check-project", text: "Testar o projeto", done: false }] }),
    createTaskCard({ id: "demo-task-access", title: "Resolver acesso de um aluno", kind: "problem", priority: "high", category: "Técnico", column: "waiting", position: 1000, description: "Aguardando retorno do suporte." }),
  ] };
}
function read(): Board {
  const serialized = window.localStorage.getItem(DEMO_TASK_BOARD_KEY);
  if (serialized) {
    const data = JSON.parse(serialized);
    return { cards: (Array.isArray(data) ? data : data.cards).map(validateTaskCard), lists: Array.isArray(data) ? defaultTaskLists() : validateTaskLists(data.lists) };
  }
  memory ??= seed();
  return copy(memory);
}
function write(board: Board) {
  window.localStorage.setItem(DEMO_TASK_BOARD_KEY, JSON.stringify(board));
  memory = copy(board); listeners.forEach((listener) => listener());
}
export function resetDemoTaskBoard() { write(seed()); }
export const demoTaskBoardStore: TaskBoardStore = {
  list: async () => sortTaskCards(read().cards),
  columns: async () => read().lists,
  updateLists: async (lists, changes, removedIds) => {
    const board = read();
    write({ lists: validateTaskLists(lists), cards: [...board.cards.filter((card) => !removedIds.includes(card.id) && !changes.some((item) => item.id === card.id)), ...changes.map(validateTaskCard)] });
  },
  save: async (input) => {
    const card = validateTaskCard(input); const board = read();
    write({ ...board, cards: sortTaskCards([...board.cards.filter((existing) => existing.id !== card.id), card]) });
    return card;
  },
  remove: async (id) => {
    const board = read();
    if (!/^[A-Za-z0-9_-]{1,120}$/.test(id)) throw new Error("Tarefa inválida.");
    write({ ...board, cards: board.cards.filter((card) => card.id !== id) });
  },
  status: () => ({ pending: 0, error: null }),
  subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
