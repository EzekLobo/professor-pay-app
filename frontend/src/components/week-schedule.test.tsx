import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDemoSnapshot } from "@/lib/demo-snapshot";
import { occurrenceKey } from "@/lib/sync-policy";
import { WeekSchedule } from "./dashboard-page";

afterEach(() => vi.useRealTimers());

function markup(patch = {}) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-29T20:50:00Z"));
  const seed = createDemoSnapshot();
  const lesson = { ...seed.lessons[0], id: "fixture-lesson", external_class_name: "Turma de teste", lesson_date: "2026-10-29", start_time: "18:00", end_time: "19:00", call_url: "https://learn.kodland.org/pt/class-room?sessionId=fixture-session", call_occurrence_key: occurrenceKey({ id: "fixture-lesson", date: "2026-10-29", startTime: "18:00", endTime: "19:00" }), ...patch };
  return renderToStaticMarkup(<WeekSchedule groups={[seed.groups[0]]} lessons={[lesson]} students={[]} extraLessons={[]} availability={[]} onRefresh={() => undefined} refreshing={false} refreshNotice="" scheduleLastUpdatedAt={null} onUpdateExtraStatus={async () => seed.extras[0]} onMaterialsLoaded={() => undefined} customHolidays={[]} demoMode />);
}

describe("WeekSchedule call integration", () => {
  it("renders a separate accessible call link beside the details button", () => {
    const result = markup();
    expect(result).toContain("Chamada disponível para Abrir detalhes de Turma de teste. Abrir chamada");
    expect(result).toContain("sessionId=fixture-session");
    expect(result).toContain("min-width:44px");
    expect(result).toContain("schedule-entry-action");
  });
  it("does not expose a call saved for the prior scheduled time", () => {
    expect(markup({ start_time: "18:05" })).not.toContain("sessionId=fixture-session");
  });
  it("does not expose a call for canceled lessons or without an actual end time", () => {
    expect(markup({ status: "CANCELED" })).not.toContain("sessionId=fixture-session");
    expect(markup({ end_time: "" })).not.toContain("sessionId=fixture-session");
  });
});
