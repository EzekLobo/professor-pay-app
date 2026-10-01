import { describe, expect, it } from "vitest";
import { parseGuardianContact } from "./student-profile";

describe("student profile contact parser", () => {
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
