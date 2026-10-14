import { describe, expect, it } from "vitest";
import type { KodlandReview } from "./api";
import { correctionUrl, orderedReviews } from "./correction-navigation";

const review = (id: string, student: string, className: string, lesson: number) => ({
  id, student_name: student, external_class_name: className,
  lesson_number: lesson, lesson_title: "Aula",
} as KodlandReview);

describe("correctionUrl", () => {
  it("normaliza links relativos e aceita apenas as duas origens HTTPS da Kodland", () => {
    expect(correctionUrl("/task/123/check/456")).toBe("https://bo.kodland.org/task/123/check/456");
    expect(correctionUrl("https://learn.kodland.org/task/123")).toBe("https://learn.kodland.org/task/123");
    for (const url of ["", "javascript:alert(1)", "http://bo.kodland.org/task", "https://learn.kodland.org.evil.com/task", "//evil.com/task", "https://user:pass@learn.kodland.org/task"]) {
      expect(correctionUrl(url)).toBeNull();
    }
  });
});

describe("orderedReviews", () => {
  const reviews = [review("1", "Bruno", "Turma B", 2), review("2", "Bruno", "Turma A", 2), review("3", "Ana", "Turma A", 1), review("4", "Bruno", "Turma A", 1)];
  it("segue turmas ordenadas e preserva ordem dos cartões dentro delas", () => {
    expect(orderedReviews(reviews, "class").map((item) => item.id)).toEqual(["2", "3", "4", "1"]);
  });
  it("acompanha as subdivisões visuais por aluno e por aula", () => {
    expect(orderedReviews(reviews, "student").map((item) => item.id)).toEqual(["3", "2", "4", "1"]);
    expect(orderedReviews(reviews, "lesson").map((item) => item.id)).toEqual(["3", "4", "2", "1"]);
  });
});
