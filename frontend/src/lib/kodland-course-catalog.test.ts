import { expect, it } from "vitest";
import { catalogLessons, mergeCourseCatalog, parseCatalogCourses } from "./kodland-course-catalog";
import { groupKodlandLessonsByCourse } from "./kodland-course-groups";

it("keeps Roblox variants with the same name distinct, even without groups", () => {
  const courses = parseCatalogCourses([1721, 1192, 1184].map(id => ({ id, title: "Roblox", ignored_private_field: "discard" })));
  expect(groupKodlandLessonsByCourse([], [], courses).map(course => course.id)).toEqual(["course-1721", "course-1192", "course-1184"]);
  expect(courses[0]).not.toHaveProperty("ignored_private_field");
});
it("retains loaded materials by course and lesson IDs, never by a shared lesson index", () => {
  const [a, b] = parseCatalogCourses([{ id: "a", title: "Roblox" }, { id: "b", title: "Roblox" }]);
  a.lessons = catalogLessons(a, [{ id: "same", title: "A", lesson_number: 1, materials: [], homework: [] }]);
  b.lessons = catalogLessons(b, [{ id: "same", title: "B", lesson_number: 1, materials: [], homework: [] }]);
  const previous = [{ ...a, lessons: [{ ...a.lessons[0], slides_url: "https://example.test/a", materials_status: "ready" as const }] }];
  const merged = mergeCourseCatalog([a, b], previous);
  expect(merged[0].lessons[0].slides_url).toBe("https://example.test/a");
  expect(merged[1].lessons[0].slides_url).toBe("");
  expect(merged[0].lessons[0].id).not.toBe(merged[1].lessons[0].id);
});
