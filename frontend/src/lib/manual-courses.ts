export type ManualCourseLesson = {
  id: string;
  title: string;
  activities: string;
  guide: string;
  slides: string;
  homework: string;
  archived?: boolean;
};

export type ManualCourseModule = {
  id: string;
  title: string;
  lessons: ManualCourseLesson[];
};

export type ManualCourse = {
  id: string;
  name: string;
  modules: ManualCourseModule[];
  archived?: boolean;
  created_at: string;
  updated_at: string;
};

export type ManualCourseLessonLocation = {
  lesson: ManualCourseLesson;
  module: ManualCourseModule;
  moduleIndex: number;
  lessonIndex: number;
  code: string;
};

export const manualCourseLessons = (course: ManualCourse): ManualCourseLessonLocation[] =>
  course.modules.flatMap((module, moduleIndex) => module.lessons
    .filter((lesson) => !lesson.archived)
    .map((lesson, lessonIndex) => ({
      lesson,
      module,
      moduleIndex,
      lessonIndex,
      code: `M${moduleIndex + 1}L${lessonIndex + 1}`,
    })));

export const manualCourseLessonLocation = (course: ManualCourse, lessonId: string) =>
  manualCourseLessons(course).find((item) => item.lesson.id === lessonId);
