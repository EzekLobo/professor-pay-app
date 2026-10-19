export type ManualCourseLesson = {
  id: string;
  title: string;
  activities: string;
  guide: string;
  slides: string;
  homework: string;
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
  created_at: string;
  updated_at: string;
};
