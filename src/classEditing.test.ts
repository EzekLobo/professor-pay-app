import { describe, expect, it } from 'vitest';
import { futureLessonsForClassUpdate } from './classEditing';
import { generateLessonsForClass } from './calculations';
import { ClassRecord } from './types';

const classRecord: ClassRecord = {
  id: 'class-1',
  name: 'Seg 19h',
  weekDay: 'Segunda',
  time: '19:00',
  firstLesson: '2026-05-04',
  lessonCount: 4,
  durationHours: 1,
  hourlyRate: 40,
  active: true,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

describe('class future editing', () => {
  it('preserves completed lessons and recalculates only future lessons', () => {
    const existing = generateLessonsForClass(classRecord);
    const updated: ClassRecord = {
      ...classRecord,
      name: 'Seg 20h',
      firstLesson: '2026-05-05',
      lessonCount: 5,
      durationHours: 2,
      hourlyRate: 60,
    };
    const result = futureLessonsForClassUpdate(updated, existing, '2026-05-15');

    expect(result.preserved.map((item) => item.lessonDate)).toEqual(['2026-05-04', '2026-05-11']);
    expect(result.future.map((item) => item.lessonDate)).toEqual(['2026-05-19', '2026-05-26', '2026-06-02']);
    expect(result.nextLessons).toHaveLength(5);
    expect(result.future.every((item) => item.hourlyRate === 60 && item.durationHours === 2)).toBe(true);
  });

  it('does not duplicate lessons when the updated class has no future dates', () => {
    const existing = generateLessonsForClass(classRecord);
    const updated = { ...classRecord, lessonCount: 2 };
    const result = futureLessonsForClassUpdate(updated, existing, '2026-05-30');

    expect(result.preserved).toHaveLength(4);
    expect(result.future).toHaveLength(0);
    expect(new Set(result.nextLessons.map((item) => item.id)).size).toBe(result.nextLessons.length);
  });
});
