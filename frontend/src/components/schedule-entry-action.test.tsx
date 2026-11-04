import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScheduleEntryAction } from "./schedule-entry-action";
import type { ScheduleCallLink } from "@/lib/schedule-call";

const start = Date.parse("2026-10-29T21:00:00Z");
const call: ScheduleCallLink = { url: "https://learn.kodland.org/pt/class-room?sessionId=session-123", occurrenceKey: "lesson-key", expectedOccurrenceKey: "lesson-key", startAt: start, endAt: start + 3_600_000 };

describe("ScheduleEntryAction", () => {
  it("renders separate accessible details and 44px classroom controls", () => {
    const html = renderToStaticMarkup(<ScheduleEntryAction label="Aula M1L1" onDetails={vi.fn()} call={call} clock={() => start} className="week-slot"><strong>M1L1</strong></ScheduleEntryAction>);
    expect(html).toContain('aria-label="Aula M1L1"');
    expect(html).toContain('aria-label="Chamada disponível para Aula M1L1. Abrir chamada"');
    expect(html).toContain('href="https://learn.kodland.org/pt/class-room?sessionId=session-123"');
    expect(html).toContain('min-width:44px;min-height:44px');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.indexOf("</button>")).toBeLessThan(html.indexOf("<a "));
  });
  it("keeps the details action and hides the call icon for invalid or expired links", () => {
    const html = renderToStaticMarkup(<ScheduleEntryAction label="Aula" onDetails={vi.fn()} call={call} clock={() => call.endAt}>Detalhes</ScheduleEntryAction>);
    expect(html).toContain("Detalhes"); expect(html).not.toContain("schedule-call-link");
    expect(html).not.toContain("sessionId");
  });
});
