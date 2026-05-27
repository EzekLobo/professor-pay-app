import { describe, expect, it } from 'vitest';
import { validateClassForm, validateExtraLessonForm } from './validation';

describe('form validation', () => {
  it('requires a valid class start date', () => {
    const valid = {
      name: 'Seg 19h',
      weekDay: 'Segunda',
      time: '19:00',
      firstLesson: '2026-05-04',
      lessonCount: '40',
      durationHours: '1.5',
      hourlyRate: '30',
    };

    expect(validateClassForm(valid)).toBeNull();
    expect(validateClassForm({ ...valid, firstLesson: '' })).toContain('data de início');
    expect(validateClassForm({ ...valid, firstLesson: '2026-02-30' })).toContain('data de início');
  });

  it('validates extra lesson date and numeric fields', () => {
    const valid = {
      student: 'Lucas',
      lessonDate: '2026-05-09',
      durationHours: '1',
      hourlyRate: '30',
    };

    expect(validateExtraLessonForm(valid)).toBeNull();
    expect(validateExtraLessonForm({ ...valid, lessonDate: '09/05/2026' })).toContain('data válida');
    expect(validateExtraLessonForm({ ...valid, durationHours: '0' })).toContain('duração');
  });

  it('requires participants for extra lessons', () => {
    expect(validateExtraLessonForm({
      student: '',
      lessonDate: '2026-05-09',
      durationHours: '1',
      hourlyRate: '30',
    })).toContain('participantes');

    expect(validateExtraLessonForm({
      student: 'Lucas, Ana',
      lessonDate: '2026-05-09',
      durationHours: '1',
      hourlyRate: '30',
    })).toBeNull();
  });
});
