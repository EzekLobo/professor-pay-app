import { describe, expect, it } from "vitest";
import { attendanceDateFromSchedule, attendanceLessonParts, lessonForAttendance } from "./attendance-schedule";
import type { KodlandAttendance, KodlandGroup, KodlandLesson } from "./api";

const lesson = (courseIndex: number, lessonDate = ""): KodlandLesson => ({
  id: `lesson-${courseIndex}`,
  source_lesson_id: `source-${courseIndex}`,
  external_class_id: "group-1",
  external_class_name: "Turma",
  module_number: "7",
  lesson_number: courseIndex - 16,
  course_index: courseIndex,
  title: `M7.L${courseIndex - 16}`,
  theme: "",
  lesson_date: lessonDate,
  start_time: "19:00",
  end_time: "20:30",
  status: "",
  lesson_passed: true,
  external_url: "",
  slides_url: "",
  guide_url: "",
  homework_url: "",
  homework_title: "",
  classroom_tasks: [],
});

describe("attendanceDateFromSchedule", () => {
  it("uses a numeric global lesson id only to find the real module-local code", () => {
    const catalog = [25, 26, 27, 28].map((courseIndex) => ({
      ...lesson(courseIndex),
      lesson_number: courseIndex,
      title: `M7.L${courseIndex}`,
    }));

    catalog.forEach((catalogLesson, index) => {
      const attendance = {
        lesson_id: String(catalogLesson.course_index),
        lesson_title: `Aula M7.L${catalogLesson.course_index}`,
        external_class_id: "group-1",
        lesson_date: "",
        start_time: "",
      } as KodlandAttendance;
      expect(lessonForAttendance(attendance, catalog)).toBe(catalogLesson);
      expect(attendanceLessonParts(attendance, catalog)).toEqual({ module: "M7", lesson: `L${index + 1}` });
    });
  });

  it("preserves a module-local code already supplied by the attendance grid", () => {
    const attendance = {
      lesson_id: "provider-id",
      lesson_title: "Aula M9.L2",
      external_class_id: "group-1",
      lesson_date: "",
      start_time: "",
    } as KodlandAttendance;
    expect(attendanceLessonParts(attendance, [])).toEqual({ module: "M9", lesson: "L2" });
  });

  it("uses a dated calendar lesson as the anchor for an undated attendance record", () => {
    const target = lesson(17);
    expect(attendanceDateFromSchedule(
      { lesson_date: "" },
      target,
      [target, lesson(19, "2026-10-20")],
      undefined,
    )).toBe("2026-10-06");
  });

  it("uses the calendar date instead of a conflicting attendance date", () => {
    const scheduled = lesson(18, "2026-10-19");
    expect(attendanceDateFromSchedule(
      { lesson_date: "2026-10-12" },
      scheduled,
      [scheduled],
      undefined,
    )).toBe("2026-10-19");
  });

  it("uses the group's next scheduled lesson without assuming module size", () => {
    const target = lesson(17);
    const next = lesson(20);
    const group = {
      external_id: "group-1",
      next_lesson_id: next.source_lesson_id,
      next_lesson_date: "2026-10-27T19:00:00-03:00",
      next_lesson_number: 20,
      start_date: "2026-06-30T19:00:00-03:00",
    } as KodlandGroup;
    expect(attendanceDateFromSchedule({ lesson_date: "" }, target, [target, next], group)).toBe("2026-10-06");
  });
});
