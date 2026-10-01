const digitsOnly = (value: string) => value.replace(/\D/g, "");

/** Returns a WhatsApp-compatible international number or an empty string. */
export function normalizeWhatsAppNumber(value: string, countryCode = "55") {
  const digits = digitsOnly(value);
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  return digits.startsWith(countryCode) ? digits : `${countryCode}${digits}`;
}

export function whatsappUrl(value: string, message = "", countryCode = "55") {
  const number = normalizeWhatsAppNumber(value, countryCode);
  if (!number) return "";
  const query = message.trim() ? `?text=${encodeURIComponent(message.trim())}` : "";
  return `https://wa.me/${number}${query}`;
}
