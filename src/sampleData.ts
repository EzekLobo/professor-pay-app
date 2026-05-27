import { addDays, todayIso } from './calculations';
import { ClassRecord, LessonRecord } from './types';

const now = new Date().toISOString();

export function sampleClasses(): ClassRecord[] {
  const today = todayIso();
  return [
    {
      id: 'class-monday-19',
      name: 'Seg 19h',
      weekDay: 'Segunda',
      time: '19:00',
      firstLesson: addDays(today, -70),
      lessonCount: 40,
      durationHours: 1.5,
      hourlyRate: 45,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'class-thursday-20',
      name: 'Qui 20h',
      weekDay: 'Quinta',
      time: '20:00',
      firstLesson: addDays(today, -56),
      lessonCount: 40,
      durationHours: 1.5,
      hourlyRate: 45,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function sampleExtraLessons(): LessonRecord[] {
  const today = todayIso();
  return [
    {
      id: 'extra-lucas-1',
      classId: null,
      className: 'Extra',
      number: 1,
      lessonDate: addDays(today, -11),
      student: 'Lucas Martins',
      type: 'Extra',
      durationHours: 1,
      hourlyRate: 30,
      active: true,
      canceled: false,
      note: '',
    },
    {
      id: 'extra-lucas-2',
      classId: null,
      className: 'Extra',
      number: 2,
      lessonDate: addDays(today, -8),
      student: 'Lucas',
      type: 'Extra',
      durationHours: 1,
      hourlyRate: 30,
      active: true,
      canceled: false,
      note: '',
    },
  ];
}
