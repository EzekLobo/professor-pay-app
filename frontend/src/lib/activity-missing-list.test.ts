import { describe, expect, it } from "vitest";
import { missingActivityList, missingActivityMessage } from "./activity-missing-list";
import type { NotificationSource } from "./student-notification-source";
import type { NotificationLesson, NotificationObligation } from "./student-notification-rules";
const target = { source: "kodland" as const, class_id: "a", student_id: "s" };
const lesson = (id: string, label: string, date: string): NotificationLesson => ({ ...target, occurrence_id: id, lesson_label: label, lesson_date: date, ended_at: `${date}T15:00:00Z`, active: true, cancelled: false, attendance: "other", class_name: "A", student_name: "S", guardian_name: "", guardian_phone: "" });
const obligation = (id: string, occurrence_id: string, extra: Partial<NotificationObligation> = {}): NotificationObligation => ({ ...target, id, occurrence_id, title: id, kind: "classroom", state: "missing", required: true, exempt: false, due_at: null, ...extra });
const source = (obligations: NotificationObligation[]): NotificationSource => ({ lessons: [lesson("old", "M1L2", "2026-10-01"), lesson("current", "M2L1", "2026-10-02"), lesson("future", "M3L1", "2099-01-01")], obligations, warnings: [], loaded_at: "" });
const now = new Date("2026-10-31T18:00:00Z");
describe("listagem de não entregas para mensagem", () => {
 it("usa módulo da última aula, mesmo sem pendência nele, e não o futuro", () => {
  const data = source([obligation("old-task","old")]);
  data.lessons.push({ ...lesson("later-today", "M4L1", "2026-10-31"), ended_at: "2026-10-31T23:00:00Z" });
  expect(missingActivityList(data,target,now).currentModule).toBe("2");
 });
 it("isola turma/aluno e exclui entrega, desconhecido, dispensa, opcional, futuro e duplicatas", () => {
  const valid = obligation("valid","current");
  const result = missingActivityList(source([valid,valid, obligation("delivered","current",{state:"delivered"}),obligation("unknown","current",{state:"unknown"}),obligation("exempt","current",{exempt:true}),obligation("optional","current",{required:false}),obligation("other-student","current",{student_id:"x"}),obligation("other-class","current",{class_id:"b"}),obligation("future","future")]),target,now);
  expect(result.items.map(item=>item.id)).toEqual(["valid"]);
 });
 it("filtra módulo específico e todos com identificação de aula", () => {
  const data = missingActivityList(source([obligation("one","old"),obligation("two","current")]),target,now);
  expect(missingActivityMessage(data.items,"2")).toContain("M2L1 — two");
  expect(missingActivityMessage(data.items,"2")).not.toContain("one");
  expect(missingActivityMessage(data.items,"all")).toContain("M1L2 — one");
  expect(missingActivityMessage(data.items,"3")).toBe("");
 });
 it("não inventa um módulo quando a aula não tem código e ignora aulas canceladas", () => {
  const data = source([obligation("one","current")]); data.lessons[1].lesson_label="Aula sem código";
  expect(missingActivityList(data,target,now).currentModule).toBe("unknown");
  data.lessons[1].cancelled=true;
  expect(missingActivityList(data,target,now).items).toEqual([]);
 });
});
