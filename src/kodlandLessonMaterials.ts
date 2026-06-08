import { KodlandGroupRecord, KodlandLessonRecord } from './types';

export type LessonModuleInfo = {
  moduleNumber: number;
  lessonNumber: number;
  moduleLabel: string;
};

export type KodlandMaterialGroup = {
  key: string;
  title: string;
  moduleNumber: number;
  lessons: KodlandLessonRecord[];
};

export type KodlandMaterialCourseGroup = {
  key: string;
  title: string;
  courseId: string;
  modules: KodlandMaterialGroup[];
};

export function extractKodlandLessonModule(lesson: Pick<KodlandLessonRecord, 'lessonTitle' | 'slideTitle' | 'scriptTitle' | 'lessonNumber'>): LessonModuleInfo | null {
  const text = [lesson.lessonTitle, lesson.slideTitle, lesson.scriptTitle].filter(Boolean).join(' ');
  const match = text.match(/\bM\s*(\d+)\s*[\.\-_/]?\s*L\s*(\d+)\b/i);
  if (match) {
    const moduleNumber = Number(match[1]);
    const lessonNumber = Number(match[2]);
    return {
      moduleNumber,
      lessonNumber,
      moduleLabel: `Modulo ${moduleNumber}`,
    };
  }
  return lesson.lessonNumber > 0
    ? { moduleNumber: Number.MAX_SAFE_INTEGER, lessonNumber: lesson.lessonNumber, moduleLabel: 'Sem modulo' }
    : null;
}

export function dedupeKodlandCourseLessons(lessons: KodlandLessonRecord[]) {
  const byCourseLesson = new Map<string, KodlandLessonRecord>();
  lessons.forEach((lesson) => {
    const moduleInfo = extractKodlandLessonModule(lesson);
    const moduleLessonKey = moduleInfo && moduleInfo.moduleNumber !== Number.MAX_SAFE_INTEGER
      ? `${moduleInfo.moduleNumber}:${moduleInfo.lessonNumber}`
      : '';
    const key = lesson.courseId && (moduleLessonKey || lesson.lessonNumber > 0)
      ? `${lesson.courseId}:${moduleLessonKey || lesson.lessonNumber}`
      : lesson.lessonId || lesson.id;
    const current = byCourseLesson.get(key);
    if (!current) {
      byCourseLesson.set(key, lesson);
      return;
    }
    byCourseLesson.set(key, preferredMaterialLesson(current, lesson));
  });
  return [...byCourseLesson.values()].sort(compareKodlandMaterialLessons);
}

export function groupKodlandMaterialsByCourse(lessons: KodlandLessonRecord[], groups: Pick<KodlandGroupRecord, 'courseId' | 'courseName' | 'title'>[] = []): KodlandMaterialCourseGroup[] {
  const courseNames = new Map<string, string>();
  groups.forEach((group) => {
    if (group.courseId && group.courseName) courseNames.set(group.courseId, group.courseName);
  });

  const byCourse = new Map<string, KodlandLessonRecord[]>();
  dedupeKodlandCourseLessons(lessons).forEach((lesson) => {
    const key = materialCourseKey(lesson);
    if (!byCourse.has(key)) byCourse.set(key, []);
    byCourse.get(key)!.push(lesson);
  });

  return [...byCourse.entries()].map(([key, courseLessons]) => {
    const representative = courseLessons[0];
    const courseId = representative?.courseId ?? '';
    return {
      key,
      courseId,
      title: courseNames.get(courseId) || courseTitleFromLesson(representative) || 'Curso sem nome',
      modules: groupKodlandMaterialsByModule(courseLessons),
    };
  }).sort((a, b) => a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' }));
}

export function groupKodlandMaterialsByModule(lessons: KodlandLessonRecord[]): KodlandMaterialGroup[] {
  const groups = new Map<string, KodlandMaterialGroup>();
  dedupeKodlandCourseLessons(lessons).forEach((lesson) => {
    const moduleInfo = extractKodlandLessonModule(lesson);
    const moduleNumber = moduleInfo?.moduleNumber ?? Number.MAX_SAFE_INTEGER;
    const key = moduleNumber === Number.MAX_SAFE_INTEGER ? 'no-module' : `module-${moduleNumber}`;
    const title = moduleInfo?.moduleLabel ?? 'Sem modulo';
    if (!groups.has(key)) {
      groups.set(key, { key, title, moduleNumber, lessons: [] });
    }
    groups.get(key)!.lessons.push(lesson);
  });
  return [...groups.values()]
    .map((group) => ({ ...group, lessons: group.lessons.sort(compareKodlandMaterialLessons) }))
    .sort((a, b) => a.moduleNumber - b.moduleNumber || a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' }));
}

function preferredMaterialLesson(current: KodlandLessonRecord, next: KodlandLessonRecord) {
  const currentScore = materialScore(current);
  const nextScore = materialScore(next);
  if (nextScore !== currentScore) return nextScore > currentScore ? next : current;
  return current.externalClassName.localeCompare(next.externalClassName, 'pt-BR', { sensitivity: 'base' }) <= 0 ? current : next;
}

function materialScore(lesson: KodlandLessonRecord) {
  return Number(Boolean(lesson.slideUrl))
    + Number(Boolean(lesson.scriptUrl))
    + Number(Boolean(lesson.materialUrl));
}

function materialCourseKey(lesson: KodlandLessonRecord) {
  return lesson.courseId ? `course-${lesson.courseId}` : `class-${lesson.externalClassId}`;
}

function courseTitleFromLesson(lesson: KodlandLessonRecord | undefined) {
  if (!lesson) return '';
  return lesson.courseId ? `Curso ${lesson.courseId}` : lesson.externalClassName;
}

function compareKodlandMaterialLessons(a: KodlandLessonRecord, b: KodlandLessonRecord) {
  const aInfo = extractKodlandLessonModule(a);
  const bInfo = extractKodlandLessonModule(b);
  const aModule = aInfo?.moduleNumber ?? Number.MAX_SAFE_INTEGER;
  const bModule = bInfo?.moduleNumber ?? Number.MAX_SAFE_INTEGER;
  const aLesson = aInfo?.lessonNumber || a.lessonNumber || Number.MAX_SAFE_INTEGER;
  const bLesson = bInfo?.lessonNumber || b.lessonNumber || Number.MAX_SAFE_INTEGER;
  return aModule - bModule
    || aLesson - bLesson
    || a.lessonTitle.localeCompare(b.lessonTitle, 'pt-BR', { sensitivity: 'base' })
    || a.externalClassName.localeCompare(b.externalClassName, 'pt-BR', { sensitivity: 'base' });
}
