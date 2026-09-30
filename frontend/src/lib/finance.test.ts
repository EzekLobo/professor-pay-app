import { describe, expect, it } from "vitest";
import { brlToCents } from "./finance";
describe("brlToCents", () => { it("converte moeda brasileira sem ponto flutuante", () => expect(brlToCents("1.234,56")).toBe(123456)); it("rejeita valores inválidos", () => { expect(brlToCents("1,234")).toBeNull(); expect(brlToCents("-2")).toBeNull(); }); });
