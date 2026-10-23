import { describe, expect, it } from "vitest";
import type { KodlandGroup, KodlandLesson, KodlandReview, KodlandStudent } from "@/lib/api";
import type { ManualActivity } from "@/lib/manual-pedagogy";
import type { ManualClass, ManualStudent } from "@/lib/manual-teaching";
import { compactActivitiesModel } from "./corrections-page";

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
