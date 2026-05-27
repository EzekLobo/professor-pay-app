import { describe, expect, it } from 'vitest';
import {
  buildDashboard,
  generateLessonsForClass,
  getLessonValue,
  getPaymentDate,
  getPeriod,
  isValidIsoDate,
} from './calculations';
import { ClassRecord, LessonRecord, PaymentConfirmation } from './types';

const baseClass: ClassRecord = {
  id: 'class-1',
  name: 'Seg 19h',
  weekDay: 'Segunda',
  time: '19:00',
  firstLesson: '2026-05-04',
  lessonCount: 40,
  durationHours: 1.5,
  hourlyRate: 45,
  active: true,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
};

function lesson(overrides: Partial<LessonRecord>): LessonRecord {
  return {
    id: 'lesson-1',
    classId: 'class-1',
    className: 'Seg 19h',
    number: 1,
    lessonDate: '2026-05-04',
    student: '',
    type: 'Normal',
    durationHours: 1,
    hourlyRate: 50,
    active: true,
    canceled: false,
    note: '',
    ...overrides,
  };
}

describe('date validation', () => {
  it('accepts valid ISO dates and rejects missing or impossible dates', () => {
    expect(isValidIsoDate('2026-05-04')).toBe(true);
    expect(isValidIsoDate('')).toBe(false);
    expect(isValidIsoDate('2026-02-30')).toBe(false);
    expect(isValidIsoDate('04/05/2026')).toBe(false);
  });
});

describe('lesson generation', () => {
  it('uses the class start date as lesson 1 and then adds weekly lessons', () => {
    const lessons = generateLessonsForClass(baseClass);
    expect(lessons).toHaveLength(40);
    expect(lessons[0].lessonDate).toBe('2026-05-04');
    expect(lessons[1].lessonDate).toBe('2026-05-11');
  });

  it('generates one lesson when lesson count is one', () => {
    expect(generateLessonsForClass({ ...baseClass, lessonCount: 1 })).toHaveLength(1);
  });
});

describe('payment period and date', () => {
  it('maps days 1 to 15 to the first period and next month day 1', () => {
    expect(getPeriod('2026-05-01')).toBe('01 a 15/05/2026');
    expect(getPeriod('2026-05-15')).toBe('01 a 15/05/2026');
    expect(getPaymentDate('2026-05-15')).toBe('2026-06-01');
  });

  it('maps day 16 onward to the second period and next month day 15', () => {
    expect(getPeriod('2026-05-16')).toBe('16 a 31/05/2026');
    expect(getPaymentDate('2026-05-31')).toBe('2026-06-15');
  });

  it('rolls December payments into January of the next year', () => {
    expect(getPaymentDate('2026-12-10')).toBe('2027-01-01');
    expect(getPaymentDate('2026-12-20')).toBe('2027-01-15');
  });
});

describe('money and dashboard calculations', () => {
  it('calculates lesson value from duration and hourly rate', () => {
    expect(getLessonValue({ durationHours: 1.5, hourlyRate: 45 })).toBe(67.5);
    expect(getLessonValue({ durationHours: 1.333, hourlyRate: 30 })).toBe(39.99);
  });

  it('separates normal and extra totals and ignores canceled lessons', () => {
    const lessons = [
      lesson({ id: 'normal-past', lessonDate: '2026-05-04', durationHours: 1, hourlyRate: 50 }),
      lesson({ id: 'extra-past', classId: null, className: 'Extra', type: 'Extra', lessonDate: '2026-05-05', durationHours: 1, hourlyRate: 30 }),
      lesson({ id: 'future', lessonDate: '2026-06-01', durationHours: 2, hourlyRate: 50 }),
      lesson({ id: 'canceled', lessonDate: '2026-06-08', durationHours: 2, hourlyRate: 50, active: false, canceled: true }),
    ];
    const dashboard = buildDashboard([baseClass], lessons, [], '2026-05-20');

    expect(dashboard.summary.earned).toBe(80);
    expect(dashboard.summary.normalLessons).toBe(1);
    expect(dashboard.summary.extraLessons).toBe(1);
    expect(dashboard.summary.normalEarned).toBe(50);
    expect(dashboard.summary.extraEarned).toBe(30);
    expect(dashboard.future.planned).toBe(100);
    expect(dashboard.future.totalPlanned).toBe(180);
    expect(dashboard.future.totalLessons).toBe(3);
  });

  it('groups payments, finds last and next, and applies received status', () => {
    const lessons = [
      lesson({ id: 'may-early', lessonDate: '2026-05-04', durationHours: 1, hourlyRate: 50 }),
      lesson({ id: 'may-late', lessonDate: '2026-05-18', durationHours: 1, hourlyRate: 60 }),
      lesson({ id: 'june-early', lessonDate: '2026-06-01', durationHours: 1, hourlyRate: 70 }),
    ];
    const confirmations: PaymentConfirmation[] = [{ id: 'p-1', paymentDate: '2026-06-01', receivedAt: '2026-06-01', note: '' }];
    const dashboard = buildDashboard([baseClass], lessons, confirmations, '2026-06-10');

    expect(dashboard.payments).toHaveLength(3);
    expect(dashboard.lastPayment?.paymentDate).toBe('2026-06-01');
    expect(dashboard.lastPayment?.status).toBe('Recebido');
    expect(dashboard.nextPayment?.paymentDate).toBe('2026-06-15');
  });

  it('calculates class progress without counting extra lessons', () => {
    const dashboard = buildDashboard(
      [baseClass],
      [
        lesson({ id: 'class-past', lessonDate: '2026-05-04' }),
        lesson({ id: 'class-future', lessonDate: '2026-06-04' }),
        lesson({ id: 'extra', classId: null, className: 'Extra', type: 'Extra', lessonDate: '2026-05-04' }),
      ],
      [],
      '2026-05-20',
    );
    expect(dashboard.progress[0]).toMatchObject({ lessonCount: 2, completed: 1, remaining: 1, percent: 50 });
  });
});
