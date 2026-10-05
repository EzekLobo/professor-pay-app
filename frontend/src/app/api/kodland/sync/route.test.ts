import { describe, expect, it } from "vitest";
import { extrasFromTeacherAgenda } from "./route";

const students = [
  {
    id: "student-1",
    external_id: "2913535",
    name: "Lucas Martin",
    email: "",
    phone: "",
    status: "active",
    progress_summary: "",
    profile_url: "",
    guardian_name: "",
    guardian_relationship: "",
    guardian_phone: "",
    guardian_email: "",
    external_class_id: "61918",
    external_class_name: "PRM_BRA1919_SEG-19",
  },
];

describe("extrasFromTeacherAgenda", () => {
  it("imports the event shape used by the teacher timetable", () => {
    const [extra] = extrasFromTeacherAgenda(
      [
        {
          id: 8801,
          start: "2026-10-07T19:00:00-03:00",
          end: "2026-10-07T20:00:00-03:00",
          title: "- Lucas Martin",
        },
      ],
      students,
    );

    expect(extra).toMatchObject({
      id: "kodland-extra-8801",
      external_student_id: "2913535",
      student_name: "Lucas Martin",
      lesson_date: "2026-10-07",
      start_time: "19:00",
      end_time: "20:00",
      completed: false,
    });
  });
});
