import { expect, it } from "vitest";
import { studentContactCard } from "./student-contact-card";
it("exports an escaped contact with a normalized mobile number", () => {
  const card = studentContactCard("Aluno; Silva\nContato", "(11) 98765-4321")!;
  expect(decodeURIComponent(card.href)).toContain("FN:Aluno\\; Silva\\nContato\r\nTEL;TYPE=CELL:+5511987654321\r\n");
  expect(card.filename).toMatch(/\.vcf$/);
});
it("does not create unusable contacts", () => { expect(studentContactCard("Aluno", "")).toBeNull(); expect(studentContactCard("Aluno", "123")).toBeNull(); });
