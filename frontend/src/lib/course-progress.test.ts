import { describe, expect, it } from "vitest";
import type { KodlandGroup, KodlandLesson } from "./api";
import { kodlandCourseProgress } from "./course-progress";

const lessons = Array.from({ length: 40 }, (_, index) => ({
  id: `group--${index + 1}`, source_lesson_id: String(index + 1), course_index: index + 1,
  title: `M${Math.floor(index / 4) + 1}.L${index % 4 + 1}`, status: "Scheduled", lesson_passed: false,
} as KodlandLesson));
const group = (fields: Partial<KodlandGroup>) => fields as KodlandGroup;

describe("completed course lessons", () => {
  it("resolves the next catalog ID even when the provider omits its numeric position", () => {
    expect(kodlandCourseProgress(group({ next_lesson_number: 0, next_lesson_id: "29" }), lessons)).toEqual({ total: 40, completed: 28, percent: 70 });
  });
  it("uses the module-local code against the catalog, not as a global number", () => {
    expect(kodlandCourseProgress(group({ next_lesson_title: "М8.L2 Projeto" }), lessons)).toEqual({ total: 40, completed: 29, percent: 73 });
  });
  it("distinguishes unknown progress from a confirmed start at zero", () => {
    expect(kodlandCourseProgress(group({ next_lesson_number: 0 }), lessons).percent).toBeNull();
    expect(kodlandCourseProgress(group({ next_lesson_id: "1" }), lessons)).toEqual({ total: 40, completed: 0, percent: 0 });
  });
  it("uses explicit completed lessons at the end and keeps duplicates from lowering progress", () => {
    const completed = lessons.map(lesson => ({ ...lesson, lesson_passed: true }));
    expect(kodlandCourseProgress(group({}), [...completed, lessons[0]])).toEqual({ total: 40, completed: 40, percent: 100 });
  });
  it("counts only remaining non-cancelled lessons before the next one", () => {
    const catalog = lessons.map((lesson, index) => index === 1 ? { ...lesson, status: "Cancelled" } : lesson);
    expect(kodlandCourseProgress(group({ next_lesson_id: "4" }), catalog)).toEqual({ total: 39, completed: 2, percent: 5 });
  });
  it("uses a unique scheduled date when metadata omits both ID and position", () => {
    const catalog = lessons.map((lesson, index) => index === 28 ? { ...lesson, lesson_date: "2026-11-06" } : lesson);
    expect(kodlandCourseProgress(group({ next_lesson_date: "2026-11-06T19:00:00-03:00" }), catalog)).toEqual({ total: 40, completed: 28, percent: 70 });
    const ambiguous = [...catalog, { ...catalog[28], id: "other", source_lesson_id: "other" }];
    expect(kodlandCourseProgress(group({ next_lesson_date: "2026-11-06" }), ambiguous).percent).toBeNull();
  });
});
