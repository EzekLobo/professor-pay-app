import { describe, expect, it } from "vitest";
import { isHttpUrl, pendingManualActivities, type ManualActivity } from "@/lib/manual-pedagogy";

const activity = (status: ManualActivity["status"], text = "", url = ""): ManualActivity => ({
  id: crypto.randomUUID(), class_id: "class-1", student_id: "student-1",
  occurrence_id: "manual:class-1:slot-1:2026-10-15", title: "Projeto",
  description: "", submission_text: text, submission_url: url, feedback: "",
  status, created_at: "2026-10-15T12:00:00Z", updated_at: "2026-10-15T12:00:00Z",
});

describe("atividade própria", () => {
  it("conta apenas entregas que ainda aguardam correção", () => {
    const pendingText = activity("pending", "Minha resposta");
    const pendingLink = activity("pending", "", "https://example.test/trabalho");
    expect(pendingManualActivities([activity("pending"), pendingText, pendingLink, activity("completed", "Corrigida")]))
      .toEqual([pendingText, pendingLink]);
  });
  it("aceita apenas links web", () => {
    expect(isHttpUrl("https://example.test/aula")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("file:///tmp/aula")).toBe(false);
  });
});
