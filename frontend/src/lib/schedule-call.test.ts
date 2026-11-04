import { afterEach, describe, expect, it, vi } from "vitest";
import { createScheduleEntryGesture, nextScheduleCallBoundary, safeScheduleCallUrl, type ScheduleCallLink } from "./schedule-call";

const start = Date.parse("2026-10-29T21:00:00Z");
const call: ScheduleCallLink = { url: "https://learn.kodland.org/pt/class-room?sessionId=session-123", occurrenceKey: "lesson:2026-10-29:18", expectedOccurrenceKey: "lesson:2026-10-29:18", startAt: start, endAt: start + 3_600_000 };

afterEach(() => vi.useRealTimers());

describe("schedule call identity and URL", () => {
  it("accepts the official classroom URL without rewriting it", () => {
    expect(safeScheduleCallUrl(call, start - 900_000)).toBe(call.url);
    expect(safeScheduleCallUrl({ ...call, url: "https://learn.kodland.org/class-room?sessionId=123" }, start)).toBe("https://learn.kodland.org/class-room?sessionId=123");
  });
  it("limits availability to 15 minutes before this occurrence until its end", () => {
    expect(safeScheduleCallUrl(call, start - 900_001)).toBeNull();
    expect(safeScheduleCallUrl(call, start + 3_599_999)).toBe(call.url);
    expect(safeScheduleCallUrl(call, start + 3_600_000)).toBeNull();
  });
  it("schedules availability and expiry as individual boundaries without polling", () => {
    expect(nextScheduleCallBoundary(call, start - 1_000_000)).toBe(start - 900_000);
    expect(nextScheduleCallBoundary(call, start - 900_000)).toBe(call.endAt);
    expect(nextScheduleCallBoundary(call, call.endAt)).toBeNull();
    expect(nextScheduleCallBoundary({ ...call, expectedOccurrenceKey: "other" }, start)).toBeNull();
  });
  it("rejects links belonging to a rescheduled occurrence", () => {
    expect(safeScheduleCallUrl({ ...call, expectedOccurrenceKey: "lesson:tomorrow" }, start)).toBeNull();
    expect(safeScheduleCallUrl({ ...call, occurrenceKey: undefined }, start)).toBeNull();
    expect(safeScheduleCallUrl({ ...call, endAt: start }, start)).toBeNull();
    expect(safeScheduleCallUrl({ ...call, startAt: NaN }, start)).toBeNull();
  });
  it.each([
    "javascript:alert(1)",
    "http://learn.kodland.org/class-room?sessionId=1",
    "https://learn.kodland.org.attacker.test/class-room?sessionId=1",
    "https://attacker.test/class-room?sessionId=1",
    "https://user:password@learn.kodland.org/class-room?sessionId=1",
    "https://learn.kodland.org/class-room?sessionId=1&redirect=https://attacker.test",
    "https://learn.kodland.org/class-room?sessionId=1&sessionId=2",
    "https://learn.kodland.org/class-room?sessionId=%2Fetc",
    "https://learn.kodland.org/class-room?sessionId=",
    "https://learn.kodland.org/course?sessionId=1",
    "https://learn.kodland.org/class-room?sessionId=1#untrusted",
  ])("rejects invalid classroom input %s", url => {
    expect(safeScheduleCallUrl({ ...call, url }, start)).toBeNull();
  });
});

describe("schedule card gestures", () => {
  function setup() {
    vi.useFakeTimers(); vi.setSystemTime(start);
    let current: string | null = call.url!;
    const onDetails = vi.fn(), onOpenCall = vi.fn();
    const gesture = createScheduleEntryGesture({ onDetails, onOpenCall, getCallUrl: () => current });
    return { gesture, onDetails, onOpenCall, setUrl: (value: string | null) => { current = value; } };
  }
  it("opens details only after a single click's double-tap window", async () => {
    const test = setup(); test.gesture.activate();
    expect(test.onDetails).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(299); expect(test.onDetails).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1); expect(test.onDetails).toHaveBeenCalledTimes(1);
    expect(test.onOpenCall).not.toHaveBeenCalled();
  });
  it("opens one call synchronously on the second click and cancels details", async () => {
    const test = setup(); test.gesture.activate();
    await vi.advanceTimersByTimeAsync(150); test.gesture.activate();
    expect(test.onOpenCall).toHaveBeenCalledExactlyOnceWith(call.url);
    await vi.advanceTimersByTimeAsync(500); expect(test.onDetails).not.toHaveBeenCalled();
  });
  it("handles touch-generated click pairs without repeated navigation", async () => {
    const test = setup(); test.gesture.activate();
    await vi.advanceTimersByTimeAsync(100); test.gesture.activate();
    test.gesture.activate(); // Ignore a synthetic duplicate immediately after the pair.
    await vi.advanceTimersByTimeAsync(500);
    expect(test.onOpenCall).toHaveBeenCalledTimes(1); expect(test.onDetails).not.toHaveBeenCalled();
  });
  it("revalidates an expired or rescheduled call on the second click", async () => {
    const test = setup(); test.gesture.activate();
    await vi.advanceTimersByTimeAsync(100); test.setUrl(null); test.gesture.activate();
    await vi.advanceTimersByTimeAsync(500);
    expect(test.onOpenCall).not.toHaveBeenCalled(); expect(test.onDetails).toHaveBeenCalledTimes(1);
  });
  it("opens details immediately for keyboard activation or absent call", () => {
    const test = setup(); test.gesture.activate("keyboard");
    expect(test.onDetails).toHaveBeenCalledTimes(1);
    test.setUrl(null); test.gesture.activate(); expect(test.onDetails).toHaveBeenCalledTimes(2);
    expect(test.onOpenCall).not.toHaveBeenCalled();
  });
  it("cancels delayed details when the direct link is used or card unmounts", async () => {
    const test = setup(); test.gesture.activate(); test.gesture.cancel();
    await vi.advanceTimersByTimeAsync(500); expect(test.onDetails).not.toHaveBeenCalled();
    test.gesture.activate(); test.gesture.dispose();
    await vi.advanceTimersByTimeAsync(500); expect(test.onDetails).not.toHaveBeenCalled();
  });
});

