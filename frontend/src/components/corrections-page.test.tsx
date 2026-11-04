import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { KodlandGroup, KodlandLesson, KodlandReview, KodlandStudent } from "@/lib/api";
import type { ManualActivity } from "@/lib/manual-pedagogy";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import { compactActivitiesModel, filterCompactActivitiesModel, CompactActivitiesGrid } from "./corrections-page";

const timestamp = "2026-10-21T12:00:00.000Z";

const group = (overrides: Partial<KodlandGroup> = {}): KodlandGroup => ({
  id: "group-1", external_id: "kodland-1", title: "Turma Kodland", course_name: "Python", student_count: 2,
  start_date: "2026-01-01", next_lesson_date: "2026-10-21", archived: false, local_class_id: null, created_at: timestamp,
  ...overrides,
});
const student = (overrides: Partial<KodlandStudent> = {}): KodlandStudent => ({
  id: "student-1", external_id: "external-student-1", name: "Ana", email: "ana@example.test", phone: "", status: "active",
  progress_summary: "", profile_url: "", external_class_id: "kodland-1", external_class_name: "Turma Kodland",
  local_note: "", guardian_name: "", guardian_relationship: "", guardian_phone: "", guardian_email: "", guardian_note: "",
  hidden: false, created_at: timestamp, ...overrides,
});
const review = (overrides: Partial<KodlandReview> = {}): KodlandReview => ({
  id: "review-1", external_class_id: "kodland-1", external_class_name: "Turma Kodland", external_student_id: "external-student-1",
  student_name: "Ana", lesson_id: "lesson-2", lesson_number: 2, lesson_title: "Laços", module_number: "M1",
  task_id: "task-2", task_number: 2, task_title: "Desafio", status_key: "pending", status_label: "Pendente",
  correction_url: "https://example.test/correction", created_at: timestamp, ...overrides,
});
const lesson = (overrides: Partial<KodlandLesson> = {}): KodlandLesson => ({
  id: "lesson-1", external_class_id: "kodland-1", external_class_name: "Turma Kodland", module_number: "M7",
  lesson_number: 1, course_index: 27, title: "M7.L1 Introdução", theme: "", lesson_date: "2026-10-01",
  start_time: "19:00", end_time: "20:00", status: "planned", lesson_passed: true, external_url: "",
  slides_url: "", guide_url: "", homework_url: "", homework_title: "", classroom_tasks: [], ...overrides,
});
const manualStudent = (overrides: Partial<ManualStudent> = {}): ManualStudent => ({
  id: "manual-student-1", name: "Carla", email: "carla@example.test", phone: "", active: true,
  created_at: timestamp, updated_at: timestamp, ...overrides,
});
const manualClass = (overrides: Partial<ManualClass> = {}): ManualClass => ({
  id: "manual-class-1", source: "manual", name: "Turma particular", first_lesson_date: "2026-01-01", end_date: null,
  schedule_slots: [], rate_history: [], student_ids: ["manual-student-1"], active: true, created_at: timestamp, updated_at: timestamp,
  ...overrides,
});
const manualActivity = (overrides: Partial<ManualActivity> = {}): ManualActivity => ({
  id: "activity-1", class_id: "manual-class-1", student_id: "manual-student-1", occurrence_id: "manual-class-1:5",
  title: "Projeto", description: "", submission_text: "Entrega", submission_url: "", feedback: "", status: "pending",
  created_at: timestamp, updated_at: timestamp, ...overrides,
});

describe("compactActivitiesModel", () => {
  for (const mode of ["complete", "pending", "students"] as const) {
    it(`busca no modo ${mode} restringe alunos e células sem preservar linhas não correspondentes`, () => {
      const input = { groups: [group()], lessons: [lesson()], reviews: [review({ student_name: "Ana Maria" }), review({ id: "other-review", external_student_id: "other", student_name: "Bia Silva", task_id: "other-task", task_title: "Robô" })],
        students: [student({ name: "Ana Maria" }), student({ id: "other", external_id: "other", name: "Bia Silva", email: "bia@example.test" })], manualActivities: [], manualClasses: [], manualStudents: [],
        taskProgress: [{ id: "delivered", external_class_id: "kodland-1", external_student_id: "other", lesson_id: "lesson-1", task_id: "done", task_title: "Pintura", state: "delivered" as const }] };
      const model = compactActivitiesModel({ ...input, complete: mode === "complete", pendingOnly: mode === "pending" });
      const byName = filterCompactActivitiesModel(model, "Ana Maria");
      expect(byName.flatMap(item => item.rows.map(row => row.name))).toEqual(["Ana Maria"]);
      expect(byName[0].rows[0].cells).toEqual(model[0].rows[0].cells);
      const byEmail = filterCompactActivitiesModel(model, "bia@example.test");
      expect(byEmail.flatMap(item => item.rows.map(row => row.name))).toEqual(["Bia Silva"]);
      const byActivity = filterCompactActivitiesModel(model, "robo");
      expect(byActivity.flatMap(item => item.rows.map(row => row.name))).toEqual(["Bia Silva"]);
      expect(Object.values(byActivity[0].rows[0].cells)).toHaveLength(1);
      expect(byActivity[0].columns).toHaveLength(1);
      expect(filterCompactActivitiesModel(model, "nada corresponde")).toEqual([]);
      expect(filterCompactActivitiesModel(model, "Turma Kodland")).toEqual(model);
    });
  }
  it("busca atividades completas em progresso e atividades manuais sem manter alunos estranhos", () => {
    const model = compactActivitiesModel({ groups: [group()], students: [student(), student({ id: "other", external_id: "other", name: "Bia" })], reviews: [], lessons: [lesson()], complete: true,
      taskProgress: [{ id: "done", external_class_id: "kodland-1", external_student_id: "other", lesson_id: "lesson-1", task_id: "done", task_title: "Aquarela", state: "delivered" }],
      manualActivities: [manualActivity({ title: "Aquarela própria" }), manualActivity({ id: "second", title: "Outro exercício" })], manualClasses: [manualClass()], manualStudents: [manualStudent()] });
    const result = filterCompactActivitiesModel(model, "aquarela");
    expect(result.flatMap(item => item.rows.map(row => row.name))).toEqual(["Bia", "Carla"]);
    expect(result.every(item => item.columns.length === 1 && Object.keys(item.rows[0].cells).length === 1)).toBe(true);
  });

  it("modo Alunos mantém nome completo e distingue saldo zero de saldo desconhecido", () => {
    const model = compactActivitiesModel({ groups: [group()], lessons: [], reviews: [], manualActivities: [], manualClasses: [], manualStudents: [], students: [student({ name: "Ana Maria de Souza", lesson_credits_remaining: 0 }), student({ id: "other", external_id: "other", name: "Bia Silva" })] });
    const markup = renderToStaticMarkup(<CompactActivitiesGrid model={model} displayMode="students" onCorrectManual={() => undefined} />);
    expect(markup).toContain("Ana Maria de Souza");
    expect(markup).toContain("0 aulas");
    expect(markup).toContain("Não informado");
    expect(markup).not.toContain("compact-activity-action");
    expect(markup).not.toContain("campos vazios");
  });

  it("mantém progresso explícito por módulo sem inferir entrega pela fila vazia", () => {
    const input = { groups: [group()], students: [student()], reviews: [], lessons: [lesson()], manualActivities: [], manualClasses: [], manualStudents: [],
      taskProgress: (["delivered", "missing", "unknown"] as const).map((state, index) => ({ id: `p${index}`, external_class_id: "kodland-1", external_student_id: "external-student-1", lesson_id: "lesson-1", task_id: `t${index}`, task_title: `Atividade ${index}`, state })) };
    const full = compactActivitiesModel({ ...input, complete: true })[0];
    expect(full.columns.every(column => column.moduleLabel === "M7")).toBe(true);
    expect(Object.values(full.rows[0].cells).map(cell => cell.source === "progress" ? cell.progress.state : "review")).toEqual(["delivered", "missing", "unknown"]);
    expect(full.pendingCount).toBe(0);
    expect(compactActivitiesModel({ ...input, complete: true, pendingOnly: true })).toEqual([]);
    expect(compactActivitiesModel({ ...input, taskProgress: [], complete: true })[0].rows[0].cells).toEqual({});
  });
  it("prioriza correção pendente e une IDs do catálogo ao mesmo campo", () => {
    const model = compactActivitiesModel({ groups: [group()], students: [student()], lessons: [lesson({ source_lesson_id: "catalog-1" })], reviews: [review({ lesson_id: "lesson-1", lesson_number: 27, task_id: "t1" })], manualActivities: [], manualClasses: [], manualStudents: [], complete: true,
      taskProgress: [{ id: "p1", external_class_id: "kodland-1", external_student_id: "external-student-1", lesson_id: "catalog-1", task_id: "t1", task_title: "Atividade", state: "delivered" }] });
    expect(model[0].columns).toHaveLength(1);
    expect(Object.values(model[0].rows[0].cells)[0].source).toBe("kodland");
    expect(model[0].pendingCount).toBe(1);
  });
  it("conta aulas sincronizadas sem total presumido e faltas por turma/aluno sem duplicar", () => {
    const held = lesson({ lesson_passed: true, status: "Scheduled" });
    const model = compactActivitiesModel({ groups: [group()], students: [student()], reviews: [], lessons: [held, held, lesson({ id: "future", lesson_passed: false, status: "Scheduled" }), lesson({ id: "cancelled", status: "cancelled" })], manualActivities: [], manualClasses: [], manualStudents: [],
      attendance: [1, 2].map(index => ({ id: `a${index}`, external_class_id: "kodland-1", external_class_name: "Turma", external_student_id: "external-student-1", student_name: "Ana", lesson_id: "lesson-1", lesson_title: "Aula", lesson_date: "2026-01-01", start_time: "19:00", status: "ABSENT" as const })) });
    expect(model[0]).toMatchObject({ totalLessons: 2, completedLessons: 1, completionPercent: 50 });
    expect(model[0].rows[0].absenceCount).toBe(1);
    expect(compactActivitiesModel({ groups: [group()], students: [], reviews: [], lessons: [], manualActivities: [], manualClasses: [], manualStudents: [] })[0].completionPercent).toBeNull();
  });
  it("modo completo mantém todos os estados manuais e pendências só aceita entregas sem correção", () => {
    const activities = [manualActivity(), manualActivity({ id: "done", title: "Feita", status: "corrected" }), manualActivity({ id: "assigned", title: "A fazer", status: "assigned", submission_text: "" })];
    const input = { groups: [], students: [], reviews: [], lessons: [], manualActivities: activities, manualClasses: [manualClass()], manualStudents: [manualStudent()] };
    const complete = compactActivitiesModel({ ...input, complete: true });
    expect(Object.values(complete[0].rows[0].cells).map(cell => cell.source === "manual" ? cell.activity.status : "other")).toEqual(["pending", "corrected", "assigned"]);
    expect(complete[0].pendingCount).toBe(1);
    expect(Object.keys(compactActivitiesModel({ ...input, complete: true, pendingOnly: true })[0].rows[0].cells)).toHaveLength(1);
  });

  it("remove turmas e alunos sem correções pendentes e mantém seus cadastros no filtro todos", () => {
    const input = { groups: [group(), group({ id: "empty", external_id: "empty", title: "Sem correções" })],
      students: [student(), student({ id: "other", external_id: "other", name: "Sem entrega" })],
      reviews: [review()], lessons: [], manualActivities: [], manualClasses: [manualClass()], manualStudents: [manualStudent()] };
    const pending = compactActivitiesModel({ ...input, pendingOnly: true });
    expect(pending).toHaveLength(1);
    expect(pending[0].rows.map(row => row.name)).toEqual(["Ana"]);
    expect(Object.keys(pending[0].rows[0].cells)).toHaveLength(1);
    expect(compactActivitiesModel(input)).toHaveLength(3);
  });

  it("oculta alunos e células vazias no filtro de pendências para turmas próprias e Kodland", () => {
    const inputs = {
      groups: [group()], lessons: [lesson()], students: [student(), student({ id: "other", external_id: "other", name: "Sem pendência" })],
      reviews: [review()], manualActivities: [manualActivity()],
      manualClasses: [manualClass({ student_ids: ["manual-student-1", "other-manual"] })],
      manualStudents: [manualStudent(), manualStudent({ id: "other-manual", name: "Sem entrega" })],
    };
    const model = compactActivitiesModel({ ...inputs, pendingOnly: true });
    expect(model.flatMap(group => group.rows.map(row => row.name))).toEqual(["Ana", "Carla"]);
    const markup = renderToStaticMarkup(<CompactActivitiesGrid model={model} pendingOnly onCorrectManual={() => undefined} />);
    expect(markup).not.toContain("compact-activity-empty");
    expect(markup).toContain('role="grid"');
    expect(markup).not.toContain('role="columnheader">Aluno');
    expect(markup).toContain("compact-pending-row");
    expect(markup).not.toContain("Sem pendência");
    expect(markup).toContain("Desafio");
    expect(compactActivitiesModel(inputs).flatMap(group => group.rows)).toHaveLength(4);
  });
  it("organiza pendências por turma, aluno e atividade e mantém células vazias para alunos ativos", () => {
    const model = compactActivitiesModel({
      groups: [group()],
      lessons: [
        lesson(),
        lesson({ id: "lesson-2", lesson_number: 2, course_index: 28, title: "M7.L2 Laços" }),
      ],
      students: [student(), student({ id: "student-2", external_id: "external-student-2", name: "Bia" }), student({ id: "student-3", external_id: "external-student-3", name: "Inativa", status: "inactive" })],
      reviews: [
        review(),
        review({ id: "review-2", lesson_id: "lesson-1", lesson_number: 1, task_id: "task-1", task_number: 1, task_title: "Introdução" }),
      ],
      manualActivities: [manualActivity()],
      manualClasses: [manualClass()],
      manualStudents: [manualStudent()],
    });

    const kodland = model.find((item) => item.key === "kodland:kodland-1")!;
    expect(kodland.columns.map((item) => item.lessonLabel)).toEqual(["M7L1", "M7L2"]);
    expect(kodland.rows.map((item) => item.name)).toEqual(["Ana", "Bia"]);
    expect(kodland.rows.find((item) => item.name === "Bia")?.cells).toEqual({});
    expect(kodland.rows.find((item) => item.name === "Ana")?.cells["kodland:lesson-2:task-2"])
      .toMatchObject({ source: "kodland", review: { id: "review-1" } });

    const personal = model.find((item) => item.key === "manual:manual-class-1")!;
    expect(personal.columns).toMatchObject([{ lessonLabel: "Aula 5", taskLabel: "Projeto" }]);
    expect(personal.rows).toMatchObject([{ name: "Carla", cells: { "manual:manual-class-1:5:projeto": { source: "manual" } } }]);
  });
});
