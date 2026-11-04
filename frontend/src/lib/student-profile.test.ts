import { describe, expect, it } from "vitest";
import { parseGuardianContact, parseStudentContact, parseStudentLessonCredits, studentLessonCreditsPatch } from "./student-profile";

describe("student profile contact parser", () => {
  it("keeps student contacts separate from the responsible contact", () => {
    expect(parseStudentContact({ main_info: { full_name: "Aluno", phone: "111", email: "aluno@example.test", parent: { name: "Responsável", phone: "222" } } })).toEqual({ name: "Aluno", phone: "111", email: "aluno@example.test" });
  });
  it("reads flat parent fields and ignores unrelated profile data", () => {
    expect(parseGuardianContact({
      main_info: {
        parent_full_name: "Mariana Vogel",
        parent_phone: "+55 11 99999-0000",
        parent_email: "mariana@example.test",
        country: "BR",
        password: "must-not-be-kept",
      },
    })).toEqual({
      name: "Mariana Vogel",
      relationship: "",
      phone: "+55 11 99999-0000",
      email: "mariana@example.test",
    });
  });

  it("accepts nested family and parent aliases", () => {
    expect(parseGuardianContact({
      mainInfo: {
        family: {
          student: { name: "Aluno Teste", phone: "11888880000" },
          parent: {
            full_name: "Claudio Freitas",
            relationship: "Pai",
            phone: "11999990000",
            email: "claudio@example.test",
            country: "BR",
          },
        },
      },
    })).toEqual({
      name: "Claudio Freitas",
      relationship: "Pai",
      phone: "11999990000",
      email: "claudio@example.test",
    });
  });

  it("keeps absent fields empty and does not treat the student's contact as a guardian", () => {
    expect(parseGuardianContact({
      main_info: { full_name: "Aluno Teste", email: "aluno@example.test", phone: "11988880000" },
    })).toEqual({ name: "", relationship: "", phone: "", email: "" });
  });

  it("accepts the plural aliases used by the family profile section", () => {
    expect(parseGuardianContact({
      main_info: {
        parents_full_name: "Mona Lisa Cartaxo",
        parents_phone_number: "+5583996154182",
        parents_email: "mona@example.test",
      },
    })).toEqual({
      name: "Mona Lisa Cartaxo",
      relationship: "",
      phone: "+5583996154182",
      email: "mona@example.test",
    });
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
