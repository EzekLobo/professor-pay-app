import { describe, expect, it } from "vitest";
import { enrichKodlandLessons, type KodlandLesson } from "@/lib/kodland-lessons";

const lesson: KodlandLesson = {
  id: "20849",
  external_class_id: "61918",
  external_class_name: "PRM_BRA1919_SEG-19",
  lesson_number: 29,
  title: "M8.L1 O Chão é lava. Variáveis",
  theme: "",
  lesson_date: "2026-10-05",
  start_time: "19:00",
  end_time: "20:30",
  status: "",
  lesson_passed: false,
  external_url: "https://bo.kodland.org/groups/61918#lesson-20849",
  slides_url: "",
  guide_url: "",
  homework_url: "",
  homework_title: "",
};

describe("enrichKodlandLessons", () => {
  it("maps course materials and homework onto a scheduled lesson", () => {
    const [result] = enrichKodlandLessons([lesson], [{
      id: "20849",
      lesson_number: 29,
      title: lesson.title,
      materials: [
        { title: "Apresentação M8L1", link: "https://docs.google.com/presentation/d/slides/edit" },
        { title: "M8L1", link: "https://wiki.kodland.org/s/lesson-guide" },
      ],
      homework: [{ id: 135019, title: "Completando o mapa" }],
    }], "1192");

    expect(result.external_url).toBe("https://bo.kodland.org/courses/1192?lessonId=20849");
    expect(result.slides_url).toContain("docs.google.com/presentation");
    expect(result.guide_url).toContain("wiki.kodland.org");
    expect(result.homework_url).toBe("https://learn.kodland.org/pt/task/135019/teacher/do");
    expect(result.homework_title).toBe("Completando o mapa");
  });
});
