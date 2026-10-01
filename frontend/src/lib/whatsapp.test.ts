import { describe, expect, it } from "vitest";
import { normalizeWhatsAppNumber, whatsappUrl } from "./whatsapp";

describe("WhatsApp contacts", () => {
  it("returns empty values without generating an invalid link", () => {
    expect(normalizeWhatsAppNumber("")).toBe("");
    expect(whatsappUrl("", "Olá")).toBe("");
  });

  it("normalizes local, country-code and 00-prefixed numbers", () => {
    expect(normalizeWhatsAppNumber("(11) 99999-0000")).toBe("5511999990000");
    expect(normalizeWhatsAppNumber("+55 11 99999-0000")).toBe("5511999990000");
    expect(normalizeWhatsAppNumber("0055 11 99999-0000")).toBe("5511999990000");
  });

  it("encodes the editable message in the link", () => {
    expect(whatsappUrl("11999990000", "Olá, responsável!")).toBe("https://wa.me/5511999990000?text=Ol%C3%A1%2C%20respons%C3%A1vel!");
  });
});
