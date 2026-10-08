export type KodlandExtraScheduleState =
  | "completed"
  | "done"
  | "pending";

export type KodlandExtraSchedulePresentation = {
  state: KodlandExtraScheduleState;
  label: string;
};

export const kodlandExtraSchedulePresentation = ({
  completed,
  manual_status,
}: {
  completed: boolean;
  status: string;
  manual_status?: "PENDING" | "ACCOUNTED" | "DONE";
}): KodlandExtraSchedulePresentation => {
  if (manual_status === "DONE" || manual_status === "ACCOUNTED") {
    return { state: "done", label: "Extra realizada" };
  }
  if (manual_status === "PENDING") {
    return { state: "pending", label: "Extra pendente" };
  }
  // The platform can keep an old textual status after completion, so the
  // explicit completion flag always wins over any status label.
  if (completed) return { state: "completed", label: "Extra realizada" };
  return { state: "pending", label: "Extra pendente" };
};
