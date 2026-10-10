import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  availabilityFromTeacherTimetable,
  correctionUrlFor,
  extrasFromStudentAgenda,
  extrasFromTeacherAgenda,
  mergeExtraLessons,
  mapWithConcurrency,
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

describe("sync request limits", () => {
  it("never starts more requests than the configured worker limit", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise<void>((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 10;
    });

    expect(result).toEqual([10, 20, 30, 40, 50]);
    expect(peak).toBeLessThanOrEqual(2);
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

  it("updates a pending calendar extra when the student agenda confirms the same slot", () => {
    const [scheduled] = extrasFromTeacherAgenda(
      [
        {
          id: "calendar-event-109",
          start: "2026-10-03T18:00:00-03:00",
          end: "2026-10-03T19:00:00-03:00",
          student_full_name: "Lucas Martin",
        },
      ],
      students,
      "2026-10-10",
    );
    const [completed] = extrasFromStudentAgenda(
      [
        {
          extra_lesson_id: "student-extra-778",
          is_extra: true,
          date: "2026-10-03",
          start_time: "18:00",
          lesson_completed: true,
          status: "Conducted",
        },
      ],
      students[0],
      "2026-10-10",
    );

    expect(mergeExtraLessons([scheduled], [completed])).toEqual([
      expect.objectContaining({
        id: "kodland-extra-calendar-event-109",
        lesson_date: "2026-10-03",
        start_time: "18:00",
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
