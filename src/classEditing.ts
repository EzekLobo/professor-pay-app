import { generateLessonsForClass } from './calculations';
import { ClassRecord, LessonRecord } from './types';

export function futureLessonsForClassUpdate(
  updatedClass: ClassRecord,
  existingLessons: LessonRecord[],
  today: string,
) {
  const preserved = existingLessons.filter((lesson) => lesson.classId === updatedClass.id && lesson.lessonDate <= today);
  const future = generateLessonsForClass(updatedClass).filter((lesson) => lesson.lessonDate > today);
  return { preserved, future, nextLessons: [...preserved, ...future] };
}
