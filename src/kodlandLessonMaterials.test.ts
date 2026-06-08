import { describe, expect, it } from 'vitest';
import { dedupeKodlandCourseLessons, extractKodlandLessonModule, groupKodlandMaterialsByCourse, groupKodlandMaterialsByModule } from './kodlandLessonMaterials';
import { KodlandLessonRecord } from './types';

function lesson(input: Partial<KodlandLessonRecord>): KodlandLessonRecord {
  return {
    id: input.id ?? `group-${input.externalClassId ?? '1'}-${input.lessonNumber ?? 1}`,
    externalClassId: input.externalClassId ?? 'group-1',
    externalClassName: input.externalClassName ?? 'Turma A',
    courseId: input.courseId ?? '1192',
    lessonId: input.lessonId ?? String(input.lessonNumber ?? 1),
    lessonNumber: input.lessonNumber ?? 1,
    lessonTitle: input.lessonTitle ?? '',
    lessonDate: input.lessonDate ?? '',
    lessonPassed: input.lessonPassed ?? false,
    materialUrl: input.materialUrl ?? '',
    slideUrl: input.slideUrl ?? '',
    slideTitle: input.slideTitle ?? '',
    slideMaterialId: input.slideMaterialId ?? '',
    scriptUrl: input.scriptUrl ?? '',
    scriptTitle: input.scriptTitle ?? '',
    scriptMaterialId: input.scriptMaterialId ?? '',
    recordingUrl: input.recordingUrl ?? '',
    updatedAt: input.updatedAt ?? '2026-06-08T00:00:00.000Z',
  };
}

describe('kodland lesson material grouping', () => {
  it('extracts module and lesson numbers from Kodland labels', () => {
    expect(extractKodlandLessonModule(lesson({ lessonTitle: 'M1L4 Apresentação de Slides' }))).toMatchObject({ moduleNumber: 1, lessonNumber: 4 });
    expect(extractKodlandLessonModule(lesson({ lessonTitle: 'M3.L2 SurfaceGUI' }))).toMatchObject({ moduleNumber: 3, lessonNumber: 2 });
    expect(extractKodlandLessonModule(lesson({ slideTitle: 'M4L1 Construindo uma pista' }))).toMatchObject({ moduleNumber: 4, lessonNumber: 1 });
  });

  it('deduplicates the same course lesson across multiple groups and keeps the richer material row', () => {
    expect(dedupeKodlandCourseLessons([
      lesson({ id: 'a', externalClassId: '10', externalClassName: 'Turma A', lessonNumber: 4, lessonTitle: 'M1L4 Variáveis', slideUrl: '' }),
      lesson({ id: 'b', externalClassId: '11', externalClassName: 'Turma B', lessonNumber: 4, lessonTitle: 'M1L4 Variáveis', slideUrl: 'https://slides.test', scriptUrl: 'https://roteiro.test' }),
    ])).toEqual([
      expect.objectContaining({ id: 'b', slideUrl: 'https://slides.test', scriptUrl: 'https://roteiro.test' }),
    ]);
  });

  it('groups materials by module and orders lessons by module and class number', () => {
    const groups = groupKodlandMaterialsByModule([
      lesson({ lessonNumber: 2, lessonTitle: 'M2L2 Segunda' }),
      lesson({ lessonNumber: 1, lessonTitle: 'M1L4 Quarta' }),
      lesson({ lessonNumber: 1, lessonTitle: 'M1L1 Primeira' }),
    ]);
    expect(groups.map((group) => group.title)).toEqual(['Modulo 1', 'Modulo 2']);
    expect(groups[0].lessons.map((item) => item.lessonTitle)).toEqual(['M1L1 Primeira', 'M1L4 Quarta']);
  });

  it('groups material libraries by course without mixing different modalities', () => {
    const courses = groupKodlandMaterialsByCourse([
      lesson({ id: 'roblox-a', courseId: '1192', lessonTitle: 'M1L1 Roblox', externalClassId: '10' }),
      lesson({ id: 'roblox-b', courseId: '1192', lessonTitle: 'M1L1 Roblox', externalClassId: '11', slideUrl: 'https://slides.roblox' }),
      lesson({ id: 'python-a', courseId: '2040', lessonTitle: 'M1L1 Python', externalClassId: '20' }),
      lesson({ id: 'scratch-a', courseId: '3050', lessonTitle: 'M1L1 Scratch', externalClassId: '30' }),
    ], [
      { courseId: '1192', courseName: 'Roblox', title: 'Turma Roblox A' },
      { courseId: '2040', courseName: 'Python', title: 'Turma Python' },
      { courseId: '3050', courseName: 'Scratch', title: 'Turma Scratch' },
    ]);

    expect(courses.map((course) => course.title)).toEqual(['Python', 'Roblox', 'Scratch']);
    expect(courses.find((course) => course.title === 'Roblox')?.modules[0].lessons).toEqual([
      expect.objectContaining({ id: 'roblox-b', slideUrl: 'https://slides.roblox' }),
    ]);
  });

  it('deduplicates three groups with the same 40 course lessons into 40 material rows', () => {
    const duplicatedLessons = Array.from({ length: 3 }).flatMap((_, groupIndex) => (
      Array.from({ length: 40 }).map((__, lessonIndex) => {
        const moduleNumber = Math.floor(lessonIndex / 4) + 1;
        const moduleLessonNumber = (lessonIndex % 4) + 1;
        return lesson({
          id: `group-${groupIndex}-lesson-${lessonIndex}`,
          externalClassId: `group-${groupIndex}`,
          courseId: '1192',
          lessonId: `${groupIndex}-${lessonIndex}`,
          lessonNumber: lessonIndex + 1,
          lessonTitle: `M${moduleNumber}L${moduleLessonNumber} Aula`,
        });
      })
    ));

    const [course] = groupKodlandMaterialsByCourse(duplicatedLessons);
    expect(course.modules).toHaveLength(10);
    expect(course.modules.flatMap((group) => group.lessons)).toHaveLength(40);
  });
});
