import { describe, expect, it } from "vitest";
import { createTaskCard, validateTaskCard, isTaskOverdue } from "./task-board";
describe("domínio de tarefas", () => {
  it("considera atraso só em tarefas abertas e não arquivadas", () => {
    const card = createTaskCard({ title: "Preparar aula", due_date: "2026-10-26" });
    expect(isTaskOverdue(card, "2026-10-26")).toBe(false);
    expect(isTaskOverdue(card, "2026-10-27")).toBe(true);
    expect(isTaskOverdue({ ...card, column: "done" }, "2026-10-27")).toBe(false);
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
