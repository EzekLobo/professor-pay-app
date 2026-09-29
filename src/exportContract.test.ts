import { describe, expect, it } from 'vitest';
import { buildAulaPayExport } from './exportContract';

describe('AulaPayExport', () => {
  it('is versioned and uses a deterministic injectable export id generator', () => {
    const exported = buildAulaPayExport([], [], [], new Date('2026-09-28T10:00:00.000Z'), () => 0.123);
    expect(exported).toMatchObject({
      schemaVersion: '1.0',
      exportedAt: '2026-09-28T10:00:00.000Z',
      exportId: 'expo-2026-09-28T10:00:00.000Z-123000000',
      classes: [],
      lessons: [],
      paymentConfirmations: [],
    });
  });
});
