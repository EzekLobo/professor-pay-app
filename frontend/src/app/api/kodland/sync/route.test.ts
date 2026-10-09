import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  availabilityFromTeacherTimetable,
  correctionUrlFor,
  extrasFromStudentAgenda,
  extrasFromTeacherAgenda,
  mergeExtraLessons,
  teacherCalendarWeekDates,
  POST,
} from "./route";

describe("sync diagnostics", () => {
  it("returns a traceable 401 without logging submitted credentials", async () => {
    const syncId = "dcc96280-3a27-4353-83ab-9c89822a53b9";
    const log = vi.spyOn(console, "info").mockImplementation(() => undefined);
    try {
      const response = await POST(new NextRequest("https://example.test/api/kodland/sync", {
        method: "POST",
        headers: { "x-sync-id": syncId, "content-type": "application/json" },
        body: JSON.stringify({ username: "private-user", password: "private-password" }),
      }));
      expect(response.status).toBe(401);
      expect(response.headers.get("x-sync-id")).toBe(syncId);
      expect(await response.json()).toEqual({ code: "firebase_session_expired" });
      const output = log.mock.calls.flat().join(" ");
      expect(output).toContain(syncId);
      expect(output).not.toContain("private-user");
      expect(output).not.toContain("private-password");
    } finally {
      log.mockRestore();
    }
  });
});

describe("correctionUrlFor", () => {
  it("builds a task review URL for the specific student when the API has no direct link", () => {
    expect(correctionUrlFor({
      link: "",
      taskId: "134665",
      studentId: "1874729",
      groupId: "62934",
    })).toBe("https://learn.kodland.org/pt/task/134665/check/1874729");
  });

  it("adds the student to a generic Kodland task check link", () => {
    expect(correctionUrlFor({
      link: "https://learn.kodland.org/pt/task/134665/check/",
      taskId: "134665",
      studentId: "1874729",
      groupId: "62934",
    })).toBe("https://learn.kodland.org/pt/task/134665/check/1874729");
  });
});

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

describe("extra lesson reconciliation", () => {
  it("treats an approved request with a recording as a completed financial lesson", () => {
    const [extra] = extrasFromStudentAgenda(
      [
        {
          extra_lesson_id: "approved-extra",
          is_extra: true,
          date: "2026-10-14",
          start_time: "19:00",
          status: "Approved",
          recording_url: "https://recordings.example/approved-extra",
        },
      ],
      students[0],
      "2026-10-14",
    );

    expect(extra.completed).toBe(true);
  });

  it("does not treat an approved request without a recording as completed", () => {
    const [extra] = extrasFromStudentAgenda(
      [
        {
          extra_lesson_id: "approved-without-recording",
          is_extra: true,
          date: "2026-10-14",
          start_time: "19:00",
          status: "Approved",
        },
      ],
      students[0],
      "2026-10-14",
    );

    expect(extra.completed).toBe(false);
  });

  it("uses an available recording when the provider has no lesson state", () => {
    const [extra] = extrasFromStudentAgenda(
      [
        {
          extra_lesson_id: "recorded-extra",
          is_extra: true,
          date: "2026-10-14",
          start_time: "19:00",
          recording_url: "https://recordings.example/recorded-extra",
        },
      ],
      students[0],
      "2026-10-14",
    );

    expect(extra.completed).toBe(true);
  });

  it("uses the teacher calendar's rescheduled slot without losing completion", () => {
    const [scheduled] = extrasFromTeacherAgenda(
      [
        {
          extra_lesson_id: "rescheduled-extra",
          start_time: "2026-10-21T22:00:00Z",
          end_time: "2026-10-21T23:00:00Z",
          student_full_name: "Lucas Martin",
        },
      ],
      students,
      "2026-10-21",
    );
    const [completed] = extrasFromStudentAgenda(
      [
        {
          extra_lesson_id: "rescheduled-extra",
          is_extra: true,
          date: "2026-10-14",
          start_time: "19:00",
          completed: true,
          status: "Completed",
        },
      ],
      students[0],
      "2026-10-14",
    );

    expect(mergeExtraLessons([scheduled], [completed])).toEqual([
      expect.objectContaining({
        id: "kodland-extra-rescheduled-extra",
        lesson_date: "2026-10-21",
        start_time: "19:00",
        completed: true,
      }),
    ]);
  });

  it("keeps a future extra pending even when its payload is prematurely marked complete", () => {
    const [extra] = extrasFromStudentAgenda(
      [
        {
          extra_lesson_id: "future-extra",
          is_extra: true,
          date: "2026-10-14",
          start_time: "19:00",
          completed: true,
          status: "Completed",
        },
      ],
      students[0],
      "2026-10-08",
    );

    expect(extra.completed).toBe(false);
  });
});
