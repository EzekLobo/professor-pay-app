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
      student("Carlos", "Admitted", "50/100"),
      student("Bruno", "Admitted", "80/100"),
      student("Ana", "Admitido", "80/100"),
      student("Davi", "Admitted", ""),
    ]);

    expect(ranked.map((item) => item.name)).toEqual(["Ana", "Bruno", "Carlos", "Davi"]);
  });

  it("keeps only admitted students", () => {
    const ranked = activeStudentsRankedByPoints([
      student("Admitido", "Admitted", "10/100"),
      student("Removido", "student_churned", "500/500"),
      student("Inativo", "inactive", "100/100"),
      student("Expulso", "expelled", "100/100"),
      student("Trancado", "paused", "100/100"),
      student("Sem status", "", "100/100"),
    ]);

    expect(ranked.map((item) => item.name)).toEqual(["Admitido"]);
  });

  it("reads earned points from the synchronized progress summary", () => {
    expect(kodlandStudentPoints("480/6031")).toBe(480);
    expect(kodlandStudentPoints("12.5/20")).toBe(12.5);
    expect(kodlandStudentPoints("Progresso 1.763/6.031")).toBe(1763);
    expect(kodlandStudentPoints("")).toBe(0);
    expect(kodlandStudentPoints("sem progresso")).toBe(0);
  });
});
