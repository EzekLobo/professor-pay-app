import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
const token = `header.${Buffer.from(JSON.stringify({ user_id: 22 })).toString("base64url")}.signature`;
const request = (periodId?: string) => new NextRequest("https://example.test/api/kodland/sync", {
  method: "POST", headers: { authorization: "Bearer firebase-token", "content-type": "application/json" },
  body: JSON.stringify({ username: "tutor", password: "secret", mode: "payroll", payroll_period_id: periodId }),
});

describe("read-only payroll endpoint", () => {
  it("derives teacher from authenticated SSO and rejects a period outside the authorized list", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ users: [{ localId: "nexus-user" }] }))
      .mockResolvedValueOnce(Response.json({ access_token: token }))
      .mockResolvedValueOnce(Response.json({ enabled: true, enabled_for_user: true }))
      .mockResolvedValueOnce(Response.json([{ id: 12, teacher: 22 }]));
    vi.stubGlobal("fetch", fetch);
    const response = await POST(request("someone-elses-period"));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "payroll_not_authorized" });
    expect(String(fetch.mock.calls[3][0])).toContain("teacher_id=22");
    expect(fetch).toHaveBeenCalledTimes(4);
  });
  it("returns unavailable without listing other tutors when feature access is disabled", async () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_API_KEY", "test");
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    const fetch = vi.fn()
      .mockResolvedValueOnce(Response.json({ users: [{ localId: "nexus-user" }] }))
      .mockResolvedValueOnce(Response.json({ access_token: token }))
      .mockResolvedValueOnce(Response.json({ enabled: true, enabled_for_user: false }));
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request())).status).toBe(403);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
