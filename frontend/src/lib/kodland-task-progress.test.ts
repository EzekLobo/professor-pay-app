import { expect, it } from "vitest";
import { kodlandDeliveryState, validateKodlandTaskProgress } from "./kodland-task-progress";

it("preserves an official ungraded assignment through persistence validation", () => {
  const record = { id: "g-s-l-t", external_class_id: "g", external_student_id: "s", lesson_id: "l", task_id: "t", task_title: "Leitura", state: kodlandDeliveryState("TASK_NOT_GRADED") };
  expect(record.state).toBe("not_graded");
  expect(validateKodlandTaskProgress(JSON.parse(JSON.stringify(record)))).toEqual(record);
  expect(kodlandDeliveryState("NEW_PROVIDER_CODE")).toBe("unknown");
  expect(validateKodlandTaskProgress({ ...record, task_url: "https://learn.kodland.org/pt/task/t/check/s" }).task_url).toBe("https://learn.kodland.org/pt/task/t/check/s");
  expect(validateKodlandTaskProgress({ ...record, task_url: "javascript:alert(1)" })).not.toHaveProperty("task_url");
});
