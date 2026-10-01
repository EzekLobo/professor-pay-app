import { isValidIsoDate } from './calculations';

export type ClassFormInput = {
  name: string;
  time: string;
  firstLesson: string;
  lessonCount: string;
  durationHours: string;
  hourlyRate: string;
};

export type ExtraLessonFormInput = {
  student: string;
  lessonDate: string;
  durationHours: string;
  hourlyRate: string;
};

export function parseDecimal(value: string) {
  return Number(value.replace(',', '.'));
}

export function validateClassForm(input: ClassFormInput): string | null {
  if (!input.name.trim()) return 'Informe o nome da turma.';
  if (!input.time.trim()) return 'Informe o horário.';
  if (!isValidIsoDate(input.firstLesson)) return 'Informe uma data de início válida no formato AAAA-MM-DD.';
  if (!Number.isInteger(Number(input.lessonCount)) || Number(input.lessonCount) < 1) return 'Informe uma quantidade de aulas válida.';
  if (!Number.isFinite(parseDecimal(input.durationHours)) || parseDecimal(input.durationHours) <= 0) return 'Informe uma duração válida.';
  if (!Number.isFinite(parseDecimal(input.hourlyRate)) || parseDecimal(input.hourlyRate) < 0) return 'Informe um valor/h válido.';
  return null;
}

export function validateExtraLessonForm(input: ExtraLessonFormInput): string | null {
  if (!input.student.trim()) return 'Informe os participantes da aula extra.';
  if (!isValidIsoDate(input.lessonDate)) return 'Informe uma data válida no formato AAAA-MM-DD.';
  if (!Number.isFinite(parseDecimal(input.durationHours)) || parseDecimal(input.durationHours) <= 0) return 'Informe uma duração válida.';
  if (!Number.isFinite(parseDecimal(input.hourlyRate)) || parseDecimal(input.hourlyRate) < 0) return 'Informe um valor/h válido.';
  return null;
}
