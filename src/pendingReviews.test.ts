import { describe, expect, it } from 'vitest';
import { filterPendingReviewsByModule, filterPendingReviewsForActiveStudents, summarizePendingReviews, summarizePendingReviewsByModule } from './pendingReviews';
import { PendingReviewRecord } from './types';

function review(input: Partial<PendingReviewRecord>): PendingReviewRecord {
  return {
    id: input.id ?? `review-${input.taskId ?? '1'}`,
    externalClassId: input.externalClassId ?? 'class-1',
    externalClassName: input.externalClassName ?? 'Turma A',
    externalStudentId: input.externalStudentId ?? 'student-1',
    studentName: input.studentName ?? 'Ana',
    lessonId: input.lessonId ?? 'lesson-1',
    lessonNumber: input.lessonNumber ?? 1,
    lessonTitle: input.lessonTitle ?? 'Aula',
    moduleNumber: input.moduleNumber ?? '1',
    taskId: input.taskId ?? 'task-1',
    taskNumber: input.taskNumber ?? 1,
    taskTitle: input.taskTitle ?? 'Atividade',
    statusKey: input.statusKey ?? 'TASK_SUBMITTED',
    statusLabel: input.statusLabel ?? 'Entregue',
    correctionUrl: input.correctionUrl ?? 'https://bo.kodland.org/groups/class-1',
    updatedAt: input.updatedAt ?? '2026-06-01T00:00:00.000Z',
  };
}

describe('pending review grouping', () => {
  it('groups pending reviews by class, student, and module', () => {
    const reviews = [
      review({ id: '1', externalClassId: 'class-2', externalClassName: 'Turma B', externalStudentId: 'student-2', studentName: 'Bruno', moduleNumber: '2' }),
      review({ id: '2', externalClassId: 'class-1', externalClassName: 'Turma A', externalStudentId: 'student-1', studentName: 'Ana', moduleNumber: '1' }),
      review({ id: '3', externalClassId: 'class-1', externalClassName: 'Turma A', externalStudentId: 'student-1', studentName: 'Ana', moduleNumber: '2' }),
    ];

    expect(summarizePendingReviews(reviews, 'externalClassId', 'externalClassName')).toEqual([
      { id: 'class-1', title: 'Turma A', count: 2 },
      { id: 'class-2', title: 'Turma B', count: 1 },
    ]);
    expect(summarizePendingReviews(reviews.slice(1), 'externalStudentId', 'studentName')).toEqual([
      { id: 'student-1', title: 'Ana', count: 2 },
    ]);
    expect(summarizePendingReviewsByModule(reviews.slice(1))).toEqual([
      { id: '1', title: 'Módulo 1', count: 1 },
      { id: '2', title: 'Módulo 2', count: 1 },
    ]);
    expect(filterPendingReviewsByModule(reviews.slice(1), '2').map((item) => item.id)).toEqual(['3']);
  });

  it('removes pending reviews for expelled students from visible correction lists', () => {
    const reviews = [
      review({ id: 'active', externalStudentId: 'student-1', studentName: 'Ana' }),
      review({ id: 'removed', externalStudentId: 'student-2', studentName: 'Bruno' }),
      review({ id: 'unknown', externalStudentId: 'student-3', studentName: 'Carla' }),
    ];
    expect(filterPendingReviewsForActiveStudents(reviews, [
      { externalId: 'student-1', externalClassId: 'class-1', status: 'active' },
      { externalId: 'student-2', externalClassId: 'class-1', status: 'removed' },
    ]).map((item) => item.id)).toEqual(['active', 'unknown']);
  });
});
