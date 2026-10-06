import type { KodlandAvailability } from "@/lib/api";

type TimeWindow = {
  day: number;
  start: number;
  end: number;
};

export type OccupiedWindow = {
  day: number;
  start: string;
  end: string;
};

export type FreeAvailabilityWindow = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
};

const minutesOfDay = (value: string) => {
  const match = value.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return -1;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60
    ? hours * 60 + minutes
    : -1;
};

const clock = (minutes: number) =>
  String(Math.floor(minutes / 60)).padStart(2, "0") + ":" +
  String(minutes % 60).padStart(2, "0");

function unionWindows(windows: TimeWindow[], mergeAdjacent: boolean) {
  const sorted = [...windows].sort((a, b) => a.start - b.start || a.end - b.end);
  const result: TimeWindow[] = [];
  for (const window of sorted) {
    const previous = result.at(-1);
    if (
      previous &&
      (window.start < previous.end || (mergeAdjacent && window.start === previous.end))
    ) {
      previous.end = Math.max(previous.end, window.end);
    } else {
      result.push({ ...window });
    }
  }
  return result;
}

/** Removes booked lessons from registered availability and collapses duplicate records. */
export function freeAvailabilityWindows(
  availability: KodlandAvailability[],
  occupied: OccupiedWindow[],
): FreeAvailabilityWindow[] {
  const free: FreeAvailabilityWindow[] = [];

  for (let weekday = 0; weekday < 7; weekday += 1) {
    const registered = availability.flatMap((slot) => {
      const start = minutesOfDay(slot.start_time);
      const end = minutesOfDay(slot.end_time);
      return slot.weekday === weekday && start >= 0 && end > start
        ? [{ day: weekday, start, end }]
        : [];
    });
    const busy = occupied.flatMap((slot) => {
      const start = minutesOfDay(slot.start);
      const end = minutesOfDay(slot.end);
      return slot.day === weekday && start >= 0 && end > start
        ? [{ day: weekday, start, end }]
        : [];
    });

    const uniqueAvailability = unionWindows(registered, false);
    const bookedWindows = unionWindows(busy, true);
    for (const slot of uniqueAvailability) {
      let segments: TimeWindow[] = [{ ...slot }];
      for (const booked of bookedWindows) {
        segments = segments.flatMap((segment) => {
          if (booked.end <= segment.start || booked.start >= segment.end)
            return [segment];
          const remaining: TimeWindow[] = [];
          if (booked.start > segment.start)
            remaining.push({ ...segment, end: booked.start });
          if (booked.end < segment.end)
            remaining.push({ ...segment, start: booked.end });
          return remaining;
        });
      }
      segments.forEach((segment) => {
        const start_time = clock(segment.start);
        const end_time = clock(segment.end);
        free.push({
          id: "availability-" + weekday + "-" + start_time + "-" + end_time,
          weekday,
          start_time,
          end_time,
        });
      });
    }
  }

  return free.sort((a, b) => a.weekday - b.weekday || a.start_time.localeCompare(b.start_time));
}
