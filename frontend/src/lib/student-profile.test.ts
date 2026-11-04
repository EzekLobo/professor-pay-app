import { describe, expect, it } from "vitest";
import { parseStudentContact, parseStudentLessonCredits, studentLessonCreditsPatch } from "./student-profile";
import { normalizeStudentName, sanitizeKodlandStudentRecord } from "./student-privacy";

describe("student profile contact parser", () => {
  it("keeps only a normalized student name and phone", () => {
    expect(parseStudentContact({ main_info: { full_name: "  Ana Maria de Souza  ", phone: "111", email: "aluno@example.test", parent: { name: "Responsável", phone: "222" } } })).toEqual({ name: "Ana Souza", phone: "111" });
  });
  it("normalizes names to the first and last token", () => {
    expect(normalizeStudentName("Lucas")).toBe("Lucas");
    expect(normalizeStudentName("Lucas   Couto   Spitler")).toBe("Lucas Spitler");
  });
  it("removes legacy private fields before persistence", () => {
    expect(sanitizeKodlandStudentRecord({ id: "s", name: "Ana Maria de Souza", phone: "111", email: "x@example.test", guardian_name: "Responsável", guardian_phone: "222", local_note: "privado", progress_summary: "3/10" })).toEqual({ id: "s", name: "Ana Souza", phone: "111", progress_summary: "3/10" });
  });
});

describe("student lesson credits", () => {
  it("reads the default lesson wallet only, retaining zero and negative balances", () => {
    expect(parseStudentLessonCredits([{ lesson_type: "MONEY", balance: 999 }, { lesson_type: "DEFAULT_LESSON", balance: "50" }])).toBe(50);
    expect(parseStudentLessonCredits([{ lesson_type: "DEFAULT_LESSON", balance: 0 }])).toBe(0);
    expect(parseStudentLessonCredits([{ lesson_type: "DEFAULT_LESSON", balance: -2 }])).toBe(-2);
  });
  it("does not infer lesson credits from money, absent data or invalid values", () => {
    for (const payload of [null, {}, [], [{ lesson_type: "MONEY", balance: 50 }], [{ lesson_type: "DEFAULT_LESSON", balance: "" }], [{ lesson_type: "DEFAULT_LESSON", balance: false }], [{ lesson_type: "DEFAULT_LESSON", balance: Infinity }]]) expect(parseStudentLessonCredits(payload)).toBeNull();
  });
  it("keeps prior credits when sync omits them and accepts a newly confirmed zero", () => {
    const previous = { lesson_credits_remaining: 5, lesson_credits_updated_at: "old" };
    expect(studentLessonCreditsPatch({}, previous)).toEqual(previous);
    expect(studentLessonCreditsPatch({ lesson_credits_remaining: null }, previous)).toEqual(previous);
    expect(studentLessonCreditsPatch({ lesson_credits_remaining: 0, lesson_credits_updated_at: "new" }, previous)).toEqual({ lesson_credits_remaining: 0, lesson_credits_updated_at: "new" });
    expect(studentLessonCreditsPatch({})).toEqual({});
  });
});
