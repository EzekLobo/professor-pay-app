import type { KodlandStudent } from "@/lib/api";

const inactiveStatusMarkers = [
  "expelled",
  "churned",
  "removed",
  "inactive",
  "expulso",
  "removido",
  "inativo",
];

export function isActiveKodlandStudent(status: string | null | undefined) {
  const normalized = String(status ?? "").trim().toLocaleLowerCase("pt-BR");
  return !inactiveStatusMarkers.some((marker) => normalized.includes(marker));
}

export function kodlandStudentPoints(progressSummary: string | null | undefined) {
  const points = Number(String(progressSummary ?? "").trim().split("/")[0]);
  return Number.isFinite(points) && points > 0 ? points : 0;
}

export function activeStudentsRankedByPoints(students: KodlandStudent[]) {
  return students
    .filter((student) => isActiveKodlandStudent(student.status))
    .sort((left, right) => {
      const pointsDifference =
        kodlandStudentPoints(right.progress_summary) -
        kodlandStudentPoints(left.progress_summary);
      return pointsDifference || left.name.localeCompare(right.name, "pt-BR", { sensitivity: "base" });
    });
}
