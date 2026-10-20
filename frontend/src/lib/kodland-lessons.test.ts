import { describe, expect, it } from "vitest";
import {
  enrichKodlandLessons,
  matchKodlandCourseLesson,
  kodlandLessonLocation,
  mergeKodlandLessons,
  parseKodlandLessonsPayload,
  type KodlandLesson,
} from "@/lib/kodland-lessons";

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
  classroom_tasks: [],
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
      classroom: [{ id: 135016, title: "Vamos ajudar o chefe!" }],
    }], "1192");

    expect(result.external_url).toBe("https://bo.kodland.org/courses/1192?lessonId=20849");
    expect(result.slides_url).toContain("docs.google.com/presentation");
    expect(result.guide_url).toContain("wiki.kodland.org");
    expect(result.homework_url).toBe("https://learn.kodland.org/pt/task/135019/teacher/do");
    expect(result.homework_title).toBe("Completando o mapa");
    expect(result.classroom_tasks).toEqual([
      {
        title: "Vamos ajudar o chefe!",
        url: "https://learn.kodland.org/pt/task/135016/teacher/do",
      },
    ]);
  });

  it("uses the global lesson index displayed by the schedule code", () => {
    const [scheduled] = parseKodlandLessonsPayload(
      [{
        id: "calendar-event-28",
        lesson: "M7L28",
        module_number: 7,
        title: "BRA2037_QUI-20",
        date: "2026-10-08",
        start_time: "20:00",
        end_time: "21:30",
      }],
      { external_id: "62934", title: "BRA2037_QUI-20" },
      "schedule",
    );

    expect(scheduled.course_index).toBe(28);
    expect(scheduled.lesson_number).toBe(28);
    expect(kodlandLessonLocation(scheduled)).toBe("M7L28");

    const [matched] = enrichKodlandLessons(
      [scheduled],
      [{
        id: "20831",
        lesson_number: 4,
        course_index: 28,
        title: "M7.L4 Promovendo nossos jogos",
        materials: [
          { title: "Slides M7L4", link: "https://docs.google.com/presentation/d/lesson28/edit" },
        ],
        homework: [],
        classroom: [],
      }],
      "1192",
    );
    expect(matched.slides_url).toContain("lesson28");
    expect(matched.external_url).toContain("lessonId=20831");
    expect(kodlandLessonLocation(matched)).toBe("M7L4");

    const [localizedTitle] = parseKodlandLessonsPayload(
      [{
        id: "calendar-event-28b",
        module_number: 7,
        lesson_number: 28,
        title: "M7.L4 Promovendo nossos jogos",
        date: "2026-10-08",
      }],
      { external_id: "62934", title: "BRA2037_QUI-20" },
      "schedule",
    );
    expect(localizedTitle.course_index).toBe(28);
  });

  it("keeps an explicit global index when the schedule code is module-local", () => {
    const [scheduled] = parseKodlandLessonsPayload(
      [{
        id: "calendar-event-30",
        lesson: "M8.L2",
        lesson_number: 30,
        module_number: 8,
        title: "M8.L2 O Chão é Lava. Funções",
        date: "2026-10-19",
        start_time: "19:00",
      }],
      { external_id: "61918", title: "PRM_BRA1919_SEG-19" },
      "schedule",
    );

    expect(scheduled.course_index).toBe(30);
    expect(scheduled.lesson_number).toBe(30);
    expect(scheduled.schedule_code).toBe("M8L2");

    const [matched] = enrichKodlandLessons(
      [scheduled],
      [{
        id: "20850",
        lesson_number: 2,
        course_index: 30,
        title: "M8.L2 O Chão é Lava. Funções",
        materials: [], homework: [], classroom: [],
      }],
      "1192",
    );
    expect(kodlandLessonLocation(matched)).toBe("M8L2");
    expect(matched.external_url).toContain("lessonId=20850");
  });

  it("keeps the complete calendar when the payload also has a short item list", () => {
    const scheduled = parseKodlandLessonsPayload({
      items: [{
        id: "calendar-event-29",
        lesson: "M8.L1",
        lesson_number: 29,
        date: "2026-10-05",
        start_time: "19:00",
      }],
      schedule: [{
        id: "calendar-event-30",
        lesson: "M8.L2",
        lesson_number: 30,
        date: "2026-10-19",
        start_time: "19:00",
      }],
    }, { external_id: "61918", title: "PRM_BRA1919_SEG-19" }, "schedule");

    expect(scheduled.map((item) => [item.schedule_code, item.lesson_date])).toEqual([
      ["M8L1", "2026-10-05"],
      ["M8L2", "2026-10-19"],
    ]);
  });

  it("uses the schedule code before a conflicting timetable-event ID", () => {
    const scheduled = {
      ...lesson,
      id: "20851",
      schedule_code: "M8L2",
      course_index: 30,
      lesson_number: 30,
      title: "PRM_BRA1919_SEG-19",
    };
    const match = matchKodlandCourseLesson(scheduled, [
      { id: "20850", lesson_number: 2, course_index: 30, title: "M8.L2 O Chão é Lava. Funções", materials: [], homework: [] },
      { id: "20851", lesson_number: 3, course_index: 31, title: "M8.L3 O Chão é Lava. Criando a Contagem", materials: [], homework: [] },
    ]);
    expect(match?.id).toBe("20850");
  });

  it("keeps the timetable code when the same event ID is present in the lesson list", () => {
    const [merged] = mergeKodlandLessons(
      [{ id: "20851", lesson_title: "M8.L2 O Chão é Lava. Funções", lesson_number: 30, date: "2026-10-19" }],
      [{ id: "20851", lesson_number: 31, title: "M8.L3 O Chão é Lava. Lobby" }],
      { external_id: "61918", title: "PRM_BRA1919_SEG-19" },
    );

    expect(merged.schedule_code).toBe("M8L2");
    expect(matchKodlandCourseLesson(merged, [
      { id: "20850", lesson_number: 2, course_index: 30, title: "M8.L2 O Chão é Lava. Funções", materials: [], homework: [] },
      { id: "20851", lesson_number: 3, course_index: 31, title: "M8.L3 O Chão é Lava. Lobby", materials: [], homework: [] },
    ])?.id).toBe("20850");
  });
});
