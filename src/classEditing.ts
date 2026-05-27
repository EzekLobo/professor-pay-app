import { generateLessonsForClass, getPaymentDate } from './calculations';
import { ClassRecord, LessonRecord } from './types';

export function futureLessonsForClassUpdate(
  updatedClass: ClassRecord,
  existingLessons: LessonRecord[],
  receivedPaymentDates: Set<string>,
) {
  const preserved = existingLessons.filter(
    (lesson) => lesson.classId === updatedClass.id && receivedPaymentDates.has(getPaymentDate(lesson.lessonDate)),
  );
  const preservedIds = new Set(preserved.map((lesson) => lesson.id));
  const future = generateLessonsForClass(updatedClass)
    .filter((lesson) => !receivedPaymentDates.has(getPaymentDate(lesson.lessonDate)))
    .map((lesson) => (
      preservedIds.has(lesson.id)
        ? { ...lesson, id: `${lesson.classId}-lesson-${lesson.number}-${lesson.lessonDate}` }
        : lesson
    ));
  return { preserved, future, nextLessons: [...preserved, ...future] };
}
