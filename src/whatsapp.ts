export function normalizeWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits.length >= 8 ? digits : '';
}
