import { describe, expect, it } from "vitest";
import { kodlandExtraSchedulePresentation } from "./kodland-extra-status";

describe("kodlandExtraSchedulePresentation", () => {
  it("mostra como realizada uma extra confirmada", () => {
    expect(
      kodlandExtraSchedulePresentation({
        completed: true,
        status: "rescheduled",
      }),
    ).toEqual({ state: "completed", label: "Extra realizada" });
  });

  it.each(["rescheduled", "postponed", "moved", "Adiado", "Reagendado", "Approved"])(
    "mantém %s como pendente até a realização",
    (status) => {
      expect(kodlandExtraSchedulePresentation({ completed: false, status })).toEqual({
        state: "pending",
        label: "Extra pendente",
      });
    },
  );

  it("prioriza o status manual definido pelo professor", () => {
    expect(
      kodlandExtraSchedulePresentation({
        completed: false,
        status: "Approved",
        manual_status: "DONE",
      }),
    ).toEqual({ state: "done", label: "Extra realizada" });
    expect(
      kodlandExtraSchedulePresentation({
        completed: true,
        status: "Completed",
        manual_status: "ACCOUNTED",
      }),
    ).toEqual({ state: "done", label: "Extra realizada" });
  });
});
