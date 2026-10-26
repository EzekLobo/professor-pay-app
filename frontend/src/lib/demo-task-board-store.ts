import { createTaskCard, sortTaskCards, validateTaskCard, type TaskBoardStore, type TaskCard } from "@/lib/task-board";

export const DEMO_TASK_BOARD_KEY = "nexusclass.demo.task-board.v1";
const listeners = new Set<() => void>();
let memory: TaskCard[] | null = null;
const copy = (cards: TaskCard[]) => JSON.parse(JSON.stringify(cards)) as TaskCard[];
function seed(): TaskCard[] {
  return [
    createTaskCard({ id: "demo-task-prepare", title: "Preparar a próxima aula", category: "Aulas", position: 1000, checklist: [{ id: "demo-check-guide", text: "Revisar o guia da aula", done: true }, { id: "demo-check-project", text: "Testar o projeto", done: false }] }),
    createTaskCard({ id: "demo-task-access", title: "Resolver acesso de um aluno", kind: "problem", priority: "high", category: "Técnico", column: "waiting", position: 1000, description: "Aguardando retorno do suporte." }),
  ];
}
function read(): TaskCard[] {
  try {
    const serialized = window.localStorage.getItem(DEMO_TASK_BOARD_KEY);
    if (serialized) {
      const data: unknown = JSON.parse(serialized);
      if (Array.isArray(data)) return sortTaskCards(data.map(validateTaskCard));
    }
  } catch { /* Invalid or unavailable local storage uses a session-local scenario. */ }
  memory ??= seed();
  return copy(memory);
}
function write(cards: TaskCard[]) {
  // Do not claim persistence if storage is full or blocked.
  window.localStorage.setItem(DEMO_TASK_BOARD_KEY, JSON.stringify(cards));
  memory = copy(cards);
  listeners.forEach((listener) => listener());
}
export function resetDemoTaskBoard() {
  memory = seed();
  try { window.localStorage.setItem(DEMO_TASK_BOARD_KEY, JSON.stringify(memory)); } catch { /* Reset the session even without storage. */ }
  listeners.forEach((listener) => listener());
}
export const demoTaskBoardStore: TaskBoardStore = {
  list: async () => copy(read()),
  save: async (input) => {
    const card = validateTaskCard(input);
    const cards = read();
    write(sortTaskCards([...cards.filter((existing) => existing.id !== card.id), card]));
    return card;
  },
  remove: async (id) => {
    const cards = read();
    if (cards.some((card) => card.id === id && !card.archived_at)) throw new Error("Arquive a tarefa antes de excluí-la definitivamente.");
    write(cards.filter((card) => card.id !== id));
  },
  status: () => ({ pending: 0, error: null }),
  subscribe: (listener) => { listeners.add(listener); return () => { listeners.delete(listener); }; },
};
