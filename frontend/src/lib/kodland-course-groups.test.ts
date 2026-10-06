import { describe, expect, it } from "vitest";
import type { KodlandGroup, KodlandLesson } from "@/lib/api";
import { groupKodlandLessonsByCourse } from "@/lib/kodland-course-groups";

const group = (id: string, title: string): KodlandGroup => ({
  id,
  external_id: id,
  title,
  course_id: "1192",
  course_name: "[1192]Roblox Game Developer 10-12[None][10-12][90 min][40 L][Brazil][actual]",
  student_count: 8,
  start_date: "2026-01-01",
  next_lesson_date: "2026-10-05",
  archived: false,
  local_class_id: null,
  created_at: "2026-01-01",
});

const lesson = (classId: string, index: number, slidesUrl = ""): KodlandLesson => ({
  id: `lesson-${index}`,
  external_class_id: classId,
  external_class_name: classId,
  module_number: "7",
  lesson_number: index === 28 ? 4 : index,
  course_index: index,
  title: `M7.L${index === 28 ? 4 : index} Aula ${index}`,
  theme: "",
  lesson_date: "2026-10-05",
  start_time: "20:00",
  end_time: "21:30",
  status: "",
  lesson_passed: false,
  external_url: "",
  slides_url: slidesUrl,
  guide_url: "",
  homework_url: "",
  homework_title: "",
  classroom_tasks: [],
});

describe("groupKodlandLessonsByCourse", () => {
  it("shows one course with its classes combined and deduplicated lessons", () => {
    const groups = [group("group-a", "PRM_BRA1919_SEG-19"), group("group-b", "BRA2037_QUI-20"), group("group-c", "PRM_BRA2429_TER-20")];
    const lessons = groups.flatMap((item) => [lesson(item.external_id, 1), lesson(item.external_id, 28)]);
    lessons[1].slides_url = "https://docs.google.com/presentation/d/course-28";

    const [course] = groupKodlandLessonsByCourse(groups, lessons);

    expect(course.name).toBe("Roblox Game Developer 10-12");
    expect(course.groups).toHaveLength(3);
    expect(course.lessons).toHaveLength(2);
    expect(course.lessons.map((item) => item.course_index)).toEqual([1, 28]);
    expect(course.lessons[1].slides_url).toContain("course-28");
  });

  it("keeps genuinely different courses separate", () => {
    const python = { ...group("python", "Python Basics"), course_id: "9001", course_name: "Python Basics" };
    expect(groupKodlandLessonsByCourse([group("roblox", "Roblox"), python], [])).toHaveLength(2);
  });
});
