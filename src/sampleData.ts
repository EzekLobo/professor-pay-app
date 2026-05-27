import { ClassRecord, LessonRecord } from './types';

const now = new Date().toISOString();

export function sampleClasses(): ClassRecord[] {
  return [
    {
      id: 'class-tuesday-20',
      name: 'Terça 20h',
      weekDay: 'Terça',
      time: '20:00',
      firstLesson: '2026-05-12',
      lessonCount: 40,
      durationHours: 1.5,
      hourlyRate: 30,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'class-monday-19',
      name: 'Segunda 19h',
      weekDay: 'Segunda',
      time: '19:00',
      firstLesson: '2026-03-16',
      lessonCount: 40,
      durationHours: 1.5,
      hourlyRate: 30,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'class-thursday-20',
      name: 'Quinta 20h',
      weekDay: 'Quinta',
      time: '20:00',
      firstLesson: '2026-04-02',
      lessonCount: 40,
      durationHours: 1.5,
      hourlyRate: 30,
      active: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export function sampleExtraLessons(): LessonRecord[] {
  return [
    extraLesson('extra-elena-2026-04-14', '2026-04-14', 'Elena'),
    extraLesson('extra-luiz-2026-04-26', '2026-04-26', 'Luiz'),
    extraLesson('extra-lucas-martins-2026-05-09', '2026-05-09', 'Lucas Martins'),
    extraLesson('extra-lucas-2026-05-12', '2026-05-12', 'Lucas'),
  ];
}

function extraLesson(id: string, lessonDate: string, student: string): LessonRecord {
  return {
    id,
    classId: null,
    className: 'Extra',
    number: 1,
    lessonDate,
    student,
    type: 'Extra',
    durationHours: 1,
    hourlyRate: 30,
    active: true,
    canceled: false,
    note: '',
  };
}
