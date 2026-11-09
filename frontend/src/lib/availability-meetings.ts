import type { ManualClass } from "./manual-teaching";
import type { ManualOccurrence } from "./manual-operations";
import { generateRecurringOccurrences } from "./teaching-finance";
type Meeting = Pick<ManualOccurrence, "class_id" | "lesson_date" | "start_time" | "duration_minutes" | "status">;
/** Project weekly occupancy without creating database records just to read availability. */
export function availabilityMeetings(classes: readonly ManualClass[], saved: readonly ManualOccurrence[], today: string): Meeting[] {
  const end = new Date(`${today}T12:00:00Z`); end.setUTCFullYear(end.getUTCFullYear() + 1);
  return classes.filter(item => item.active).flatMap(classroom => {
    const existing = saved.filter(item => item.class_id === classroom.id);
    const to = classroom.end_date && classroom.end_date < end.toISOString().slice(0, 10) ? classroom.end_date : end.toISOString().slice(0, 10);
    if (to < today) return existing;
    return [...existing, ...generateRecurringOccurrences(classroom, today, to, existing).map(item => ({ ...item, status: "planned" as const }))];
  });
}
