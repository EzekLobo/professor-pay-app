import { describe, expect, it } from "vitest";
import { mergeSyncedKodlandExtraLesson, mergeSyncedKodlandLesson, type KodlandExtraLesson } from "./api";
import type { KodlandLesson } from "./kodland-lessons";
import { occurrenceKey } from "./sync-policy";
const call = { call_url: "https://learn.kodland.org/pt/class-room?sessionId=synthetic", call_occurrence_key: occurrenceKey({ id: "one", date: "2026-10-29", startTime: "18:00", endTime: "19:00" }), call_checked_at: "2026-10-29T20:50:00Z", call_expires_at: "2026-10-29T22:00:00Z" };
const lesson = { id: "one", source_lesson_id: "one", external_class_id: "g", lesson_date: "2026-10-29", start_time: "18:00", end_time: "19:00", recording_url: "", status: "planned" } as Omit<KodlandLesson, "created_at">;
const previous = { ...lesson, ...call, recording_url: "https://example.test/recording", created_at: "2026-10-01" };
const extra = { id: "kodland-extra-1", external_class_id: "g", external_student_id: "s", recording_booking_id: "booking", lesson_date: "2026-10-29", start_time: "18:00", end_time: "19:00", status: "planned", completed: false, student_name: "Synthetic", external_class_name: "Group" } as Omit<KodlandExtraLesson, "created_at">;
const oldExtra = { ...extra, ...call, recording_url: "https://example.test/extra", final_checked_at: "2026-10-30T03:00:00Z", created_at: "2026-10-01" };

describe("occurrence-bound imported links", () => {
  it("preserves the call and recording when the same scheduled lesson has an empty upstream result", () => {
    expect(mergeSyncedKodlandLesson(lesson, previous, "2026-10-30")).toMatchObject({ ...call, recording_url: previous.recording_url });
  });
  it("accepts a new available recording for the same lesson", () => {
    expect(mergeSyncedKodlandLesson({ ...lesson, recording_url: "https://example.test/new" }, previous, "2026-10-30").recording_url).toBe("https://example.test/new");
  });
  for (const change of [{ lesson_date: "2026-10-30" }, { start_time: "18:30" }, { end_time: "19:30" }, { source_lesson_id: "different" }, { external_class_id: "other" }]) it(`does not transfer a session or recording after changing ${Object.keys(change)[0]}`, () => {
    expect(mergeSyncedKodlandLesson({ ...lesson, ...change }, previous, "2026-10-30")).toMatchObject({ call_url: "", call_occurrence_key: "", call_expires_at: "", recording_url: "" });
  });
  it("preserves automatic final confirmation and recording of the same extra", () => {
    expect(mergeSyncedKodlandExtraLesson(extra, oldExtra, "2026-10-31", true)).toMatchObject({ ...call, final_checked_at: oldExtra.final_checked_at, recording_url: oldExtra.recording_url });
  });
  for (const change of [{ lesson_date: "2026-10-30" }, { start_time: "18:30" }, { recording_booking_id: "another-booking" }, { external_student_id: "another-student" }]) it(`invalidates final check and links when an extra changes ${Object.keys(change)[0]}`, () => {
    expect(mergeSyncedKodlandExtraLesson({ ...extra, ...change }, oldExtra, "2026-10-31", true)).toMatchObject({ call_url: "", call_occurrence_key: "", recording_url: "", final_checked_at: "" });
  });
  it("does not undo an explicit human financial completion while preserving the current occurrence", () => {
    expect(mergeSyncedKodlandExtraLesson(extra, { ...oldExtra, manual_status: "DONE", completed: true }, "2026-10-31", true)).toMatchObject({ completed: true, manual_status: "DONE", final_checked_at: oldExtra.final_checked_at });
  });
});
