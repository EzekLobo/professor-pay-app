import { ClassRecord, LessonRecord, PaymentConfirmation } from './types';

/** Stable, portable snapshot of the legacy Expo SQLite database. */
export type AulaPayExport = {
  schemaVersion: '1.0';
  exportId: string;
  exportedAt: string;
  classes: ClassRecord[];
  lessons: LessonRecord[];
  paymentConfirmations: PaymentConfirmation[];
};

export function buildAulaPayExport(
  classes: ClassRecord[],
  lessons: LessonRecord[],
  paymentConfirmations: PaymentConfirmation[],
  now = new Date(),
  random = Math.random,
): AulaPayExport {
  return {
    schemaVersion: '1.0',
    // The ID is intentionally generated per export, not per database. It is the server idempotency key.
    exportId: `expo-${now.toISOString()}-${Math.floor(random() * 1_000_000_000)}`,
    exportedAt: now.toISOString(),
    classes,
    lessons,
    paymentConfirmations,
  };
}
