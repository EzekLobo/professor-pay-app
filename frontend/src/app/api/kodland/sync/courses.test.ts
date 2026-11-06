import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const ids = ["2198", "2197", "1721", "1192", "1184"];
function provider() {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "fixture");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request) => {
    const url = new URL(String(input)); calls.push(url.href);
    if (url.host.includes("identitytoolkit")) return Response.json({ users: [{ localId: "teacher" }] });
    if (url.pathname.endsWith("login")) return Response.json({ access_token: `header.${Buffer.from(JSON.stringify({ user_id: "22" })).toString("base64url")}.signature` });
    if (url.pathname.includes("get_teachers_courses")) return Response.json(ids.map(id => ({ id, title: `[${id}]Roblox Game Developer`, lesson_count: 40 })));
    if (url.pathname.includes("get_teachers_groups")) return Response.json({ results: [], next: null });
    if (url.pathname.includes("get_lessons_list")) {
      const course = url.searchParams.get("course"); const second = url.searchParams.get("page") === "2";
      if (second) expect(url.searchParams.get("page_size")).toBe("30");
      return Response.json({ results: Array.from({ length: second ? 10 : 30 }, (_, index) => ({ id: `${course}-${index + (second ? 31 : 1)}`, number: index + (second ? 31 : 1), title: `Aula ${index + (second ? 31 : 1)}` })), next: second ? null : `https://backoffice.kodland.org/api/v2/lessons/get_lessons_list?course=${course}&page=2&page_size=30` });
    }
    if (url.pathname.includes("materials")) return Response.json([]);
    if (url.pathname.includes("get_tasks_list")) return Response.json([]);
    throw new Error(`Unexpected request ${url.pathname}`);
  }));
  return calls;
}
const request = (body: object) => new NextRequest("https://example.test/api/kodland/sync", { method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify({ username: "fixture", password: "fixture", ...body }) });

it("returns all five assigned variants and all 40 lessons without requiring any active group", async () => {
  const calls = provider(); const response = await POST(request({ mode: "courses" }));
  expect(response.status).toBe(200);
  const result = await response.json();
  expect(result.courses.map((course: { id: string }) => course.id)).toEqual(ids);
  expect(result.courses.every((course: { lessons: unknown[] }) => course.lessons.length === 40)).toBe(true);
  expect(result.courses[2].lessons[0].external_class_id).toBe("course:1721");
  expect(result.courses[3].lessons[0].source_lesson_id).toBe("1192-1");
  expect(calls.some(url => url.includes("get_teachers_groups"))).toBe(false);
});
it("allows materials from an assigned course without a group and rejects another course", async () => {
  const calls = provider();
  expect((await POST(request({ mode: "materials", group_id: "course:1192", source_lesson_id: "1192-1" }))).status).toBe(200);
  const before = calls.length;
  expect((await POST(request({ mode: "materials", group_id: "course:999", source_lesson_id: "999-1" }))).status).toBe(403);
  expect(calls.slice(before).some(url => url.includes("get_tasks_list") || url.includes("/materials"))).toBe(false);
});
