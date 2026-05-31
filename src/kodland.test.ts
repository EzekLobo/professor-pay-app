import { describe, expect, it } from 'vitest';
import { enrichKodlandStudentFromDetail, normalizeKodlandGroup, normalizeKodlandStudent, parseKodlandGroupStudentsPayload, parseKodlandStudentsPayload, syncKodlandStudents } from './kodland';

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
});
