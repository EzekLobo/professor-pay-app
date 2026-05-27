import { ClassProgress, ClassRecord, DashboardData, LessonRecord, LessonView, PaymentConfirmation, PaymentView } from './types';

const DAY_MS = 24 * 60 * 60 * 1000;

export type LessonFilter = 'Todas' | 'Turmas' | 'Extras';

export function todayIso() {
  const now = new Date();
  return toIsoDate(now);
}

export function toIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function parseIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

export function addDays(value: string, days: number) {
  const date = parseIsoDate(value);
  date.setDate(date.getDate() + days);
  return toIsoDate(date);
}

function nextMonthDate(value: string, day: 1 | 15) {
  const date = parseIsoDate(value);
  return toIsoDate(new Date(date.getFullYear(), date.getMonth() + 1, day));
}

export function formatDate(value: string) {
  const date = parseIsoDate(value);
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(date);
}

export function formatCurrency(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export function getPeriod(lessonDate: string) {
  const date = parseIsoDate(lessonDate);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return date.getDate() <= 15 ? `01 a 15/${month}/${year}` : `16 a 31/${month}/${year}`;
}

export function getPaymentDate(lessonDate: string) {
  return parseIsoDate(lessonDate).getDate() <= 15 ? nextMonthDate(lessonDate, 1) : nextMonthDate(lessonDate, 15);
}

export function getLessonValue(lesson: Pick<LessonRecord, 'durationHours' | 'hourlyRate'>) {
  return roundMoney(lesson.durationHours * lesson.hourlyRate);
}

export function roundMoney(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function generateLessonsForClass(classRecord: ClassRecord): LessonRecord[] {
  return Array.from({ length: classRecord.lessonCount }, (_, index) => ({
    id: `${classRecord.id}-lesson-${index + 1}`,
    classId: classRecord.id,
    className: classRecord.name,
    number: index + 1,
    lessonDate: addDays(classRecord.firstLesson, index * 7),
    student: '',
    type: 'Normal',
    durationHours: classRecord.durationHours,
    hourlyRate: classRecord.hourlyRate,
    active: true,
    canceled: false,
    note: '',
  }));
}

export function buildDashboard(
  classes: ClassRecord[],
  rawLessons: LessonRecord[],
  confirmations: PaymentConfirmation[],
  today = todayIso(),
): DashboardData {
  const confirmationDates = new Set(confirmations.map((item) => item.paymentDate));
  const lessons = rawLessons.map<LessonView>((lesson) => {
    const status = !lesson.active || lesson.canceled ? 'Cancelada' : lesson.lessonDate <= today ? 'Realizada' : 'Futura';
    return {
      ...lesson,
      period: getPeriod(lesson.lessonDate),
      paymentDate: getPaymentDate(lesson.lessonDate),
      lessonValue: getLessonValue(lesson),
      status,
    };
  });
  const billable = lessons.filter((lesson) => lesson.active && !lesson.canceled);
  const payments = buildPayments(billable, confirmationDates, today);
  const payablePayments = payments.filter((payment) => payment.total > 0);
  const lastPayment = [...payablePayments].filter((payment) => payment.paymentDate <= today).pop() ?? null;
  const nextPayment = payablePayments.find((payment) => payment.paymentDate > today) ?? null;
  const completedLessons = billable.filter((lesson) => lesson.lessonDate <= today);
  const futureLessons = billable.filter((lesson) => lesson.lessonDate > today);
  const received = payments
    .filter((payment) => payment.paymentDate <= today || confirmationDates.has(payment.paymentDate))
    .reduce((total, payment) => total + payment.total, 0);

  return {
    today,
    lessons,
    payments,
    lastPayment,
    nextPayment,
    summary: {
      earned: sumLessons(completedLessons),
      received: roundMoney(received),
      normalLessons: completedLessons.filter((lesson) => lesson.type === 'Normal').length,
      extraLessons: completedLessons.filter((lesson) => lesson.type === 'Extra').length,
      normalEarned: sumLessons(completedLessons.filter((lesson) => lesson.type === 'Normal')),
      extraEarned: sumLessons(completedLessons.filter((lesson) => lesson.type === 'Extra')),
    },
    future: {
      planned: sumLessons(futureLessons),
      futureLessons: futureLessons.length,
      totalPlanned: sumLessons(billable),
      totalLessons: billable.length,
    },
    progress: buildClassProgress(classes, billable, today),
  };
}

function buildPayments(lessons: LessonView[], confirmationDates: Set<string>, today: string): PaymentView[] {
  const groups = new Map<string, LessonView[]>();
  lessons.forEach((lesson) => {
    const group = groups.get(lesson.paymentDate) ?? [];
    group.push(lesson);
    groups.set(lesson.paymentDate, group);
  });

  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([paymentDate, group]) => {
      const normal = group.filter((lesson) => lesson.type === 'Normal');
      const extra = group.filter((lesson) => lesson.type === 'Extra');
      const total = sumLessons(group);
      const status = confirmationDates.has(paymentDate)
        ? 'Recebido'
        : paymentDate < today
          ? 'Pago/previsto'
          : paymentDate === today
            ? 'Vence hoje'
            : 'Futuro';
      return {
        paymentDate,
        period: group[0]?.period ?? '',
        lessonCount: group.length,
        normalCount: normal.length,
        extraCount: extra.length,
        normalTotal: sumLessons(normal),
        extraTotal: sumLessons(extra),
        total,
        status,
        lessons: [...group].sort((a, b) => b.lessonDate.localeCompare(a.lessonDate)),
      };
    });
}

function buildClassProgress(classes: ClassRecord[], lessons: LessonView[], today: string): ClassProgress[] {
  return classes
    .filter((item) => item.active)
    .map((item) => {
      const classLessons = lessons.filter((lesson) => lesson.classId === item.id);
      const completed = classLessons.filter((lesson) => lesson.lessonDate <= today).length;
      const remaining = Math.max(classLessons.length - completed, 0);
      return {
        classId: item.id,
        name: item.name,
        lessonCount: classLessons.length,
        completed,
        remaining,
        percent: classLessons.length ? Math.round((completed / classLessons.length) * 100) : 0,
      };
    });
}

function sumLessons(lessons: LessonView[]) {
  return roundMoney(lessons.reduce((total, lesson) => total + lesson.lessonValue, 0));
}

export function daysBetween(a: string, b: string) {
  return Math.round((parseIsoDate(b).getTime() - parseIsoDate(a).getTime()) / DAY_MS);
}

export function filterLessonsByKind(lessons: LessonView[], filter: LessonFilter) {
  const activeLessons = lessons.filter((lesson) => lesson.active && !lesson.canceled);
  if (filter === 'Turmas') return activeLessons.filter((lesson) => lesson.type === 'Normal');
  if (filter === 'Extras') return activeLessons.filter((lesson) => lesson.type === 'Extra');
  return activeLessons;
}

export function filterLessonHistoryByKind(lessons: LessonView[], filter: LessonFilter, today: string) {
  return filterLessonsByKind(lessons, filter)
    .filter((lesson) => lesson.lessonDate <= today)
    .sort((a, b) => b.lessonDate.localeCompare(a.lessonDate));
}

export function relevantPayments(payments: PaymentView[], today: string) {
  const current = payments
    .filter((payment) => payment.paymentDate <= today || payment.status === 'Recebido')
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  const currentDates = new Set(current.map((payment) => payment.paymentDate));
  const nextFuture = payments.find((payment) => payment.paymentDate > today && !currentDates.has(payment.paymentDate));
  return (nextFuture ? [...current, nextFuture] : current)
    .sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
}
