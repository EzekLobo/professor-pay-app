import { describe, expect, it } from "vitest";
import { classifyOperationError, operationErrorReference, safeOperationPath, validateOperationLog } from "./operation-log";
const id = "12345678-1234-1234-1234-123456789abc";
describe("contrato de diagnóstico", () => {
  it("aceita somente campos técnicos limitados, sem mensagens ou dados do aluno", () => {
    expect(validateOperationLog({ id, operation: "kodland_sync", status: "success", counts: { activities: 2 }, durationMs: 150 })).toMatchObject({ counts: { activities: 2 } });
    for (const extra of [{ password: "secret" }, { message: "Olá Ana" }, { stack: "private stack" }, { metadata: { token: "x" } }, { userId: "another-user" }]) expect(() => validateOperationLog({ id, operation: "kodland_sync", status: "error", ...extra })).toThrow();
    expect(() => validateOperationLog({ id, operation: "kodland_sync", status: "error", counts: { studentName: "Ana" } })).toThrow();
  });
  it("rejeita caminhos com parâmetros, códigos arbitrários e valores fora dos limites", () => {
    for (const extra of [{ pathname: "/corrections?student=Ana" }, { reference: "email@example.test" }, { errorCode: "secret" }, { durationMs: -1 }, { counts: { pending: 1e9 } }]) expect(() => validateOperationLog({ id, operation: "kodland_sync", status: "error", ...extra })).toThrow();
    expect(safeOperationPath("/private/token")).toBeUndefined(); expect(safeOperationPath("/tasks")).toBe("/tasks");
  });
  it("classifica o erro sem retornar seu conteúdo sensível", () => {
    const error = new Error("network failed: password=secret token=private ana@example.test");
    expect(classifyOperationError(error)).toBe("network");
    expect(classifyOperationError({ status: 429 })).toBe("rate_limited");
    expect(classifyOperationError(new Error("A sincronização Kodland está incompleta"))).toBe("sync_incomplete");
    expect(operationErrorReference({ syncId: id })).toBe(id); expect(operationErrorReference({ syncId: "secret" })).toBeUndefined();
  });
});
