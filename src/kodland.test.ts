import { describe, expect, it } from 'vitest';
import { normalizeKodlandGroup, normalizeKodlandStudent, parseKodlandGroupStudentsPayload, parseKodlandStudentsPayload, syncKodlandStudents } from './kodland';

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
      status: '',
      progressSummary: '',
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
        status: 'active',
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
      status: 'active',
      progressSummary: '50/100',
      externalClassId: '10',
      externalClassName: 'Turma A',
      rawData: {
        studentId: '42',
        name: 'Ana Silva',
        email: 'ana@example.test',
        status: 'active',
        totalCurrentGrade: 0,
        totalMaxGrade: 0,
        rating: 0,
        ratingMax: 0,
        progressSummary: '50/100',
      },
    }]);
  });
});
