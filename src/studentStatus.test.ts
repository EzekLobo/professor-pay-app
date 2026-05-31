import { describe, expect, it } from 'vitest';
import {
  compareStudentsByStatusProgressThenName,
  compareStudentsByStatusThenName,
  isExpelledStudentStatus,
  studentPointsLabel,
  studentProgressPoints,
  studentRankPosition,
  studentStatusLabel,
} from './studentStatus';

describe('student status display', () => {
  it('identifies expelled and removed Kodland statuses', () => {
    expect(isExpelledStudentStatus('expelled')).toBe(true);
    expect(isExpelledStudentStatus('student_churned')).toBe(true);
    expect(isExpelledStudentStatus('Removido da turma')).toBe(true);
    expect(isExpelledStudentStatus('active')).toBe(false);
  });

  it('returns a user-facing badge label for expelled students', () => {
    expect(studentStatusLabel('inactive')).toBe('Expulso');
    expect(studentStatusLabel('active')).toBe('');
  });

  it('sorts expelled students after active students', () => {
    expect([
      { name: 'Zoe', status: 'removed' },
      { name: 'Ana', status: 'active' },
      { name: 'Bruno', status: 'inactive' },
      { name: 'Carlos', status: 'active' },
    ].sort(compareStudentsByStatusThenName).map((student) => student.name)).toEqual(['Ana', 'Carlos', 'Bruno', 'Zoe']);
  });

  it('extracts progress points from the Kodland progress summary', () => {
    expect(studentProgressPoints('80/100')).toBe(80);
    expect(studentProgressPoints(' 12.5/20 ')).toBe(12.5);
    expect(studentProgressPoints('')).toBe(0);
    expect(studentProgressPoints('sem progresso')).toBe(0);
  });

  it('formats only the earned points for display', () => {
    expect(studentPointsLabel('480/6031')).toBe('480');
    expect(studentPointsLabel('50/100')).toBe('50');
    expect(studentPointsLabel('')).toBe('');
    expect(studentPointsLabel('sem progresso')).toBe('');
  });

  it('sorts active students by progress points before name fallback', () => {
    expect([
      { name: 'Carlos', status: 'active', progressSummary: '50/100' },
      { name: 'Ana', status: 'active', progressSummary: '80/100' },
      { name: 'Bruno', status: 'active', progressSummary: '80/100' },
      { name: 'Davi', status: 'active', progressSummary: '' },
    ].sort(compareStudentsByStatusProgressThenName).map((student) => student.name)).toEqual(['Ana', 'Bruno', 'Carlos', 'Davi']);
  });

  it('keeps expelled students at the end even with high progress', () => {
    expect([
      { name: 'Zoe', status: 'removed', progressSummary: '100/100' },
      { name: 'Ana', status: 'active', progressSummary: '20/100' },
      { name: 'Bruno', status: 'inactive', progressSummary: '90/100' },
      { name: 'Carlos', status: 'active', progressSummary: '' },
    ].sort(compareStudentsByStatusProgressThenName).map((student) => student.name)).toEqual(['Ana', 'Carlos', 'Bruno', 'Zoe']);
  });

  it('marks top three only for active students with progress points', () => {
    expect(studentRankPosition({ status: 'active', progressSummary: '80/100' }, 0)).toBe(1);
    expect(studentRankPosition({ status: 'active', progressSummary: '20/100' }, 2)).toBe(3);
    expect(studentRankPosition({ status: 'active', progressSummary: '' }, 1)).toBeNull();
    expect(studentRankPosition({ status: 'removed', progressSummary: '100/100' }, 0)).toBeNull();
    expect(studentRankPosition({ status: 'active', progressSummary: '10/100' }, 3)).toBeNull();
  });
});
