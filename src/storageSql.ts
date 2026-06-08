export const resetDatabaseSql = `
  DELETE FROM pending_reviews;
  DELETE FROM kodland_lessons;
  DELETE FROM class_students;
  DELETE FROM students;
  DELETE FROM kodland_student_groups;
  DELETE FROM kodland_class_links;
  DELETE FROM kodland_groups;
  DELETE FROM payment_confirmations;
  DELETE FROM lessons;
  DELETE FROM classes;
  INSERT OR REPLACE INTO app_settings (key, value) VALUES ('initialized', 'true');
  INSERT OR REPLACE INTO app_settings (key, value) VALUES ('real_seed_2026_05', 'skipped_after_reset');
  INSERT OR REPLACE INTO app_settings (key, value) VALUES ('pending_reviews_snapshot_version', 'submitted_only_v2');
  INSERT OR REPLACE INTO app_settings (key, value) VALUES ('kodland_pending_reviews_last_sync', '');
`;
