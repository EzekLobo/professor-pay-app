import { describe, expect, it } from "vitest";
import {
  availabilityFromTeacherTimetable,
  extrasFromTeacherAgenda,
  teacherCalendarWeekDates,
} from "./route";

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
  it("imports availability hours registered for each weekday", () => {
    expect(
      availabilityFromTeacherTimetable([
        {
          id: 1,
          day_of_week: "wednesday",
          start_hour: "19:00:00",
          end_hour: "22:00:00",
        },
      ]),
    ).toEqual([
      {
        id: "availability-1",
        weekday: 2,
        start_time: "19:00",
        end_time: "22:00",
      },
    ]);
  });
  it("imports the provider payload and converts UTC hours to teacher time", () => {
    const [extra] = extrasFromTeacherAgenda(
      [
        {
          extra_lesson_id: 9901,
          start_time: "2026-10-07T22:00:00Z",
          end_time: "2026-10-07T23:00:00Z",
          student_full_name: "Lucas Martin",
        },
      ],
      students,
    );
    expect(extra).toMatchObject({
      id: "kodland-extra-9901",
      student_name: "Lucas Martin",
      lesson_date: "2026-10-07",
      start_time: "19:00",
      end_time: "20:00",
      completed: false,
    });
  });
  it("queries the current and upcoming teacher-calendar weeks", () => {
    expect(
      teacherCalendarWeekDates(new Date("2026-10-07T12:00:00.000Z")),
    ).toEqual(["2026-09-28", "2026-10-05", "2026-10-12", "2026-10-19"]);
  });

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
