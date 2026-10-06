import { describe, expect, it } from "vitest";
import type { KodlandStudent } from "@/lib/api";
import {
  activeStudentsRankedByPoints,
  kodlandStudentPoints,
} from "@/lib/student-ranking";

const student = (
  name: string,
  status: string,
  progress_summary: string,
): KodlandStudent => ({
  id: name,
  external_id: name,
  name,
  email: "",
  phone: "",
  status,
  progress_summary,
  profile_url: "",
  external_class_id: "group-1",
  external_class_name: "Turma teste",
  local_note: "",
  guardian_name: "",
  guardian_relationship: "",
  guardian_phone: "",
  guardian_email: "",
  guardian_note: "",
  hidden: false,
  created_at: "",
});

describe("activeStudentsRankedByPoints", () => {
  it("ranks active students by earned progress points and breaks ties by name", () => {
    const ranked = activeStudentsRankedByPoints([
      student("Carlos", "active", "50/100"),
      student("Bruno", "active", "80/100"),
      student("Ana", "active", "80/100"),
      student("Davi", "active", ""),
    ]);

    expect(ranked.map((item) => item.name)).toEqual(["Ana", "Bruno", "Carlos", "Davi"]);
  });

  it("excludes expelled, removed and inactive students", () => {
    const ranked = activeStudentsRankedByPoints([
      student("Ativo", "active", "10/100"),
      student("Removido", "student_churned", "500/500"),
      student("Inativo", "inactive", "100/100"),
    ]);

    expect(ranked.map((item) => item.name)).toEqual(["Ativo"]);
  });

  it("reads earned points from the synchronized progress summary", () => {
    expect(kodlandStudentPoints("480/6031")).toBe(480);
    expect(kodlandStudentPoints("12.5/20")).toBe(12.5);
    expect(kodlandStudentPoints("")).toBe(0);
    expect(kodlandStudentPoints("sem progresso")).toBe(0);
  });
});
