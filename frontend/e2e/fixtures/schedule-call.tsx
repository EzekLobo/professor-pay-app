import { createRoot } from "react-dom/client";
import { useEffect, useState } from "react";
import { WeekSchedule } from "../../src/components/dashboard-page";
import { createDemoSnapshot } from "../../src/lib/demo-snapshot";
import { occurrenceKey } from "../../src/lib/sync-policy";

declare global {
  interface Window {
    __scheduleFixturePatch: (target: "lesson" | "extra", patch: Record<string, string>) => void;
    __scheduleOpenedCalls: string[];
  }
}

// Test-only entry bundled into page.setContent; no application route exposes this fixture.
function Fixture() {
  const seed = createDemoSnapshot();
  const identity = { date: "2026-10-29", startTime: "18:00", endTime: "19:00" };
  const [lesson, setLesson] = useState({ ...seed.lessons[0], id: "fixture-lesson", external_class_name: "Turma de teste", lesson_date: identity.date, start_time: identity.startTime, end_time: identity.endTime, call_url: "https://learn.kodland.org/pt/class-room?sessionId=fixture-session", call_occurrence_key: occurrenceKey({ id: "fixture-lesson", ...identity }) });
  const [extra, setExtra] = useState({ ...seed.extras[0], id: "fixture-extra", student_name: "Aluna extra de teste", lesson_date: identity.date, start_time: identity.startTime, end_time: identity.endTime, call_url: "https://learn.kodland.org/pt/class-room?sessionId=fixture-extra-session", call_occurrence_key: occurrenceKey({ id: "fixture-extra", ...identity }) });
  useEffect(() => {
    window.__scheduleFixturePatch = (target, patch) => {
      if (target === "lesson") setLesson(value => ({ ...value, ...patch }));
      else setExtra(value => ({ ...value, ...patch }));
    };
  }, []);
  return <main style={{ padding: 12 }}><WeekSchedule groups={[{ ...seed.groups[0], title: "Turma de teste" }]} students={seed.students} lessons={[lesson]} extraLessons={[extra]} availability={[]} onRefresh={() => undefined} refreshing={false} refreshNotice="" scheduleLastUpdatedAt={null} onUpdateExtraStatus={async () => extra} onMaterialsLoaded={() => undefined} customHolidays={[]} demoMode /></main>;
}

createRoot(document.getElementById("fixture-root")!).render(<Fixture />);
