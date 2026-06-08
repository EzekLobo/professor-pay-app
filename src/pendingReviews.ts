import { PendingReviewRecord } from './types';
import { isExpelledStudentStatus } from './studentStatus';

export type PendingReviewSummary = {
  id: string;
  title: string;
  count: number;
};

export function summarizePendingReviews<T extends 'externalClassId' | 'externalStudentId', K extends 'externalClassName' | 'studentName'>(
  reviews: PendingReviewRecord[],
  idKey: T,
  titleKey: K,
): PendingReviewSummary[] {
  const summaries = new Map<string, PendingReviewSummary>();
  reviews.forEach((review) => {
    const id = review[idKey];
    const existing = summaries.get(id) ?? { id, title: review[titleKey], count: 0 };
    existing.count += 1;
    summaries.set(id, existing);
  });
  return [...summaries.values()].sort((left, right) => left.title.localeCompare(right.title, 'pt-BR'));
}

export function summarizePendingReviewsByModule(reviews: PendingReviewRecord[]): PendingReviewSummary[] {
  const summaries = new Map<string, PendingReviewSummary>();
  reviews.forEach((review) => {
    const id = review.moduleNumber || 'sem-modulo';
    const existing = summaries.get(id) ?? { id, title: moduleTitle(review.moduleNumber), count: 0 };
    existing.count += 1;
    summaries.set(id, existing);
  });
  return [...summaries.values()].sort(compareModuleSummaries);
}

export function filterPendingReviewsByModule(reviews: PendingReviewRecord[], moduleId: string) {
  return reviews.filter((review) => (review.moduleNumber || 'sem-modulo') === moduleId);
}

export function filterPendingReviewsForActiveStudents<
  R extends Pick<PendingReviewRecord, 'externalStudentId' | 'externalClassId'>,
  T extends { externalId: string; externalClassId: string | null; status: string },
>(
  reviews: R[],
  students: T[],
) {
  return reviews.filter((review) => {
    const student = students.find((item) => (
      item.externalId === review.externalStudentId
      && (!item.externalClassId || item.externalClassId === review.externalClassId)
    )) ?? students.find((item) => item.externalId === review.externalStudentId);
    return !student || !isExpelledStudentStatus(student.status);
  });
}

function moduleTitle(moduleNumber: string) {
  return moduleNumber ? `Módulo ${moduleNumber}` : 'Módulo não informado';
}

function compareModuleSummaries(left: PendingReviewSummary, right: PendingReviewSummary) {
  if (left.id === 'sem-modulo') return 1;
  if (right.id === 'sem-modulo') return -1;
  const leftNumber = Number(left.id);
  const rightNumber = Number(right.id);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber)) return leftNumber - rightNumber;
  return left.title.localeCompare(right.title, 'pt-BR');
}
