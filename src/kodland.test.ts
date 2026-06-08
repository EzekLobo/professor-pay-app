import { describe, expect, it } from 'vitest';
import { courseIdFromKodlandLessonUrl, enrichKodlandStudentFromDetail, lessonIdFromKodlandLessonUrl, normalizeKodlandGroup, normalizeKodlandStudent, parseKodlandGroupStudentsPayload, parseKodlandLessonsPayload, parseKodlandPendingReviewsPayload, parseKodlandStudentsPayload, parseKodlandStudyGuideMaterialsPayload, syncKodlandStudents } from './kodland';

describe('kodland student import', () => {
  it('normalizes common student and class fields while preserving raw data', () => {
    expect(normalizeKodlandStudent({
      student_id: 42,
      full_name: 'Ana Silva',
      group_id: 'group-1',
      group_name: 'Terca 20h',
      phone: '11999999999',
    })).toEqual({
      externalId: '42',
      name: 'Ana Silva',
      email: '',
      phone: '11999999999',
      status: '',
      progressSummary: '',
      profileUrl: 'https://bo.kodland.org/students/42',
      externalClassId: 'group-1',
      externalClassName: 'Terca 20h',
      rawData: {
        student_id: 42,
        full_name: 'Ana Silva',
        group_id: 'group-1',
        group_name: 'Terca 20h',
        phone: '11999999999',
      },
    });
  });

  it('accepts paginated payloads and skips incomplete records', () => {
    expect(parseKodlandStudentsPayload({
      results: [
        { id: 'student-1', name: 'Lucas', classId: 'class-1', className: 'Segunda 19h' },
        { id: 'student-2' },
      ],
    })).toHaveLength(1);
  });

  it('requires credentials before attempting a sync', async () => {
    await expect(syncKodlandStudents({ username: '', password: '' })).resolves.toEqual({
      ok: false,
      message: 'Informe usuario e senha da Kodland.',
    });
  });

  it('parses the group student shape without retaining unrelated sensitive fields', () => {
    const group = normalizeKodlandGroup({ id: 10, title: 'Turma A', students_count: 1 });
    expect(group).not.toBeNull();
    expect(parseKodlandGroupStudentsPayload([{
      main_info: {
        student_id: 42,
        full_name: 'Ana Silva',
        email: 'ana@example.test',
        phone: '(11) 99999-9999',
        status: 'active',
        profile_url: 'https://bo.kodland.test/students/42',
        password: 'must-not-be-kept',
      },
      progress_info: [
        { module_current_grade: 20, module_max_grade: 40 },
        { module_current_grade: 30, module_max_grade: 60 },
      ],
    }], group!)).toEqual([{
      externalId: '42',
      name: 'Ana Silva',
      email: 'ana@example.test',
      phone: '(11) 99999-9999',
      status: 'active',
      progressSummary: '50/100',
      profileUrl: 'https://bo.kodland.test/students/42',
      externalClassId: '10',
      externalClassName: 'Turma A',
      rawData: {
        studentId: '42',
        name: 'Ana Silva',
        email: 'ana@example.test',
        phone: '(11) 99999-9999',
        status: 'active',
        profileUrl: 'https://bo.kodland.test/students/42',
        totalCurrentGrade: 0,
        totalMaxGrade: 0,
        rating: 0,
        ratingMax: 0,
        progressSummary: '50/100',
      },
    }]);
  });

  it('merges individual student details while keeping only safe fields', () => {
    const student = normalizeKodlandStudent({
      id: 42,
      name: 'Ana Silva',
      classId: '10',
      className: 'Turma A',
    });
    expect(student).not.toBeNull();
    const enriched = enrichKodlandStudentFromDetail(student!, {
      main_info: {
        email: 'ana@example.test',
        phone_number: '+55 11 99999-9999',
        status: 'active',
        password: 'must-not-be-kept',
        token: 'must-not-be-kept',
      },
    });
    expect(enriched).toMatchObject({
      email: 'ana@example.test',
      phone: '+55 11 99999-9999',
      status: 'active',
      profileUrl: 'https://bo.kodland.org/students/42',
    });
    expect(JSON.stringify(enriched.rawData)).not.toContain('must-not-be-kept');
    expect(JSON.stringify(enriched.rawData)).not.toContain('password');
    expect(JSON.stringify(enriched.rawData)).not.toContain('token');
  });

  it('parses submitted task statuses as pending reviews and ignores checked or missing work', () => {
    const group = normalizeKodlandGroup({ id: 10, title: 'Turma A', students_count: 1 });
    expect(group).not.toBeNull();
    const reviews = parseKodlandPendingReviewsPayload(group!, [{
      progress_info: [{
        module_number: 3,
        lessons_data: [{ lesson_id: 200, lesson_number: 8 }],
      }],
    }], [{
      lesson_id: 200,
      lesson_number: 8,
      lesson_title: 'Loops',
      lesson_passed: true,
    }, {
      lesson_id: 201,
      lesson_number: 99,
      lesson_title: 'Futuro',
      lesson_passed: false,
    }], [{
      lesson_tasks: [
        { id: 1, number: 1, title: 'Projeto', lesson_id: 200, link_to_service: '/teacher/review/1' },
        { id: 2, number: 2, title: 'Quiz', lesson_id: 200 },
        { id: 3, number: 3, title: 'Leitura', lesson_id: 200 },
        { id: 4, number: 4, title: 'Pratica', lesson_id: 200 },
        { id: 5, number: 5, title: 'Extra', lesson_id: 200 },
        { id: 6, number: 6, title: 'Futura', lesson_id: 201 },
      ],
      students_progress: [{
        student_id: 42,
        student_name: 'Ana Silva',
        tasks_data: [
          { task_id: 1, task_status_key: 'TASK_SUBMITTED', task_status_value: 'Enviada' },
          { task_id: 2, task_status_key: 'TASK_SUBMITTED_LATE', task_status_value: 'Enviada com atraso' },
          { task_id: 3, task_status_key: 'TASK_NOT_GRADED', task_status_value: 'Sem nota' },
          { task_id: 4, task_status_key: 'TASK_CHECKED', task_status_value: 'Tarefa revisada' },
          { task_id: 5, task_status_key: 'TASK_NOT_SUBMITTED', task_status_value: 'Tarefa não enviada' },
          { task_id: 6, task_status_key: 'TASK_SUBMITTED', task_status_value: 'Submitted' },
        ],
      }],
    }]);
    expect(reviews.map((review) => review.taskTitle)).toEqual(['Projeto', 'Quiz']);
    expect(reviews.map((review) => review.moduleNumber)).toEqual(['3', '3']);
    expect(reviews[0]).toMatchObject({
      externalClassId: '10',
      externalClassName: 'Turma A',
      externalStudentId: '42',
      studentName: 'Ana Silva',
      lessonId: '200',
      lessonNumber: 8,
      lessonTitle: 'Loops',
      statusKey: 'TASK_SUBMITTED',
      statusLabel: 'Entregue',
      correctionUrl: 'https://bo.kodland.org/teacher/review/1',
    });
    expect(reviews[1].correctionUrl).toBe('https://bo.kodland.org/groups/10');
  });

  it('parses lesson materials and builds the Kodland lesson page URL', () => {
    const group = normalizeKodlandGroup({
      id: 10,
      title: 'Turma A',
      course: { id: 1192, title: 'Python Start' },
      students_count: 1,
    });
    expect(group).not.toBeNull();

    expect(parseKodlandLessonsPayload(group!, [{
      lesson_id: 20836,
      lesson_number: 12,
      lesson_theme: 'Funcoes',
      lesson_passed: false,
      lesson_date: '2026-06-10',
      slide_url: 'https://slides.kodland.test/20836',
    }, {
      id: '',
      lesson_number: 13,
    }], {
      modules: [{
        lessons: [{
          lesson_id: 20836,
          teacher_scenario_url: 'https://roteiros.kodland.test/20836',
        }],
      }],
    })).toEqual([{
      id: '10-20836',
      externalClassId: '10',
      externalClassName: 'Turma A',
      courseId: '1192',
      lessonId: '20836',
      lessonNumber: 12,
      lessonTitle: 'Funcoes',
      lessonDate: '2026-06-10',
      lessonPassed: false,
      materialUrl: 'https://bo.kodland.org/courses/1192?lessonId=20836',
      slideUrl: 'https://slides.kodland.test/20836',
      slideTitle: '',
      slideMaterialId: '',
      scriptUrl: 'https://roteiros.kodland.test/20836',
      scriptTitle: '',
      scriptMaterialId: '',
    }]);
  });

  it('leaves direct material links empty when a lesson has no direct slide or script fields', () => {
    const group = normalizeKodlandGroup({ id: 10, title: 'Turma A', students_count: 1 });
    expect(group).not.toBeNull();

    expect(parseKodlandLessonsPayload(group!, [{
      lesson_id: 20836,
      lesson_number: 12,
      lesson_title: 'Loops',
      lesson_passed: false,
    }])[0]).toMatchObject({
      materialUrl: 'https://bo.kodland.org/groups/10',
      slideUrl: '',
      scriptUrl: '',
    });
  });

  it('extracts course and lesson ids from the next lesson URL', () => {
    const url = 'https://bo.kodland.org/courses/1192?lessonId=21674';
    expect(courseIdFromKodlandLessonUrl(url)).toBe('1192');
    expect(lessonIdFromKodlandLessonUrl(url)).toBe('21674');
  });

  it('parses Kodland study guide materials into slide and roteiro links', () => {
    expect(parseKodlandStudyGuideMaterialsPayload('1192', '21674', [
      { id: 48806, title: 'M1L4 Apresentação de Slides', link: 'https://docs.google.com/presentation/d/slides/edit' },
      { id: 50771, title: 'M1L4', link: 'https://slack.com/archives/roteiro' },
    ])).toEqual({
      slideUrl: 'https://docs.google.com/presentation/d/slides/edit',
      slideTitle: 'M1L4 Apresentação de Slides',
      slideMaterialId: '48806',
      scriptUrl: 'https://slack.com/archives/roteiro',
      scriptTitle: 'M1L4',
      scriptMaterialId: '50771',
    });
  });

  it('falls back to the authenticated material download URL when a guide has no direct link', () => {
    expect(parseKodlandStudyGuideMaterialsPayload('1192', '21674', [
      { id: 48806, title: 'M1L4 Apresentação de Slides' },
      { id: 50771, title: 'M1L4' },
    ])).toMatchObject({
      slideUrl: 'https://backoffice.kodland.org/api/v2/materials/48806/download',
      scriptUrl: 'https://backoffice.kodland.org/api/v2/materials/50771/download',
    });
  });
});
