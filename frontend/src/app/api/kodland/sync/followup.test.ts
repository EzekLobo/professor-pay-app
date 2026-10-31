import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
const token = `header.${Buffer.from(JSON.stringify({ user_id: 22 })).toString("base64url")}.signature`;
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
function mockProvider({ attendanceFails = false } = {}) {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const calls: string[] = [];
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input); calls.push(url);
    if (url.includes("identitytoolkit")) return Response.json({ users: [{ localId: "teacher" }] });
    if (url.includes("/login")) return Response.json({ access_token: token });
    if (url.includes("get_teachers_groups")) return Response.json({ results: [{ id: "g", title: "Python", course: { id: "course" }, archived: false }], next: null });
    if (url.includes("/lessons/")) return Response.json(url.includes("page=2") ? [] : [{ lesson_id: "l", lesson_passed: true }]);
    if (url.includes("get_group_progress")) return Response.json({ lesson_tasks: [{ id: "t", title: "Projeto" }], students_progress: [{ student_id: "s", student_name: "Ana", tasks_data: [{ task_id: "t", task_status_key: "TASK_NOT_SUBMITTED" }] }] });
    if (url.includes("attendance") || url.includes("get_students_main_data")) return attendanceFails ? Response.json({}, { status: 404 }) : Response.json([{ student_id: "s", student_name: "Ana", lesson_id: "l", lesson_date: "2026-10-31", status: "ABSENT" }]);
    throw new Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetch); return calls;
}
const request = () => new NextRequest("https://example.test/api/kodland/sync", { method: "POST", headers: { authorization: "Bearer token", "content-type": "application/json" }, body: JSON.stringify({ username: "fixture", password: "fixture", mode: "corrections", refresh_schedule: false, correction_group_ids: ["g"] }) });
describe("consulta automática de acompanhamento", () => {
  it("traz progresso não entregue e falta sem consultar perfis, cursos ou materiais", async () => {
    const calls = mockProvider(); const response = await POST(request());
    expect(response.status).toBe(200);
    const data = await response.json(); expect(data.task_progress).toMatchObject([{ external_student_id: "s", state: "missing", task_title: "Projeto" }]);
    expect(data.attendance).toMatchObject([{ external_student_id: "s", status: "ABSENT" }]);
    expect(data.lessons).toEqual([]); expect(data.review_group_ids).toEqual(["g"]);
    expect(calls.some(url => /schedule_view|\/courses\/|\/profile|\/materials/.test(url))).toBe(false);
  });
  it("não transforma falha de todas as fontes de presença em ausência de registros", async () => {
    mockProvider({ attendanceFails: true }); const response = await POST(request());
    expect(response.status).toBeGreaterThanOrEqual(500); expect(await response.json()).not.toHaveProperty("attendance");
  });
});
