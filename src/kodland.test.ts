import { describe, expect, it } from 'vitest';
import { normalizeKodlandStudent, parseKodlandStudentsPayload, syncKodlandStudents } from './kodland';

describe('kodland student import', () => {
  it('normalizes common student and class fields while preserving raw data', () => {
    expect(normalizeKodlandStudent({
      student_id: 42,
      full_name: 'Ana Silva',
      group_id: 'group-1',
      group_name: 'Terça 20h',
      phone: '11999999999',
    })).toEqual({
      externalId: '42',
      name: 'Ana Silva',
      externalClassId: 'group-1',
      externalClassName: 'Terça 20h',
      rawData: {
        student_id: 42,
        full_name: 'Ana Silva',
        group_id: 'group-1',
        group_name: 'Terça 20h',
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
      message: 'Informe usuário e senha da Kodland.',
    });
  });
});
