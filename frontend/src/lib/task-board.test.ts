import { describe, expect, it } from "vitest";
import { createTaskCard, validateTaskCard, isTaskOverdue, defaultTaskLists, validateTaskLists, planTaskListChange, recoverTaskLists } from "./task-board";
describe("domínio de tarefas", () => {
  it("considera atraso só em tarefas abertas e não arquivadas", () => {
    const card = createTaskCard({ title: "Preparar aula", due_date: "2026-10-26" });
    expect(isTaskOverdue(card, "2026-10-26")).toBe(false);
    expect(isTaskOverdue(card, "2026-10-27")).toBe(true);
    expect(isTaskOverdue({ ...card, column: "done", completed_at: new Date().toISOString() }, "2026-10-27")).toBe(false);
    expect(isTaskOverdue({ ...card, archived_at: new Date().toISOString() }, "2026-10-27")).toBe(false);
  });
  it.each([{ due_date: "2026-02-30" }, { title: " " }, { title: "x".repeat(161) }, { id: "../other" }, { position: Infinity }])("rejeita registros inválidos %j", (patch) => {
    expect(() => validateTaskCard(createTaskCard({ title: "Teste", ...patch }))).toThrow();
  });
  it("não aceita IDs repetidos no checklist e elimina campos não permitidos", () => {
    const card = createTaskCard({ title: "Teste", checklist: [{ id: "a", text: "Item", done: false }, { id: "a", text: "Outro", done: true }] });
    expect(() => validateTaskCard(card)).toThrow();
    expect(validateTaskCard({ ...card, checklist: [], secret: "não persistir" })).not.toHaveProperty("secret");
  });
});

describe("listas personalizadas", () => {
  it("preserva IDs ao renomear e não exige as quatro listas iniciais", () => {
    const lists = defaultTaskLists().filter((list) => list.id !== "waiting");
    lists[0].label = "Planejar";
    expect(validateTaskLists(lists)).toHaveLength(3);
    expect(validateTaskLists(lists)[0].id).toBe("todo");
    expect(validateTaskLists([])).toEqual([]);
  });
  it("recusa listas inválidas ou com IDs duplicados", () => {
    expect(() => validateTaskLists([defaultTaskLists()[0], defaultTaskLists()[0]])).toThrow();
    expect(() => validateTaskLists([{ ...defaultTaskLists()[0], label: " " }])).toThrow();
  });
  it("move todas as tarefas ao apagar uma lista, preservando arquivo e checklist", () => {
    const card = createTaskCard({ title: "Preservar", column: "waiting", archived_at: new Date().toISOString(), checklist: [{ id: "item", text: "Revisar", done: false }] });
    const result = planTaskListChange(defaultTaskLists().filter((list) => list.id !== "waiting"), [card], [{ id: "waiting", target: "todo" }]);
    expect(result.changes[0]).toMatchObject({ id: card.id, column: "todo", archived_at: card.archived_at, checklist: card.checklist });
    expect(result.removedIds).toEqual([]);
    expect(() => planTaskListChange([], [card], [])).toThrow();
  });
  it("só exclui tarefas da lista explicitamente selecionada", () => {
    const card = createTaskCard({ title: "Excluir", column: "waiting" });
    const other = createTaskCard({ title: "Manter" });
    const result = planTaskListChange(defaultTaskLists().filter((list) => list.id !== "waiting"), [card, other], [{ id: "waiting", target: null }]);
    expect(result.removedIds).toEqual([card.id]);
  });
  it("usa a função da lista, e não seu nome ou ID, para a conclusão", () => {
    const card = createTaskCard({ title: "Concluir", column: "custom" });
    const list = { id: "custom", label: "Finalizadas", role: "done" as const, position: 0, archived_at: null };
    const done = planTaskListChange([list], [card], []).changes[0];
    expect(done.completed_at).toBeTruthy();
    expect(isTaskOverdue({ ...done, due_date: "2026-01-01" }, "2026-10-26")).toBe(false);
    expect(planTaskListChange([{ ...list, role: "open" }], [done], []).changes[0].completed_at).toBe(null);
  });
  it("recupera listas ausentes sem esconder tarefas antigas", () => {
    const card = createTaskCard({ title: "Antiga", column: "missing" });
    expect(recoverTaskLists([], [card])[0].id).toBe("missing");
  });
});
