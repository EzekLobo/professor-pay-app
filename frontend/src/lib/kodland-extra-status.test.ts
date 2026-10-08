import { describe, expect, it } from "vitest";
import { kodlandExtraSchedulePresentation } from "./kodland-extra-status";

describe("kodlandExtraSchedulePresentation", () => {
  it("prioriza a confirmação explícita de conclusão", () => {
    expect(
      kodlandExtraSchedulePresentation({
        completed: true,
        status: "rescheduled",
      }),
    ).toEqual({ state: "completed", label: "Extra concluída" });
  });

  it.each(["rescheduled", "postponed", "moved", "Adiado", "Reagendado"])(
    "identifica %s como reagendada",
    (status) => {
      expect(kodlandExtraSchedulePresentation({ completed: false, status })).toEqual({
        state: "rescheduled",
        label: "Extra reagendada",
      });
    },
  );

  it("mantém uma extra aprovada como agendada, e não concluída", () => {
    expect(
      kodlandExtraSchedulePresentation({ completed: false, status: "Approved" }),
    ).toEqual({ state: "scheduled", label: "Extra agendada" });
  });

  it("prioriza o status manual definido pelo professor", () => {
    expect(
      kodlandExtraSchedulePresentation({
        completed: false,
        status: "Approved",
        manual_status: "DONE",
      }),
    ).toEqual({ state: "done", label: "Extra feita" });
    expect(
      kodlandExtraSchedulePresentation({
        completed: true,
        status: "Completed",
        manual_status: "ACCOUNTED",
      }),
    ).toEqual({ state: "accounted", label: "Extra contabilizada" });
  });
});
