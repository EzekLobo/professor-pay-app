export type LessonType = 'Normal' | 'Extra';

export type ClassRecord = {
  id: string;
  name: string;
  weekDay: string;
  time: string;
  firstLesson: string;
  lessonCount: number;
  durationHours: number;
  hourlyRate: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LessonRecord = {
  id: string;
  classId: string | null;
  className: string;
  number: number;
  lessonDate: string;
  student: string;
  type: LessonType;
  durationHours: number;
  hourlyRate: number;
  active: boolean;
  canceled: boolean;
  note: string;
};

export type PaymentConfirmation = {
  id: string;
  paymentDate: string;
  receivedAt: string;
  note: string;
};

export type StudentRecord = {
  id: string;
  externalId: string;
  name: string;
  primaryClassId: string | null;
  rawDataJson: string;
  updatedAt: string;
};

export type ClassStudentRecord = {
  classId: string;
  studentId: string;
  externalClassId: string;
  externalClassName: string;
  confirmed: boolean;
  updatedAt: string;
};

export type StudentWithClass = StudentRecord & {
  classId: string | null;
  externalClassId: string;
  externalClassName: string;
  confirmed: boolean;
};

export type LessonView = LessonRecord & {
  period: string;
  paymentDate: string;
  lessonValue: number;
  status: 'Realizada' | 'Futura' | 'Cancelada';
};

export type PaymentView = {
  paymentDate: string;
  period: string;
  lessonCount: number;
  normalCount: number;
  extraCount: number;
  normalTotal: number;
  extraTotal: number;
  total: number;
  status: 'Recebido' | 'Pago/previsto' | 'Vence hoje' | 'Futuro';
  lessons: LessonView[];
};

export type ClassProgress = {
  classId: string;
  name: string;
  lessonCount: number;
  completed: number;
  remaining: number;
  percent: number;
};

export type DashboardData = {
  today: string;
  lessons: LessonView[];
  payments: PaymentView[];
  lastPayment: PaymentView | null;
  nextPayment: PaymentView | null;
  summary: {
    earned: number;
    received: number;
    normalLessons: number;
    extraLessons: number;
    normalEarned: number;
    extraEarned: number;
  };
  future: {
    planned: number;
    futureLessons: number;
    totalPlanned: number;
    totalLessons: number;
  };
  progress: ClassProgress[];
};
