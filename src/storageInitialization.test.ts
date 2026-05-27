import { describe, expect, it } from 'vitest';
import { hasExistingUserData } from './storageInitialization';

describe('storage initialization', () => {
  it('detects existing user data before seeding a fresh database marker', () => {
    expect(hasExistingUserData({ classes: 1, lessons: 0, paymentConfirmations: 0 })).toBe(true);
    expect(hasExistingUserData({ classes: 0, lessons: 1, paymentConfirmations: 0 })).toBe(true);
    expect(hasExistingUserData({ classes: 0, lessons: 0, paymentConfirmations: 1 })).toBe(true);
  });

  it('allows initial sample data only when the database is empty', () => {
    expect(hasExistingUserData({ classes: 0, lessons: 0, paymentConfirmations: 0 })).toBe(false);
  });
});
