import { describe, expect, it } from 'vitest';
import { resetDatabaseSql } from './storageSql';

describe('storage SQL', () => {
  it('clears classes, lessons and payment history on reset', () => {
    expect(resetDatabaseSql).toContain('DELETE FROM class_students');
    expect(resetDatabaseSql).toContain('DELETE FROM pending_reviews');
    expect(resetDatabaseSql).toContain('DELETE FROM kodland_lessons');
    expect(resetDatabaseSql).toContain('DELETE FROM students');
    expect(resetDatabaseSql).toContain('DELETE FROM kodland_student_groups');
    expect(resetDatabaseSql).toContain('DELETE FROM kodland_class_links');
    expect(resetDatabaseSql).toContain('DELETE FROM kodland_groups');
    expect(resetDatabaseSql).toContain('DELETE FROM payment_confirmations');
    expect(resetDatabaseSql).toContain('DELETE FROM lessons');
    expect(resetDatabaseSql).toContain('DELETE FROM classes');
    expect(resetDatabaseSql).toContain('real_seed_2026_05');
    expect(resetDatabaseSql).toContain('skipped_after_reset');
    expect(resetDatabaseSql).toContain('pending_reviews_snapshot_version');
    expect(resetDatabaseSql).toContain('submitted_only_v2');
    expect(resetDatabaseSql).toContain('kodland_pending_reviews_last_sync');
  });
});
