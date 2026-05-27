import { describe, expect, it } from 'vitest';
import { resetDatabaseSql } from './storageSql';

describe('storage SQL', () => {
  it('clears classes, lessons and payment history on reset', () => {
    expect(resetDatabaseSql).toContain('DELETE FROM payment_confirmations');
    expect(resetDatabaseSql).toContain('DELETE FROM lessons');
    expect(resetDatabaseSql).toContain('DELETE FROM classes');
    expect(resetDatabaseSql).toContain('real_seed_2026_05');
    expect(resetDatabaseSql).toContain('skipped_after_reset');
  });
});
