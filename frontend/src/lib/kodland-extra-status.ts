export type KodlandExtraScheduleState =
  | "completed"
  | "rescheduled"
  | "scheduled"
  | "pending";

export type KodlandExtraSchedulePresentation = {
  state: KodlandExtraScheduleState;
  label: string;
};

const normalizeStatus = (status: string) =>
  status
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase();

export const kodlandExtraSchedulePresentation = ({
  completed,
  status,
}: {
  completed: boolean;
  status: string;
}): KodlandExtraSchedulePresentation => {
  // The platform can keep an old textual status after completion, so the
  // explicit completion flag always wins over any status label.
  if (completed) return { state: "completed", label: "Extra concluída" };

  const normalized = normalizeStatus(status);
  if (/(rescheduled|postponed|moved|adiado|reagendado)/.test(normalized)) {
    return { state: "rescheduled", label: "Extra reagendada" };
  }
  if (/(scheduled|agendad|approved|aprovado)/.test(normalized)) {
    return { state: "scheduled", label: "Extra agendada" };
  }
  return { state: "pending", label: "Extra pendente" };
};
