import { expect, it } from "vitest";
import { DEFAULT_WELCOME_MESSAGE, renderWelcomeMessage, validateWelcomeMessage } from "./welcome-message";
import { defaultNotificationSettings, validateNotificationSettings } from "./student-notification-rules";
it("renders the student, class and guardian without leaving unresolved welcome tokens", () => {
  expect(renderWelcomeMessage("Olá {responsavel}, bem-vindos! {aluno} — {turma}", "Ana", "Roblox", "Maria")).toBe("Olá Maria, bem-vindos! Ana — Roblox");
  expect(renderWelcomeMessage(DEFAULT_WELCOME_MESSAGE, "Ana")).toContain("responsável");
  expect(renderWelcomeMessage(DEFAULT_WELCOME_MESSAGE, "Ana")).not.toMatch(/\{[^}]+\}/);
});
it("upgrades existing settings and preserves custom welcome text", () => {
  const old = defaultNotificationSettings(); delete old.welcome_message_template;
  expect(validateNotificationSettings(old).welcome_message_template).toBe(DEFAULT_WELCOME_MESSAGE);
  expect(validateNotificationSettings({ ...old, welcome_message_template: "Bem-vindo, {aluno}!" }).welcome_message_template).toBe("Bem-vindo, {aluno}!");
});
it("rejects blank, oversized and unsupported welcome messages", () => {
  for (const text of [" ", "a".repeat(5001), "Olá {senha}"]) expect(() => validateWelcomeMessage(text)).toThrow();
});
