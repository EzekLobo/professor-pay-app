import { describe, expect, it } from 'vitest';
import { futureLessonsForClassUpdate, lessonsForClassDeactivation } from './classEditing';
import { buildDashboard, filterLessonHistoryByKind, generateLessonsForClass } from './calculations';
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
      .payments.find((payment) => payment.paymentDate === '2026-06-15');
    const updated = { ...tuesdayClass, firstLesson: '2026-05-19' };
    const result = futureLessonsForClassUpdate(updated, generateLessonsForClass(tuesdayClass), new Set());
    const after = buildDashboard([updated], [...result.nextLessons, extraLesson], [], '2026-05-27')
      .payments.find((payment) => payment.paymentDate === '2026-06-15');

    expect(before?.lessons.map((item) => [item.className, item.lessonDate])).toContainEqual(['Terça 20h', '2026-05-12']);
    expect(after?.lessons.map((item) => [item.className, item.lessonDate])).not.toContainEqual(['Terça 20h', '2026-05-12']);
    expect(after?.lessons.map((item) => [item.className, item.lessonDate])).toContainEqual(['Extra', '2026-05-12']);
    expect(after?.total).toBe((before?.total ?? 0) - 45);
  });

  it('preserves received lessons and recalculates unpaid lessons', () => {
    const original = { ...classRecord, firstLesson: '2026-04-20' };
    const existing = generateLessonsForClass(original);
    const updated: ClassRecord = {
      ...original,
      name: 'Seg 20h',
      firstLesson: '2026-04-21',
      lessonCount: 5,
      durationHours: 2,
      hourlyRate: 60,
    };
    const result = futureLessonsForClassUpdate(updated, existing, new Set(['2026-05-15']));

    expect(result.preserved.map((item) => item.lessonDate)).toEqual(['2026-04-20', '2026-04-27']);
    expect(result.future.map((item) => item.lessonDate)).toEqual(['2026-05-05', '2026-05-12', '2026-05-19']);
    expect(result.nextLessons).toHaveLength(5);
    expect(result.preserved.every((item) => item.hourlyRate === 40 && item.durationHours === 1)).toBe(true);
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

describe('class deactivation', () => {
  const tuesdayClass: ClassRecord = {
    ...classRecord,
    id: 'class-tuesday-20',
    name: 'Terça 20h',
    weekDay: 'Terça',
    time: '20:00',
    firstLesson: '2026-05-12',
    lessonCount: 3,
    durationHours: 1.5,
    hourlyRate: 30,
  };

  it('cancels unpaid class lessons even when lesson dates are already past', () => {
    const existing = generateLessonsForClass(tuesdayClass);
    const nextLessons = lessonsForClassDeactivation(tuesdayClass.id, existing, new Set());
    const dashboard = buildDashboard([{ ...tuesdayClass, active: false }], nextLessons, [], '2026-05-27');

    expect(nextLessons.every((lesson) => !lesson.active && lesson.canceled)).toBe(true);
    expect(filterLessonHistoryByKind(dashboard.lessons, 'Turmas', dashboard.today)).toHaveLength(0);
    expect(dashboard.payments.find((payment) => payment.paymentDate === '2026-06-15')).toBeUndefined();
    expect(dashboard.payments.find((payment) => payment.paymentDate === '2026-07-15')).toBeUndefined();
  });

  it('preserves lessons from received payments when a class is deactivated', () => {
    const spanningClass = { ...tuesdayClass, firstLesson: '2026-05-26' };
    const existing = generateLessonsForClass(spanningClass);
    const nextLessons = lessonsForClassDeactivation(spanningClass.id, existing, new Set(['2026-06-15']));

    expect(nextLessons.map((lesson) => [lesson.lessonDate, lesson.active, lesson.canceled])).toEqual([
      ['2026-05-26', true, false],
      ['2026-06-02', false, true],
      ['2026-06-09', false, true],
    ]);
  });

  it('does not change extra lessons while removing unpaid class lessons from the dashboard', () => {
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
    const existing = [...generateLessonsForClass(tuesdayClass), extraLesson];
    const nextLessons = lessonsForClassDeactivation(tuesdayClass.id, existing, new Set());
    const dashboard = buildDashboard([{ ...tuesdayClass, active: false }], nextLessons, [], '2026-05-27');
    const junePayment = dashboard.payments.find((payment) => payment.paymentDate === '2026-06-15');

    expect(nextLessons.find((lesson) => lesson.id === extraLesson.id)).toEqual(extraLesson);
    expect(junePayment?.lessons.map((lesson) => [lesson.className, lesson.lessonDate])).toEqual([['Extra', '2026-05-12']]);
    expect(junePayment?.total).toBe(30);
  });
});
