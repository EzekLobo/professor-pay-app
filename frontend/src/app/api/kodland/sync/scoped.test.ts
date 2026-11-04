import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import { callFromNearest, classroomUrl, extraReportOutcome, scopedOccurrenceKey, type KodlandScopedOccurrence, type KodlandScopedRequest } from "@/lib/kodland-scoped-sync";

const now = Date.parse("2026-10-29T20:50:00Z");
const token = `header.${Buffer.from(JSON.stringify({ user_id: 22 })).toString("base64url")}.signature`;
const occurrence: KodlandScopedOccurrence = { kind: "lesson", id: "group-g1-lesson-l1", group_id: "g1", source_lesson_id: "l1", lesson_date: "2026-10-29", start_time: "18:00", end_time: "19:00" };
const student = { main_info: { student_id: 7, full_name: "Aluno", status: "active" }, progress_info: [{ module_current_grade: 15, module_max_grade: 20, lessons_data: [{ lesson_id: "l1", attendance_status: 9 }] }] };
const fields = (item = occurrence) => Object.fromEntries(Object.entries({ external_class_id: item.group_id, source_lesson_id: item.source_lesson_id, lesson_date: item.lesson_date, start_time: item.start_time, end_time: item.end_time }).map(([key, value]) => [key, { stringValue: value }]));
const request = (input: KodlandScopedRequest, browser = false) => new NextRequest("https://example.test/api/kodland/sync", { method: "POST", headers: { authorization: "Bearer firebase-token", "content-type": "application/json" }, body: JSON.stringify({ username: "tutor", password: "secret", mode: "scoped", scoped_request: input, browser_occurrence: browser }) });
function mockSource(overrides: Record<string, unknown> = {}) {
  const fetch = vi.fn(async (url: string | URL | Request) => {
    const path = String(url);
    if (path.includes("accounts:lookup")) return Response.json({ users: [{ localId: "owner" }] });
    if (path.endsWith("/login")) return Response.json({ access_token: token });
    if (path.includes("get_teachers_groups")) return Response.json({ results: [{ id: "g1", title: "Turma", students_count: 1 }] });
    if (path.includes("firestore.googleapis.com")) return Response.json(overrides.firestore ?? { fields: fields() });
    for (const [key, value] of Object.entries(overrides)) if (path.includes(key)) return Response.json(value);
    if (path.includes("/lessons/")) return Response.json([]);
    if (path.includes("get_students_main_data")) return Response.json([student]);
    throw new Error("Unexpected source: " + path);
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
beforeEach(() => { vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test"); vi.stubEnv("NEXT_PUBLIC_FIREBASE_PROJECT_ID", "test-project"); vi.spyOn(Date, "now").mockReturnValue(now); vi.spyOn(console, "info").mockImplementation(() => undefined); vi.spyOn(console, "error").mockImplementation(() => undefined); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("operational synchronization scopes", () => {
  it("updates activities and points without presence, schedule, profiles, materials or availability", async () => {
    const fetch = mockSource(); const response = await POST(request({ scope: "activities", group_ids: ["g1"] }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scoped: { complete: true, ranking_complete: true }, ranking: [{ id: "kodland-student-7", progress_summary: "15/20" }] });
    const calls = fetch.mock.calls.map(call => String(call[0]));
    expect(calls).toHaveLength(6); // Includes the bounded second timeline page to confirm completeness.
    expect(calls.some(url => /attendance|schedule_view|teacher_timetables|student_profiles|course_lessons|zoom_recording/.test(url))).toBe(false);
  });
  it("preserves ranking when the provider has no grade data", async () => {
    mockSource({ get_students_main_data: [{ ...student, progress_info: [] }] });
    const response = await POST(request({ scope: "activities", group_ids: ["g1"] }));
    expect(await response.json()).toMatchObject({ scoped: { complete: true, ranking_complete: false }, ranking: [] });
  });
  it("rejects a group outside the authenticated teacher roster", async () => {
    const fetch = mockSource(); const response = await POST(request({ scope: "activities", group_ids: ["someone-else"] }));
    expect(response.status).toBe(403); expect(fetch).toHaveBeenCalledTimes(3);
  });
  it("uses the saved occurrence rather than supplied dates and preserves unknown attendance", async () => {
    const fetch = mockSource(); const response = await POST(request({ scope: "attendance", occurrence: { ...occurrence, lesson_date: "2030-01-01", start_time: "02:00" } }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scoped: { complete: true, occurrence_key: scopedOccurrenceKey(occurrence) }, attendance: [{ status: "UNKNOWN", lesson_date: "2026-10-29", start_time: "18:00" }] });
    expect(fetch.mock.calls.some(call => /attendance\/|schedule_view|zoom_recording/.test(String(call[0])))).toBe(false);
    const docRead = fetch.mock.calls.find(call => String(call[0]).includes("firestore.googleapis.com")); expect(String(docRead?.[0])).toContain("/users/owner/kodland_lessons/");
  });
  it("does not finish a presence check when the requested lesson is absent", async () => {
    mockSource({ get_students_main_data: [{ ...student, progress_info: [] }] });
    const response = await POST(request({ scope: "attendance", occurrence }));
    expect(await response.json()).toMatchObject({ scoped: { complete: false }, attendance: [] });
  });
  it("opens only the matching session in the pre-class window", async () => {
    mockSource({ get_nearest_by_group_id: { lesson_id: "l1", session_id: "session-1", session_start_time: "2026-10-29T21:00:00Z", session_end_time: "2026-10-29T22:30:00Z" } });
    const response = await POST(request({ scope: "call_link", occurrence }));
    expect(await response.json()).toMatchObject({ scoped: { complete: true, call_url: "https://learn.kodland.org/pt/class-room?sessionId=session-1" } });
  });
  it("does not borrow the next lesson session", async () => {
    mockSource({ get_nearest_by_group_id: { lesson_id: "other", session_id: "session-2", session_start_time: "2026-10-29T21:00:00Z", session_end_time: "2026-10-29T22:30:00Z" } });
    const response = await POST(request({ scope: "call_link", occurrence }));
    expect(await response.json()).toMatchObject({ scoped: { complete: false, call_url: "" } });
  });
  it("keeps a missing recording pending and does not refresh other lesson fields", async () => {
    mockSource({ get_videos_by_student_group_id: [] });
    const response = await POST(request({ scope: "recordings", occurrence }));
    expect(await response.json()).toMatchObject({ scoped: { complete: false, recording_url: "" }, lessons: [], students: [], availability: [] });
  });
});

describe("strict scoped parsers", () => {
  it("distinguishes a final negative outcome from an incomplete response", () => {
    expect(extraReportOutcome({ outcome: "completed" })).toBe(true); expect(extraReportOutcome({ outcome: "cancelled" })).toBe(false); expect(extraReportOutcome({})).toBeNull(); expect(extraReportOutcome({ outcome: "unknown" })).toBeNull();
  });
  it("rejects URL payloads and checks both lesson and occurrence", () => {
    expect(classroomUrl("javascript:alert(1)")).toBe("");
    const payload = { lesson_id: "l1", session_id: "session-1", session_start_time: "2026-10-29T21:00:00Z", session_end_time: "2026-10-29T22:30:00Z" };
    expect(callFromNearest(payload, occurrence, now)).toContain("session-1");
    expect(callFromNearest(payload, { ...occurrence, lesson_date: "2026-10-30" }, now)).toBe("");
  });
});
describe("minimal extra scopes", () => {
  const extra: KodlandScopedOccurrence = { kind: "extra", id: "kodland-extra-55", group_id: "g1", source_lesson_id: "55", lesson_date: "2026-10-28", start_time: "18:00", end_time: "19:00" };
  const calendar = [{ id: 55, group_id: "g1", student_id: 7, start_time: "2026-10-28T21:00:00Z", end_time: "2026-10-28T22:00:00Z" }];
  it("does not close an extra on an empty report", async () => {
    mockSource({ firestore: { fields: fields(extra) }, get_teacher_extra_lessons_timetable: calendar, extra_lesson_reports: {} });
    const response = await POST(request({ scope: "extra_final_check", occurrence: extra }));
    expect(response.status).toBe(502);
  });
  it("closes a documented cancelled report as a valid negative", async () => {
    mockSource({ firestore: { fields: fields(extra) }, get_teacher_extra_lessons_timetable: calendar, extra_lesson_reports: { outcome: "cancelled" } });
    const response = await POST(request({ scope: "extra_final_check", occurrence: extra }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ scoped: { complete: true, final_completed: false } });
  });
  it("imports only new IDs from this week without student or availability requests", async () => {
    const fetch = mockSource({ get_teacher_extra_lessons_timetable: [...calendar, { ...calendar[0], id: 56 }, { ...calendar[0], id: 57, start_time: "2026-11-05T21:00:00Z", end_time: "2026-11-05T22:00:00Z" }] });
    const response = await POST(request({ scope: "extras_discovery", week_date: "2026-10-29", known_extra_ids: ["kodland-extra-55"] }));
    expect(response.status).toBe(200); const payload = await response.json(); expect(payload.extra_lessons.map((row: { id: string }) => row.id)).toEqual(["kodland-extra-56"]);
    expect(fetch.mock.calls).toHaveLength(4); expect(fetch.mock.calls.some(call => /get_students_main_data|teacher_timetables|extra_lesson_reports/.test(String(call[0])))).toBe(false);
  });
});
describe("ranking retry scope", () => {
  it("refreshes points without reimporting corrections", async () => {
    const fetch = mockSource(); const response = await POST(request({ scope: "ranking", group_ids: ["g1"] }));
    expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ ranking: [{ progress_summary: "15/20" }], reviews: [], task_progress: [], scoped: { ranking_complete: true } });
    expect(fetch.mock.calls).toHaveLength(4); expect(fetch.mock.calls.some(call => String(call[0]).includes("/lessons/"))).toBe(false);
  });
});

describe("browser classroom links", () => {
  it("authorizes the teacher roster and exact provider session without a Firestore occurrence", async () => {
    const fetch = mockSource({ get_nearest_by_group_id: { lesson_id: "l1", session_id: "session-browser", session_start_time: "2026-10-29T21:00:00Z", session_end_time: "2026-10-29T22:00:00Z" } });
    const response = await POST(request({ scope: "call_link", occurrence }, true));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scoped: { complete: true, call_url: classroomUrl("session-browser"), occurrence_key: scopedOccurrenceKey(occurrence) } });
    expect(fetch.mock.calls.some(call => String(call[0]).includes("firestore.googleapis.com"))).toBe(false);
  });
  it("limits browser occurrence hints to the teacher's roster while allowing scoped attendance", async () => {
    mockSource({ get_students_main_data: [{ ...student, progress_info: [{ module_current_grade: 15, module_max_grade: 20, lessons_data: [{ lesson_id: "l1", attendance_status: 2 }] }] }] });
    const attendance = await POST(request({ scope: "attendance", occurrence }, true));
    expect(attendance.status).toBe(200);
    expect(await attendance.json()).toMatchObject({ scoped: { complete: true }, attendance: [{ lesson_id: "l1", status: "PRESENT" }] });
    expect((await POST(request({ scope: "call_link", occurrence: { ...occurrence, group_id: "someone-else" } }, true))).status).toBe(403);
  });
  it("validates browser extras against the live teacher calendar without Firestore", async () => {
    const extraOccurrence: KodlandScopedOccurrence = { kind: "extra", id: "kodland-extra-55", group_id: "g1", source_lesson_id: "55", lesson_date: "2026-10-28", start_time: "18:00", end_time: "19:00" };
    const fetch = mockSource({ get_teacher_extra_lessons_timetable: [{ id: 55, group_id: "g1", student_id: 7, start_time: "2026-10-28T21:00:00Z", end_time: "2026-10-28T22:00:00Z" }], extra_lesson_reports: { outcome: "cancelled" } });
    const response = await POST(request({ scope: "extra_final_check", occurrence: extraOccurrence }, true));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scoped: { complete: true, final_completed: false } });
    expect(fetch.mock.calls.some(call => String(call[0]).includes("firestore.googleapis.com"))).toBe(false);
  });
  it("ignores a supplied schedule that disagrees with the actual provider session", async () => {
    mockSource({ get_nearest_by_group_id: { lesson_id: "l1", session_id: "session-other", session_start_time: "2026-10-30T21:00:00Z", session_end_time: "2026-10-30T22:00:00Z" } });
    const response = await POST(request({ scope: "call_link", occurrence }, true));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ scoped: { complete: false, call_url: "" } });
  });
});
