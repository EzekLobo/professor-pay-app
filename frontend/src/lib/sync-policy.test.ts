import { describe, expect, it } from "vitest";
import { attendanceDecision, calendarDay, callLinkDecision, extraFinalCheckDecision, isNewExtraThisWeek, occurrenceKey, occurrenceTimes, payrollDecision, recordingDecision, syncTimeZone, weekBounds, withinInitialWindow, zonedInstant, type SyncOccurrence } from "./sync-policy";

const time = (value: string) => Date.parse(value);
const lesson: SyncOccurrence = { id: "lesson-1", date: "2026-10-29", startTime: "18:00", endTime: "19:00" };

describe("sync calendar policies", () => {
  it("uses the configured business timezone at midnight and Monday boundaries", () => {
    const sunday = time("2026-11-02T01:00:00Z");
    expect(calendarDay(sunday)).toBe("2026-11-01");
    expect(weekBounds(sunday)).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(weekBounds(time("2026-11-02T03:00:00Z"))).toEqual({ start: "2026-11-02", end: "2026-11-08" });
    expect(syncTimeZone("Invalid/TimeZone")).toBe("America/Sao_Paulo");
    expect(calendarDay(sunday, "Asia/Tokyo")).toBe("2026-11-02");
  });
  it("converts wall times without the machine timezone and rejects nonexistent times", () => {
    expect(zonedInstant("2026-10-29", "18:00")).toBe(time("2026-10-29T21:00:00Z"));
    expect(zonedInstant("2026-03-08", "02:30", "America/New_York")).toBeNull();
    expect(zonedInstant("2026-02-30", "10:00")).toBeNull();
    expect(zonedInstant("2026-10-29", "25:00")).toBeNull();
  });
  it("uses authoritative instants and invalidates occurrence keys when rescheduled", () => {
    expect(occurrenceTimes({ ...lesson, startAt: "2026-10-29T20:00:00Z", endAt: "2026-10-29T21:00:00Z" })).toEqual({ start: time("2026-10-29T20:00:00Z"), end: time("2026-10-29T21:00:00Z") });
    expect(occurrenceKey(lesson)).not.toBe(occurrenceKey({ ...lesson, date: "2026-10-30" }));
    expect(occurrenceTimes({ ...lesson, startTime: "23:00", endTime: "00:30" })?.end).toBe(time("2026-10-30T03:30:00Z"));
    expect(occurrenceTimes({ ...lesson, endTime: "" })).toBeNull();
  });
  it("limits initial historical discovery to the last seven calendar days", () => {
    const initialised = time("2026-10-29T12:00:00Z");
    expect(withinInitialWindow({ ...lesson, date: "2026-10-22" }, initialised)).toBe(true);
    expect(withinInitialWindow({ ...lesson, date: "2026-10-21" }, initialised)).toBe(false);
  });
});

describe("extra lesson decisions", () => {
  it("discovers only unknown IDs in the current Monday–Sunday week", () => {
    const now = time("2026-10-29T12:00:00Z"), known = new Set(["old"]);
    expect(isNewExtraThisWeek("new", "2026-11-01", known, now)).toBe(true);
    expect(isNewExtraThisWeek("old", "2026-10-29", known, now)).toBe(false);
    expect(isNewExtraThisWeek("future", "2026-11-02", known, now)).toBe(false);
  });
  it("checks once after the calendar day even after the week has changed", () => {
    const sunday = { ...lesson, date: "2026-11-01" };
    expect(extraFinalCheckDecision(sunday, time("2026-11-02T02:59:59Z")).due).toBe(false);
    expect(extraFinalCheckDecision(sunday, time("2026-11-02T03:00:00Z")).due).toBe(true);
    expect(extraFinalCheckDecision(sunday, time("2026-11-03T03:00:00Z"), { completed: true }).due).toBe(false);
    expect(extraFinalCheckDecision({ ...sunday, taught: true }, time("2026-11-03T03:00:00Z")).due).toBe(false);
  });
  it("never interprets an invalid date as a negative final check", () => {
    expect(extraFinalCheckDecision({ ...lesson, date: "unknown" }, Date.now())).toMatchObject({ due: false, reason: "missing_time" });
  });
});

describe("attendance and recording decisions", () => {
  it("checks attendance at exactly end + one hour and respects persisted success/retry", () => {
    expect(attendanceDecision(lesson, time("2026-10-29T22:59:59Z")).due).toBe(false);
    const now = time("2026-10-29T23:00:00Z");
    expect(attendanceDecision(lesson, now).due).toBe(true);
    expect(attendanceDecision(lesson, now, { completed: true }).due).toBe(false);
    expect(attendanceDecision(lesson, now, { next_due_at: now + 1000 }).due).toBe(false);
    expect(attendanceDecision({ ...lesson, cancelled: true }, now).due).toBe(false);
  });
  it("looks up a recording after end, waits 30min, and stops only when available", () => {
    const end = time("2026-10-29T22:00:00Z");
    expect(recordingDecision(lesson, end - 1).due).toBe(false);
    expect(recordingDecision(lesson, end).due).toBe(true);
    expect(recordingDecision(lesson, end + 29 * 60_000, { last_attempt_at: end }).due).toBe(false);
    expect(recordingDecision(lesson, end + 30 * 60_000, { last_attempt_at: end }).due).toBe(true);
    expect(recordingDecision({ ...lesson, recordingUrl: "https://example.test/video" }, end).due).toBe(false);
    expect(recordingDecision({ ...lesson, taught: true }, end).due).toBe(true);
  });
});

describe("call and payroll decisions", () => {
  it("requests call at start minus 15min, retries after 5min, and ends with the occurrence", () => {
    const due = time("2026-10-29T20:45:00Z");
    expect(callLinkDecision(lesson, due - 1).due).toBe(false);
    expect(callLinkDecision(lesson, due).due).toBe(true);
    expect(callLinkDecision(lesson, due + 4 * 60_000, { last_attempt_at: due }).due).toBe(false);
    expect(callLinkDecision(lesson, due + 5 * 60_000, { last_attempt_at: due }).due).toBe(true);
    expect(callLinkDecision(lesson, time("2026-10-29T22:00:00Z"))).toMatchObject({ due: false, nextDueAt: null });
    expect(callLinkDecision({ ...lesson, callUrl: "https://example.test/call" }, due).due).toBe(false);
  });
  it("checks payment daily in D−5 through D inclusive across a year boundary", () => {
    expect(payrollDecision("2027-01-03", time("2026-12-28T15:00:00Z")).due).toBe(false);
    const first = time("2026-12-29T15:00:00Z");
    expect(payrollDecision("2027-01-03", first).due).toBe(true);
    expect(payrollDecision("2027-01-03", first + 1000, { last_success_at: first }).due).toBe(false);
    expect(payrollDecision("2027-01-03", time("2026-12-30T15:00:00Z"), { last_success_at: first }).due).toBe(true);
    expect(payrollDecision("2027-01-03", time("2027-01-03T15:00:00Z")).due).toBe(true);
    expect(payrollDecision("2027-01-03", time("2027-01-04T15:00:00Z")).due).toBe(false);
    expect(payrollDecision("2027-02-30", first).due).toBe(false);
  });
});

it("recovers completed metadata when the corresponding persisted URL is absent", () => {
  const now = Date.parse("2026-10-29T23:00:00Z"), occurrence = { id: "one", date: "2026-10-29", startTime: "18:00", endTime: "19:00" };
  expect(recordingDecision(occurrence, now, { completed: true, last_attempt_at: now - 31 * 60000 }).due).toBe(true);
  expect(recordingDecision(occurrence, now, { completed: true, last_attempt_at: now - 10 * 60000 }).due).toBe(false);
  expect(recordingDecision({ ...occurrence, recordingUrl: "https://example.test/recording" }, now, { completed: true }).due).toBe(false);
  const preClass = Date.parse("2026-10-29T20:50:00Z");
  expect(callLinkDecision(occurrence, preClass, { completed: true, last_attempt_at: preClass - 6 * 60000 }).due).toBe(true);
  expect(callLinkDecision(occurrence, preClass, { completed: true, last_attempt_at: preClass - 4 * 60000 }).due).toBe(false);
  expect(callLinkDecision({ ...occurrence, callUrl: "https://learn.kodland.org/pt/class-room?sessionId=fixture" }, preClass, { completed: true }).due).toBe(false);
  expect(callLinkDecision(occurrence, now, { completed: true }).due).toBe(false);
});
