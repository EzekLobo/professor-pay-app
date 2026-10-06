import { describe, expect, it } from "vitest";
import type { KodlandAvailability } from "@/lib/api";
import { freeAvailabilityWindows } from "@/lib/availability-windows";

const availability = (
  id: string,
  start_time: string,
  end_time: string,
  weekday = 0,
): KodlandAvailability => ({
  id,
  weekday,
  start_time,
  end_time,
  created_at: "",
});

describe("freeAvailabilityWindows", () => {
  it("hides a slot occupied by an extra lesson and collapses duplicate records", () => {
    expect(
      freeAvailabilityWindows(
        [
          availability("old-id", "19:00", "20:00"),
          availability("new-id", "19:00", "20:00"),
        ],
        [{ day: 0, start: "19:00", end: "20:00" }],
      ),
    ).toEqual([]);
  });

  it("keeps the unoccupied parts of a registered window", () => {
    expect(
      freeAvailabilityWindows(
        [availability("monday", "19:00", "22:00")],
        [
          { day: 0, start: "19:00", end: "20:00" },
          { day: 0, start: "21:00", end: "22:00" },
        ],
      ),
    ).toEqual([
      {
        id: "availability-0-20:00-21:00",
        weekday: 0,
        start_time: "20:00",
        end_time: "21:00",
      },
    ]);
  });

  it("does not subtract lessons on a different day or merge adjacent free slots", () => {
    expect(
      freeAvailabilityWindows(
        [
          availability("first", "19:00", "20:00"),
          availability("second", "20:00", "21:00"),
        ],
        [{ day: 1, start: "19:00", end: "21:00" }],
      ),
    ).toHaveLength(2);
  });
});
