import { normalizeWhatsAppNumber } from "./whatsapp";
const escapeValue = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/;/g, "\\;").replace(/,/g, "\\,");
/** A downloadable contact is imported by the device's contacts app. */
export function studentContactCard(name: string, phone: string) {
  if (!/^\d{10,15}$/.test(phone.replace(/\D/g, ""))) return null;
  const normalized = normalizeWhatsAppNumber(phone);
  if (!/^\d{10,15}$/.test(normalized)) return null;
  const content = ["BEGIN:VCARD", "VERSION:3.0", `FN:${escapeValue(name)}`, `TEL;TYPE=CELL:+${normalized}`, "END:VCARD", ""].join("\r\n");
  return { href: `data:text/vcard;charset=utf-8,${encodeURIComponent(content)}`, filename: `${name.replace(/[^\p{L}\p{N} -]/gu, "").trim().slice(0, 80) || "contato"}.vcf` };
}
