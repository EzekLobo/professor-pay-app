import { describe, expect, it } from 'vitest';
import { futureLessonsForClassUpdate } from './classEditing';
import { buildDashboard, generateLessonsForClass } from './calculations';
import { ClassRecord, LessonRecord } from './types';

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
  it('recalculates unpaid past lessons when the class start date changes', () => {
    const tuesdayClass: ClassRecord = {
      ...classRecord,
      id: 'class-tuesday-20',
      name: 'Terça 20h',
      weekDay: 'Terça',
      time: '20:00',
      firstLesson: '2026-05-12',
      lessonCount: 4,
      durationHours: 1.5,
      hourlyRate: 30,
    };
    const existing = generateLessonsForClass(tuesdayClass);
    const updated = { ...tuesdayClass, firstLesson: '2026-05-19' };
    const result = futureLessonsForClassUpdate(updated, existing, new Set());

    expect(result.preserved).toHaveLength(0);
    expect(result.nextLessons.map((item) => item.lessonDate)).not.toContain('2026-05-12');
    expect(result.nextLessons.map((item) => item.lessonDate)).toEqual([
      '2026-05-19',
      '2026-05-26',
      '2026-06-02',
      '2026-06-09',
    ]);
  });

  it('removes the old unpaid class lesson from the next payment and lowers the total', () => {
    const tuesdayClass: ClassRecord = {
      ...classRecord,
      id: 'class-tuesday-20',
      name: 'Terça 20h',
      weekDay: 'Terça',
      time: '20:00',
      firstLesson: '2026-05-12',
      lessonCount: 4,
      durationHours: 1.5,
      hourlyRate: 30,
    };
    const extraLesson: LessonRecord = {
      id: 'extra-lucas-2026-05-12',
      classId: null,
      className: 'Extra',
      number: 1,
      lessonDate: '2026-05-12',
      student: 'Lucas',
      type: 'Extra',
      durationHours: 1,
      hourlyRate: 30,
      active: true,
      canceled: false,
      note: '',
    };
    const before = buildDashboard([tuesdayClass], [...generateLessonsForClass(tuesdayClass), extraLesson], [], '2026-05-27')
      .payments.find((payment) => payment.paymentDate === '2026-06-01');
    const updated = { ...tuesdayClass, firstLesson: '2026-05-19' };
    const result = futureLessonsForClassUpdate(updated, generateLessonsForClass(tuesdayClass), new Set());
    const after = buildDashboard([updated], [...result.nextLessons, extraLesson], [], '2026-05-27')
      .payments.find((payment) => payment.paymentDate === '2026-06-01');

    expect(before?.lessons.map((item) => [item.className, item.lessonDate])).toContainEqual(['Terça 20h', '2026-05-12']);
    expect(after?.lessons.map((item) => [item.className, item.lessonDate])).not.toContainEqual(['Terça 20h', '2026-05-12']);
    expect(after?.lessons.map((item) => [item.className, item.lessonDate])).toContainEqual(['Extra', '2026-05-12']);
    expect(after?.total).toBe((before?.total ?? 0) - 45);
  });

  it('preserves received lessons and recalculates unpaid lessons', () => {
    const existing = generateLessonsForClass(classRecord);
    const updated: ClassRecord = {
      ...classRecord,
      name: 'Seg 20h',
      firstLesson: '2026-05-05',
      lessonCount: 5,
      durationHours: 2,
      hourlyRate: 60,
    };
    const result = futureLessonsForClassUpdate(updated, existing, new Set(['2026-06-01']));

    expect(result.preserved.map((item) => item.lessonDate)).toEqual(['2026-05-04', '2026-05-11']);
    expect(result.future.map((item) => item.lessonDate)).toEqual(['2026-05-19', '2026-05-26', '2026-06-02']);
    expect(result.nextLessons).toHaveLength(5);
    expect(result.future.every((item) => item.hourlyRate === 60 && item.durationHours === 2)).toBe(true);
  });

  it('does not duplicate lessons when the same class is edited more than once', () => {
    const existing = generateLessonsForClass(classRecord);
    const firstEdit = futureLessonsForClassUpdate({ ...classRecord, firstLesson: '2026-05-11' }, existing, new Set());
    const secondEdit = futureLessonsForClassUpdate({ ...classRecord, firstLesson: '2026-05-18' }, firstEdit.nextLessons, new Set());

    expect(secondEdit.nextLessons.map((item) => item.lessonDate)).toEqual([
      '2026-05-18',
      '2026-05-25',
      '2026-06-01',
      '2026-06-08',
    ]);
    expect(new Set(secondEdit.nextLessons.map((item) => item.id)).size).toBe(secondEdit.nextLessons.length);
  });
});
