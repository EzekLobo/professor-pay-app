const expelledStatuses = ['expelled', 'churned', 'removed', 'inactive', 'expulso', 'removido', 'inativo'];

export function isExpelledStudentStatus(status: string) {
  const normalized = status.trim().toLocaleLowerCase('pt-BR');
  return expelledStatuses.some((item) => normalized.includes(item));
}

export function studentStatusLabel(status: string) {
  return isExpelledStudentStatus(status) ? 'Expulso' : '';
}

export function studentProgressPoints(progressSummary: string) {
  const [completed] = progressSummary.trim().split('/');
  const points = Number(completed);
  return Number.isFinite(points) && points > 0 ? points : 0;
}

export function studentPointsLabel(progressSummary: string) {
  const points = studentProgressPoints(progressSummary);
  return points > 0 ? String(points) : '';
}

export function compareStudentsByStatusThenName<T extends { name: string; status: string }>(left: T, right: T) {
  const leftExpelled = isExpelledStudentStatus(left.status);
  const rightExpelled = isExpelledStudentStatus(right.status);
  if (leftExpelled !== rightExpelled) return leftExpelled ? 1 : -1;
  return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
}

export function compareStudentsByStatusProgressThenName<T extends { name: string; status: string; progressSummary: string }>(left: T, right: T) {
  const leftExpelled = isExpelledStudentStatus(left.status);
  const rightExpelled = isExpelledStudentStatus(right.status);
  if (leftExpelled !== rightExpelled) return leftExpelled ? 1 : -1;
  if (leftExpelled && rightExpelled) return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });

  const leftPoints = studentProgressPoints(left.progressSummary);
  const rightPoints = studentProgressPoints(right.progressSummary);
  if (leftPoints !== rightPoints) return rightPoints - leftPoints;
  return left.name.localeCompare(right.name, 'pt-BR', { sensitivity: 'base' });
}

export function studentRankPosition(student: { status: string; progressSummary: string }, index: number) {
  if (isExpelledStudentStatus(student.status)) return null;
  return index + 1;
}

export function isHighlightedRank(rankPosition: number | null) {
  return rankPosition !== null && rankPosition >= 1 && rankPosition <= 3;
}
