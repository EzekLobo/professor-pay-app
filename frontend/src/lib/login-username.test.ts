import { describe, expect, it } from "vitest";
import { isEmailLogin, normalizeLoginUsername, validLoginUsername } from "./login-username";

describe("login username", () => {
  it("normalizes and validates supported usernames", () => {
    expect(normalizeLoginUsername("  Professor.Ana ")).toBe("professor.ana");
    expect(validLoginUsername("professor_ana-2")).toBe("professor_ana-2");
  });

  it("rejects ambiguous or unsafe usernames", () => {
    expect(validLoginUsername("ab")).toBe("");
    expect(validLoginUsername("ana@email.com")).toBe("");
    expect(validLoginUsername("ana silva")).toBe("");
    expect(isEmailLogin("ana@email.com")).toBe(true);
    expect(isEmailLogin("ana.silva")).toBe(false);
  });
});
