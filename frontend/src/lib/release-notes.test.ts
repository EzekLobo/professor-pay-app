import { describe, expect, it } from "vitest";
import { latestReleaseVersion, RELEASE_NOTES, releaseCursor, unreadReleaseNotes } from "./release-notes";

describe("novidades por versão", () => {
  it("mostra só as versões posteriores à última leitura, da mais nova à mais antiga", () => {
    const seen = RELEASE_NOTES[2].version;
    expect(unreadReleaseNotes(seen)).toEqual(RELEASE_NOTES.slice(0, 2));
  });
  it("não repete as novidades já vistas", () => {
    expect(unreadReleaseNotes(latestReleaseVersion())).toEqual([]);
  });
  it("apresenta as novidades recentes na primeira visita", () => {
    expect(unreadReleaseNotes(0)).toHaveLength(RELEASE_NOTES.length);
  });
  it.each([null, undefined, NaN, -1, "2026102602", 1.5])("trata cursor inválido como primeira visita: %j", (value) => {
    expect(releaseCursor(value)).toBe(0);
  });
  it("não depende da ordem do catálogo nem da data do dispositivo", () => {
    expect(unreadReleaseNotes(0, [...RELEASE_NOTES].reverse())).toEqual(RELEASE_NOTES);
    expect(latestReleaseVersion([])).toBe(0);
  });
  it("mantém versões únicas e links internos válidos", () => {
    expect(new Set(RELEASE_NOTES.map((note) => note.version)).size).toBe(RELEASE_NOTES.length);
    expect(RELEASE_NOTES.every((note) => releaseCursor(note.version) > 0 && /^\/[^/]/.test(note.href) && /^\d{4}-\d{2}-\d{2}$/.test(note.date))).toBe(true);
  });
});
