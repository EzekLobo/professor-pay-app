import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function provider(balance: unknown, fail = false) {
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test");
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  const fetch = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes("identitytoolkit")) return Response.json({ users: [{ localId: "teacher" }] });
    if (url.includes("/login")) return Response.json({ access_token: `header.${Buffer.from(JSON.stringify({ user_id: 22 })).toString("base64url")}.signature` });
    if (url.includes("get_teachers_groups")) return Response.json({ results: [{ id: "g", title: "Roblox", course: { id: "1192" } }], next: null });
    if (url.includes("get_students_main_data")) return Response.json([{ main_info: { student_id: "s", full_name: "Ana Silva", status: "active" }, progress_info: [] }]);
    if (url.includes("get_general_info_for_student_backoffice_page")) return Response.json({ student_first_name: "Ana", student_last_name: "Silva", parent_phone: "5511999991234", student_phone: "5511988884321" });
    // Match production: the wallet is a v1 endpoint, while v2 returns 404.
    if (url.includes("/api/v2/balance/")) return Response.json({}, { status: 404 });
    if (url.includes("/api/v1/balance/")) return fail ? Response.json({}, { status: 403 }) : Response.json(balance);
    throw new Error(`Unexpected endpoint: ${url}`);
  });
  vi.stubGlobal("fetch", fetch);
  return fetch;
}
const request = (ids?: string[]) => new NextRequest("https://example.test/api/kodland/sync", { method: "POST", headers: { authorization: "Bearer fixture", "content-type": "application/json" }, body: JSON.stringify({ username: "fixture", password: "fixture", mode: "profiles", profile_student_ids: ids }) });

it.each([0, 12, -2])("returns the official default wallet balance %s in the student record", async balance => {
  const fetch = provider({ results: [{ lesson_type: "DEFAULT_LESSON", balance: String(balance) }] });
  const response = await POST(request());
  expect(response.status).toBe(200);
  expect((await response.json()).students).toMatchObject([{ external_id: "s", phone: "5511999991234", lesson_credits_remaining: balance, lesson_credits_updated_at: expect.any(String) }]);
  expect(fetch.mock.calls.some(([url]) => String(url) === "https://backoffice.kodland.org/api/v1/balance/?id=s&lesson_type=DEFAULT_LESSON")).toBe(true);
  expect(fetch.mock.calls.some(([url]) => String(url).includes("/api/v2/balance/"))).toBe(false);
});

it("reports a wallet request failure instead of claiming that profiles were updated", async () => {
  provider(null, true);
  const response = await POST(request());
  expect(response.status).toBeGreaterThanOrEqual(400);
  expect(await response.json()).not.toHaveProperty("students");
});

it("limits contact and wallet calls to selected student IDs", async () => {
  const fetch = provider({ balance: 2 });
  const response = await POST(request(["another-student"]));
  expect(response.status).toBe(200);
  expect((await response.json()).students).toEqual([]);
  expect(fetch.mock.calls.some(([url]) => /balance|general_info_for_student/.test(String(url)))).toBe(false);
});
it("rejects an invalid profile selection", async () => {
  provider({ balance: 2 });
  expect((await POST(request(["../invalid"])) ).status).toBe(400);
});
