import { describe, expect, it } from "vitest";
import { planClassCsvRows, validateStudentCsvRows } from "./manual-csv";

const base = {
  grupo: "Segunda", nome: "Python", data_inicio: "2026-10-05", data_fim: "",
  dia_semana: "1", horario: "18:00", duracao_minutos: "60", tarifa_hora: "50,00",
  dia_pagamento: "15", curso: "Python", emails_alunos: "ana@example.com",
};

describe("planejamento da importação CSV", () => {
  it("reúne várias linhas de horários em uma única turma", () => {
    const result = planClassCsvRows(
      [base, { ...base, dia_semana: "3", horario: "19:00" }],
      [{ id: "student-1", email: "ana@example.com" }],
      [{ id: "course-1", name: "Python" }],
    );
    expect(result.errors).toEqual([]);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].schedules).toHaveLength(2);
  });

  it("detecta todas as inconsistências antes da gravação", () => {
    const result = planClassCsvRows(
      [{ ...base, data_inicio: "inválida", horario: "25:00", emails_alunos: "ausente@example.com" }],
      [],
      [{ id: "course-1", name: "Python" }],
    );
    expect(result.errors).toHaveLength(3);
  });

  it("rejeita situação e e-mail inválidos de alunos", () => {
    expect(validateStudentCsvRows([{ nome: "Ana", email: "x", situacao: "talvez" }])).toHaveLength(2);
  });
});
