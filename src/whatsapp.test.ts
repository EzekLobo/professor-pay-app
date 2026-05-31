import { describe, expect, it } from 'vitest';
import { normalizeWhatsAppPhone } from './whatsapp';

describe('whatsapp phone normalization', () => {
  it('removes formatting and adds Brazil country code for local mobile numbers', () => {
    expect(normalizeWhatsAppPhone('(11) 99999-9999')).toBe('5511999999999');
  });

  it('keeps numbers that already include a country code', () => {
    expect(normalizeWhatsAppPhone('+55 11 99999-9999')).toBe('5511999999999');
  });

  it('rejects empty or too-short values', () => {
    expect(normalizeWhatsAppPhone('')).toBe('');
    expect(normalizeWhatsAppPhone('123')).toBe('');
  });
});
