import { describe, expect, it } from "vitest";
import { attendanceDateFromSchedule } from "./attendance-schedule";
import type { KodlandGroup, KodlandLesson } from "./api";

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
  it("uses a dated calendar lesson as the anchor for an undated attendance record", () => {
    const target = lesson(17);
    expect(attendanceDateFromSchedule(
      { lesson_date: "" },
      target,
      [target, lesson(19, "2026-10-20")],
      undefined,
    )).toBe("2026-10-06");
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
