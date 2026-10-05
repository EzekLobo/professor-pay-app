import { describe, expect, it } from "vitest";
import {
  allowedMaterialUrl,
  courseImportCatalog,
  courseLessonFromSource,
  mapWithConcurrency,
  validateImportRequest,
} from "./course-import";

describe("course import security contract", () => {
  it("keeps the catalog server controlled", () => {
    expect(courseImportCatalog()).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "roblox", providerCourseId: "1192", available: true }),
      expect.objectContaining({ id: "scratch", providerCourseId: "1183", available: true }),
      expect.objectContaining({ id: "python", available: false }),
    ]));
    expect(courseImportCatalog("python:9001").find((course) => course.id === "python"))
      .toMatchObject({ providerCourseId: "9001", available: true });
  });

  it("rejects arbitrary courses, oversized credentials and unrecognized fields", () => {
    expect(() => validateImportRequest({ courseId: "999", username: "a", password: "b" })).toThrow("Curso não permitido");
    expect(() => validateImportRequest({ courseId: "roblox", username: "a", password: "b", url: "https://evil.test" })).toThrow("campos não permitidos");
    expect(() => validateImportRequest({ courseId: "roblox", username: "", password: "b" })).toThrow("credenciais");
  });

  it("exposes only https links from material hosts", () => {
    expect(allowedMaterialUrl("https://wiki.kodland.org/home")).toBe("https://wiki.kodland.org/home");
    expect(allowedMaterialUrl("http://wiki.kodland.org/home")).toBe("");
    expect(allowedMaterialUrl("https://evil.test/redirect")).toBe("");
    expect(allowedMaterialUrl("javascript:alert(1)")).toBe("");
  });

  it("removes unsafe source material links from lesson output", () => {
    const lesson = courseLessonFromSource("1192", {
      id: "20849",
      lesson_number: 1,
      title: "Aula inicial",
      materials: [
        { title: "Slides", link: "https://docs.google.com/presentation/d/abc" },
        { title: "Roteiro", link: "https://evil.test/guide" },
      ],
      homework: [{ id: "12", title: "Atividade" }],
    });
    expect(lesson.external_url).toContain("https://bo.kodland.org/courses/1192");
    expect(lesson.slides_url).toContain("https://docs.google.com/");
    expect(lesson.guide_url).toBe("");
    expect(lesson.homework_url).toContain("https://learn.kodland.org/");
  });

  it("bounds concurrent requests", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6], 99, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active -= 1;
      return value * 2;
    });
    expect(result).toEqual([2, 4, 6, 8, 10, 12]);
    expect(peak).toBeLessThanOrEqual(5);
  });
});
